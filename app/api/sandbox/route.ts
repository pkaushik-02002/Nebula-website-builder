import { Sandbox } from "@e2b/code-interpreter"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { decryptEnvVars } from "@/lib/encrypt-env"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type InputFile = { path: string; content: string }

const PROJECT_DIR = "/home/user/project"
const DEV_LOG_PATH = `${PROJECT_DIR}/.dev.log`
const DEV_PID_PATH = `${PROJECT_DIR}/.dev.pid`
const DEV_PORT = 3000
const SANDBOX_TTL_MS = 55 * 60 * 1000
const MAX_WAIT_SEC = 150
const PORT_CLEANUP_WAIT_MS = 5000
const LOG_POLL_INTERVAL_MS = 1500

interface ReadinessCheckResult {
  ready: boolean
  reason?: string
  logs?: string
}

function ndjson(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  obj: any,
) {
  controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
}

async function safeMakeDir(sandbox: Sandbox, dir: string) {
  try {
    await sandbox.files.makeDir(dir)
  } catch {}
}

async function cmd(sandbox: Sandbox, command: string, timeoutMs: number) {
  return sandbox.commands.run(command, { timeoutMs })
}

async function readTail(sandbox: Sandbox, path: string, lines = 200) {
  try {
    const result = await sandbox.files.read(path)
    const allLines = result.toString().split("\n")
    return allLines.slice(-lines).join("\n")
  } catch {
    return ""
  }
}

async function readFileMaybe(sandbox: Sandbox, path: string): Promise<string> {
  try {
    return await sandbox.files.read(path).then(r => r.toString())
  } catch {
    return ""
  }
}

async function pidAlive(sandbox: Sandbox, pid: string): Promise<boolean> {
  try {
    const result = await cmd(sandbox, `kill -0 ${pid} 2>/dev/null && echo "ALIVE" || echo "DEAD"`, 5000)
    return result.stdout?.trim() === "ALIVE"
  } catch {
    return false
  }
}

async function portListening(sandbox: Sandbox, port: number): Promise<boolean> {
  try {
    const result = await cmd(
      sandbox,
      `bash -c '
        if command -v ss >/dev/null 2>&1; then
          ss -tln 2>/dev/null | grep -q ":${port}[^0-9]" && echo "LISTEN" && exit 0
        fi
        if command -v lsof >/dev/null 2>&1; then
          lsof -iTCP:${port} -sTCP:LISTEN -n -P 2>/dev/null | grep -q . && echo "LISTEN" && exit 0
        fi
        echo "NO"
      '`,
      5000
    )
    return result.stdout?.trim() === "LISTEN"
  } catch {
    return false
  }
}

/** Get PID of the process listening on the given port, or empty string. */
async function getListeningPid(sandbox: Sandbox, port: number): Promise<string> {
  try {
    const result = await cmd(
      sandbox,
      `bash -c '
        if command -v lsof >/dev/null 2>&1; then
          lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null | head -1
          exit 0
        fi
        if command -v ss >/dev/null 2>&1; then
          ss -tlnp 2>/dev/null | grep ":${port}[^0-9]" | head -1 | sed -n "s/.*pid=\\([0-9]*\\).*/\\1/p"
          exit 0
        fi
      '`,
      5000
    )
    const pid = (result.stdout || "").trim()
    return pid && /^\d+$/.test(pid) ? pid : ""
  } catch {
    return ""
  }
}

function normalizeLogLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase()
}

function devLogShowsReady(log: string, port: number): boolean {
  if (!log || !log.trim()) return false
  const normalized = normalizeLogLine(log)
  const lines = log.split(/\r?\n/)
  
  const readyPatterns = [
    /ready\s+in\s+\d+/i,
    /local:\s*http/i,
    /localhost:\d+/i,
    /127\.0\.0\.1:\d+/i,
    /vite.*ready/i,
    /started\sserver/i,
    /ready\s+on/i,
    /network:\s*http/i,
  ]
  
  for (const line of lines) {
    const n = normalizeLogLine(line)
    if (!n) continue
    for (const pattern of readyPatterns) {
      if (pattern.test(n)) return true
    }
    if (n.includes(`:${port}`) && (n.includes("http") || n.includes("ready"))) return true
  }
  return false
}

async function previewUrlResponding(
  sandbox: Sandbox,
  port: number
): Promise<{ responding: boolean; statusCode?: number; error?: string }> {
  try {
    const url = `https://${sandbox.getHost(port)}/`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "text/html" },
    })
    
    clearTimeout(timeout)
    
    const isOk = response.ok || response.status === 404 || (response.status >= 400 && response.status < 600)
    return {
      responding: isOk,
      statusCode: response.status,
    }
  } catch (err: any) {
    return {
      responding: false,
      error: err?.name === "AbortError" ? "timeout" : err?.message || "unknown",
    }
  }
}

function parsePackageJsonText(txt: string): any {
  try {
    return JSON.parse(txt)
  } catch {
    return null
  }
}

function inferFramework(pkg: any): "next" | "vite" | "unknown" {
  if (!pkg) return "unknown"
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  if (deps?.next) return "next"
  if (deps?.vite) return "vite"
  return "unknown"
}

async function ensureViteAllowedHosts(sandbox: Sandbox): Promise<void> {
  const configPaths = [
    `${PROJECT_DIR}/vite.config.ts`,
    `${PROJECT_DIR}/vite.config.js`,
    `${PROJECT_DIR}/vite.config.mjs`,
    `${PROJECT_DIR}/vite.config.mts`,
    `${PROJECT_DIR}/vite.config.cjs`,
  ]
  
  for (const configPath of configPaths) {
    try {
      const content = await readFileMaybe(sandbox, configPath)
      if (!content) continue
      
      if (content.includes("allowedHosts")) continue
      
      let patched = content
      // allowedHosts: true for E2B proxy; hmr.overlay: false so build errors don't block the preview iframe
      const serverAdditions = "allowedHosts: true, hmr: { overlay: false }"
      
      // Try to add to existing server config
      if (content.includes("server:")) {
        // Match server: { ... } (first brace-balanced block so we don't break nested { })
        if (/server\s*:\s*\{/.test(content)) {
          if (content.includes("server: {")) {
            patched = content.replace(
              /(server\s*:\s*\{)([^\}]*)?(\})/,
              (match, open, middle, close) => {
                const existing = (middle || "").trimEnd()
                // Avoid producing ", allowedHosts" at start of a line (invalid TS): put comma only after last character of existing content
                const prefix = existing === "" ? " " : (existing.endsWith(",") ? " " : ", ")
                return `${open}${existing}${prefix}${serverAdditions} ${close}`
              }
            )
          }
        }
      } else {
        // No server config, add one before the closing of defineConfig or export default
        const serverConfig = `server: { ${serverAdditions} }`
        
        if (content.includes("export default defineConfig(")) {
          patched = content.replace(
            /(export default defineConfig\(\s*\{)/,
            `$1\n  ${serverConfig},`
          )
        } else if (content.includes("export default {")) {
          patched = content.replace(
            /(export default\s*\{)/,
            `$1\n  ${serverConfig},`
          )
        } else if (content.includes("export default")) {
          // Last resort: add at the beginning
          patched = content.replace(
            /(export default\s+)/,
            `$1{\n  ${serverConfig},\n  `
          )
          // Close the object if needed
          if (!patched.endsWith("}")) {
            patched = patched + "\n}"
          }
        }
      }
      
      if (patched !== content) {
        await sandbox.files.write(configPath, patched)
        console.log(`[sandbox] Patched ${configPath} with allowedHosts and hmr.overlay: false`)
        break
      }
    } catch (e) {
      console.warn(`[sandbox] Failed to patch ${configPath}:`, e)
    }
  }
}

function buildDevStartScript(framework: "next" | "vite" | "unknown"): string {
  const lines: string[] = [
    "#!/bin/bash",
    "set +e",
    "set -o pipefail",
    `cd "${PROJECT_DIR}" || { echo "START_ERROR: Cannot cd to project dir" >> "${DEV_LOG_PATH}" 2>&1; exit 1; }`,
    `rm -f "${DEV_LOG_PATH}" "${DEV_PID_PATH}" 2>/dev/null`,
    `echo "START: Dev server launch started at $(date)" >> "${DEV_LOG_PATH}"`,
    `echo "START: Framework detected: ${framework}" >> "${DEV_LOG_PATH}"`,
    "export FORCE_COLOR=1",
    "export NODE_OPTIONS='--no-warnings'",
  ]

  if (framework === "next") {
    lines.push(
      `echo "START: Launching Next.js dev server on port ${DEV_PORT}..." >> "${DEV_LOG_PATH}"`,
      `nohup npx next dev -H 0.0.0.0 -p ${DEV_PORT} > "${DEV_LOG_PATH}" 2>&1 &`,
      `echo $! > "${DEV_PID_PATH}"`,
      "disown",
      `echo "START: Next.js launched with PID $(cat "${DEV_PID_PATH}")" >> "${DEV_LOG_PATH}"`,
    )
  } else if (framework === "vite") {
    lines.push(
      `echo "START: Launching Vite dev server on port ${DEV_PORT}..." >> "${DEV_LOG_PATH}"`,
      `nohup npx vite --host 0.0.0.0 --port ${DEV_PORT} --strictPort > "${DEV_LOG_PATH}" 2>&1 &`,
      `echo $! > "${DEV_PID_PATH}"`,
      "disown",
      `echo "START: Vite launched with PID $(cat "${DEV_PID_PATH}")" >> "${DEV_LOG_PATH}"`,
    )
  } else {
    // Unknown - try Vite first, then Next.js, then generic
    lines.push(
      `echo "START: Unknown framework, attempting Vite first..." >> "${DEV_LOG_PATH}"`,
      `(nohup npx vite --host 0.0.0.0 --port ${DEV_PORT} --strictPort > "${DEV_LOG_PATH}" 2>&1 &)`,
      "PID=$!",
      "sleep 1",
      `if kill -0 $PID 2>/dev/null; then`,
      `  echo $PID > "${DEV_PID_PATH}"`,
      `  disown $PID`,
      `  echo "START: Vite started with PID $PID" >> "${DEV_LOG_PATH}"`,
      `else`,
      `  echo "START: Vite failed, trying Next.js..." >> "${DEV_LOG_PATH}"`,
      `  nohup npx next dev -H 0.0.0.0 -p ${DEV_PORT} > "${DEV_LOG_PATH}" 2>&1 &`,
      `  PID=$!`,
      `  echo $PID > "${DEV_PID_PATH}"`,
      `  disown $PID`,
      `  echo "START: Next.js started with PID $PID" >> "${DEV_LOG_PATH}"`,
      `fi`,
    )
  }

  lines.push(
    "sleep 2",
    `echo "START: Script completed" >> "${DEV_LOG_PATH}"`,
    "exit 0"
  )

  return lines.join("\n")
}

async function tryExtendTimeout(sandbox: Sandbox) {
  try {
    await sandbox.setTimeout(SANDBOX_TTL_MS)
  } catch (e) {
    console.warn("[sandbox] Failed to extend timeout:", e)
  }
}

async function validateNodeModules(sandbox: Sandbox): Promise<boolean> {
  try {
    const result = await cmd(
      sandbox,
      `test -d ${PROJECT_DIR}/node_modules/react || test -d ${PROJECT_DIR}/node_modules/next || test -d ${PROJECT_DIR}/node_modules/vite && echo "EXISTS" || echo "NO"`,
      5000
    )
    return result.stdout?.trim() === "EXISTS"
  } catch {
    return false
  }
}

async function checkServerReady(
  sandbox: Sandbox,
  port: number,
  framework: "next" | "vite" | "unknown"
): Promise<ReadinessCheckResult> {
  const devLog = await readTail(sandbox, DEV_LOG_PATH, 100)
  const logReady = devLogShowsReady(devLog, port)
  const portReady = await portListening(sandbox, port)
  
  console.log(`[checkServerReady] framework=${framework}, logReady=${logReady}, portReady=${portReady}`)
  
  // Try URL check
  const urlCheck = await previewUrlResponding(sandbox, port)
  
  if (urlCheck.responding) {
    return { ready: true, reason: "url-responding", logs: devLog }
  }
  
  // For Next.js: sometimes needs more time
  if (framework === "next" && portReady) {
    if (logReady) {
      // Give it a bit more time
      await new Promise(r => setTimeout(r, 3000))
      const recheck = await previewUrlResponding(sandbox, port)
      if (recheck.responding) {
        return { ready: true, reason: "next-delayed", logs: devLog }
      }
    }
  }
  
  // For Vite: log ready + port listening is usually sufficient
  if (framework === "vite" && portReady && logReady) {
    // Quick URL recheck
    await new Promise(r => setTimeout(r, 1000))
    const recheck = await previewUrlResponding(sandbox, port)
    if (recheck.responding) {
      return { ready: true, reason: "vite-ready", logs: devLog }
    }
  }
  
  return { ready: false, logs: devLog }
}

async function cleanupPort(sandbox: Sandbox, port: number): Promise<void> {
  // Kill any existing processes on the port (best-effort; ignore termination/signal errors)
  try {
    await cmd(
      sandbox,
      `bash -c '
      [ -f "${DEV_PID_PATH}" ] && kill -9 $(cat "${DEV_PID_PATH}" 2>/dev/null) 2>/dev/null || true
      lsof -ti tcp:${port} 2>/dev/null | xargs kill -9 2>/dev/null || true
      fuser -k -n tcp ${port} 2>/dev/null || true
      pkill -f "vite.*--port ${port}" 2>/dev/null || true
      pkill -f "next.*dev.*${port}" 2>/dev/null || true
      rm -f "${DEV_PID_PATH}" "${DEV_LOG_PATH}"
      true
    '`,
      10000
    )
  } catch (e: any) {
    // Cleanup is best-effort; if the command was terminated (e.g. SIGTERM), continue
    if (e?.message?.includes("signal: terminated") || e?.message?.includes("CommandExitError")) {
      console.warn("[cleanupPort] Cleanup command terminated, continuing:", e.message)
    } else {
      console.warn("[cleanupPort] Cleanup failed (non-fatal):", e?.message ?? e)
    }
    return
  }

  // Wait for port to be released with exponential backoff
  for (let i = 0; i < 5; i++) {
    const waitTime = Math.min(1000 * Math.pow(1.5, i), 5000)
    await new Promise(r => setTimeout(r, waitTime))
    const isListening = await portListening(sandbox, port)
    if (!isListening) {
      console.log(`[cleanupPort] Port ${port} is free after ${i + 1} attempts`)
      return
    }
  }

  // Final force kill (best-effort)
  try {
    await cmd(sandbox, `fuser -k -9 -n tcp ${port} 2>/dev/null || true`, 5000)
    await new Promise(r => setTimeout(r, 1000))
  } catch {
    // Ignore; we already tried to free the port
  }
}

function sanitizeEnvVar(key: string, value: string): { key: string; value: string } | null {
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) return null
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  return { key, value: escaped }
}

/** Visual edit client script: adds data-bstudio-id to elements, posts hover/select to parent for overlay + "Edit with AI". */
const VISUAL_EDIT_SCRIPT = `
(function() {
  var idCounter = 0;
  function addIds(root) {
    if (!root || root.nodeType !== 1) return;
    if (!root.hasAttribute || root.hasAttribute('data-bstudio-id')) return;
    root.setAttribute('data-bstudio-id', 'bstudio-' + (idCounter++));
    var c = root.firstChild;
    while (c) { addIds(c); c = c.nextSibling; }
  }
  function run() {
    addIds(document.body);
  }
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(n) {
        if (n.nodeType === 1) addIds(n);
      });
    });
  });
  document.addEventListener('DOMContentLoaded', function() {
    obs.observe(document.body, { childList: true, subtree: true });
  });
  window.bstudio = {
    onHover: function(id, rect) {
      window.parent.postMessage({
        type: 'preview-hover',
        id: id,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight }
      }, '*');
    },
    onSelect: function(id, rect, desc) {
      window.parent.postMessage({
        type: 'preview-select',
        id: id,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        description: desc || null
      }, '*');
    }
  };
  var lastHover = null;
  document.addEventListener('mousemove', function(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-bstudio-id]') : null;
    if (el && el.getAttribute('data-bstudio-id') !== lastHover) {
      lastHover = el.getAttribute('data-bstudio-id');
      var r = el.getBoundingClientRect();
      window.bstudio.onHover(lastHover, { x: r.left, y: r.top, width: r.width, height: r.height });
    }
  }, true);
  document.addEventListener('click', function(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-bstudio-id]') : null;
    if (el) {
      e.preventDefault();
      e.stopPropagation();
      var r = el.getBoundingClientRect();
      var txt = (el.textContent || '').trim().slice(0, 80);
      var desc = (el.tagName || 'element') + (txt ? ' "' + txt + '"' : '');
      var id = el.getAttribute('data-bstudio-id');
      var content = (el.textContent || '').trim();
      var cs = window.getComputedStyle(el);
      var styles = {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        textAlign: cs.textAlign,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        fontStyle: cs.fontStyle,
        textDecoration: cs.textDecoration,
        textTransform: cs.textTransform,
        opacity: cs.opacity,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        borderColor: cs.borderColor,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow
      };
      window.parent.postMessage({
        type: 'preview-select',
        id: id,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        description: desc,
        snapshot: { content: content, styles: styles }
      }, '*');
    }
  }, true);
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d.type !== 'bstudio-apply-design' || !d.id) return;
    var el = document.querySelector('[data-bstudio-id="' + d.id + '"]');
    if (!el) return;
    if (d.payload) {
      if (d.payload.content !== undefined) el.textContent = d.payload.content;
      if (d.payload.styles && typeof d.payload.styles === 'object') {
        for (var k in d.payload.styles) {
          var v = d.payload.styles[k];
          if (v === undefined || v === '') el.style.removeProperty(k.replace(/([A-Z])/g, '-$1').toLowerCase());
          else el.style[k] = v;
        }
      }
    }
  });
})();
`

async function injectVisualEditScript(sandbox: Sandbox): Promise<void> {
  const indexPath = `${PROJECT_DIR}/index.html`
  try {
    const content = await readFileMaybe(sandbox, indexPath)
    if (!content || !content.includes("</body>")) return
    // Ensure script content never contains literal </script> so the HTML parser doesn't close early
    const scriptEscaped = VISUAL_EDIT_SCRIPT.replace(/<\/script/gi, "<\\/script")
    // Use proper closing tag so parse5/HTML parser sees end of script (do not use <\/script> in file)
    const scriptClose = "</scr" + "ipt>"
    const injected = content.replace(
      "</body>",
      `<script>${scriptEscaped}${scriptClose}\n</body>`
    )
    if (injected === content) return
    await sandbox.files.write(indexPath, injected)
    console.log("[sandbox] Injected visual-edit client script into index.html")
  } catch (e) {
    console.warn("[sandbox] Could not inject visual-edit script:", e)
  }
}

export async function POST(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json({ error: "E2B API key not configured" }, { status: 500 })
  }

  let files: InputFile[] = []
  let sandboxId: string | undefined
  let projectId: string | undefined
  let injectVisualEdit = true

  try {
    const body = await req.json()
    files = body?.files
    sandboxId = body?.sandboxId
    projectId = typeof body?.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined
    if (body && typeof body.injectVisualEdit === "boolean") injectVisualEdit = body.injectVisualEdit
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(files)) {
    return Response.json({ error: "'files' must be an array" }, { status: 400 })
  }

  if (!files.some((f) => f?.path === "package.json")) {
    return Response.json({ error: "Missing package.json at repository root." }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => ndjson(controller, encoder, obj)

      let heartbeatInterval: NodeJS.Timeout | null = null
      const startHeartbeat = () => {
        heartbeatInterval = setInterval(() => {
          try { send({ type: "ping", ts: Date.now() }) } catch {}
        }, 10000)
      }
      
      const stopHeartbeat = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval)
      }

      let streamClosed = false
      const finish = () => {
        if (streamClosed) return
        streamClosed = true
        stopHeartbeat()
        try { controller.close() } catch {}
      }

      const emitTerminalError = (payload: {
        error: string
        logs?: { dev?: string; install?: string }
        failureCategory?: string
        failureReason?: string
      }) => {
        if (streamClosed) return
        send({
          type: "error",
          error: payload.error,
          logs: payload.logs ?? {},
          failureCategory: payload.failureCategory ?? "unknown",
          failureReason: payload.failureReason ?? null,
        })
        finish()
      }

      const emitSuccess = (url: string, sandboxId: string, warning?: string) => {
        if (streamClosed) return
        send({ type: "step", step: "dev", status: "success", message: "Preview ready" })
        send({ type: "success", url, sandboxId, warning })
        finish()
      }

      let sandbox: Sandbox | null = null
      let cleanupScheduled = false

      const cleanupOnAbort = async () => {
        if (cleanupScheduled) return
        cleanupScheduled = true
        stopHeartbeat()
        if (sandbox && !streamClosed) {
          try { await sandbox.kill() } catch {}
        }
      }

      try {
        req.signal.addEventListener("abort", cleanupOnAbort)
        startHeartbeat()

        const opts = {
          apiKey: process.env.E2B_API_KEY,
          timeoutMs: SANDBOX_TTL_MS,
        }

        // Try to reconnect to existing sandbox or create new one
        if (sandboxId) {
          const maxRetries = 3
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              sandbox = await Sandbox.connect(sandboxId, opts)
              send({ type: "step", step: "connect", status: "success", message: "Reconnected to existing sandbox" })
              break
            } catch (err: any) {
              console.warn(`[sandbox] Reconnect attempt ${attempt} failed:`, err?.message)
              if (attempt === maxRetries) {
                send({ type: "step", step: "connect", status: "info", message: "Could not reconnect — creating new sandbox" })
              } else {
                await new Promise(r => setTimeout(r, 1000 * attempt))
              }
            }
          }
        }
        
        if (!sandbox) {
          // Kill previous sandbox for this project if exists
          if (projectId) {
            try {
              const projSnap = await adminDb.collection("projects").doc(projectId).get()
              const prevSandboxId = projSnap.exists ? (projSnap.data() as { sandboxId?: string })?.sandboxId : undefined
              if (prevSandboxId && prevSandboxId !== sandboxId) {
                try {
                  const killOpts = { apiKey: process.env.E2B_API_KEY!, timeoutMs: 60_000 }
                  const old = await Sandbox.connect(prevSandboxId, killOpts)
                  await old.kill()
                  await new Promise((r) => setTimeout(r, 500))
                  console.log(`[sandbox] Killed previous sandbox ${prevSandboxId}`)
                } catch (e) {
                  console.warn("[sandbox] Failed to kill previous sandbox:", e)
                }
              }
            } catch (e) {
              console.warn("[sandbox] Error checking previous sandbox:", e)
            }
          }

          try {
            sandbox = await Sandbox.create("base", opts)
            console.log(`[sandbox] Created new sandbox: ${sandbox.sandboxId}`)
          } catch (createErr: any) {
            const msg = createErr?.message ?? ""
            console.error("[sandbox] Create failed:", msg)
            if (/concurrent|maximum|rate limit|20/i.test(msg)) {
              emitTerminalError({
                error: "E2B sandbox limit reached (max 20). Close other project tabs or wait a moment, then try again.",
                failureCategory: "infra",
                failureReason: "Sandbox limit",
              })
              return
            }
            throw createErr
          }
        }

        if (!sandbox) {
          emitTerminalError({ error: "Failed to get sandbox", failureCategory: "infra", failureReason: "Sandbox unavailable" })
          return
        }

        await tryExtendTimeout(sandbox)

        send({ type: "step", step: "write", status: "running", message: "Writing files..." })
        
        await safeMakeDir(sandbox, PROJECT_DIR)
        await cmd(sandbox, `chmod -R u+rwX "${PROJECT_DIR}"`, 5000).catch(() => {})

        const hasUserEnvFile = files.some(f => f.path === ".env" || f.path === ".env.local")
        
        // Write all files
        for (const file of files) {
          const fullPath = `${PROJECT_DIR}/${file.path}`
          const lastSlash = fullPath.lastIndexOf("/")
          if (lastSlash > 0) {
            const dir = fullPath.slice(0, lastSlash)
            await safeMakeDir(sandbox, dir)
          }
          await sandbox.files.write(fullPath, file.content)
        }

        // Visual edit: inject client script only for live preview (skip when building for deploy)
        if (injectVisualEdit) await injectVisualEditScript(sandbox)
        
        send({ type: "step", step: "write", status: "success", message: "Files written" })

        // Handle environment variables
        if (projectId && !hasUserEnvFile) {
          try {
            await requireUserUid(req)
            const snap = await adminDb.collection("projects").doc(projectId).get()
            const encrypted = snap.exists ? (snap.data() as { envVarsEncrypted?: string })?.envVarsEncrypted : undefined
            if (encrypted) {
              const plain = decryptEnvVars(encrypted)
              const envVars: Record<string, string> = JSON.parse(plain)
              const sanitizedLines: string[] = []
              for (const [k, v] of Object.entries(envVars)) {
                const sanitized = sanitizeEnvVar(k, v)
                if (sanitized) sanitizedLines.push(`${sanitized.key}="${sanitized.value}"`)
              }
              if (sanitizedLines.length > 0) {
                await sandbox.files.write(`${PROJECT_DIR}/.env`, sanitizedLines.join("\n") + "\n")
                console.log(`[sandbox] Wrote ${sanitizedLines.length} env vars`)
              }
            }
          } catch (e) {
            console.warn("[sandbox] Failed to inject env vars:", e)
          }
        }

        // Parse package.json and detect framework
        const pkgText = await readFileMaybe(sandbox, `${PROJECT_DIR}/package.json`)
        const pkg = parsePackageJsonText(pkgText)
        
        if (!pkg) {
          emitTerminalError({
            error: "Invalid or missing package.json",
            failureCategory: "config",
            failureReason: "Malformed package.json",
          })
          return
        }
        
        const framework = inferFramework(pkg)
        console.log(`[sandbox] Detected framework: ${framework}`)

        // Check for lock file changes
        const lockContent = 
          await readFileMaybe(sandbox, `${PROJECT_DIR}/package-lock.json`) || 
          await readFileMaybe(sandbox, `${PROJECT_DIR}/pnpm-lock.yaml`) ||
          await readFileMaybe(sandbox, `${PROJECT_DIR}/yarn.lock`)
        
        const currentLockHash = lockContent ? crypto.createHash("sha256").update(lockContent).digest("hex") : ""
        
        let lastLockHash: string | undefined
        if (projectId) {
          try {
            const projSnap = await adminDb.collection("projects").doc(projectId).get()
            lastLockHash = projSnap.exists ? (projSnap.data() as { lastLockHash?: string })?.lastLockHash : undefined
          } catch {}
        }
        
        const nodeModulesValid = await validateNodeModules(sandbox)
        const skipInstall = nodeModulesValid && currentLockHash && currentLockHash === lastLockHash

        if (skipInstall) {
          console.log("[sandbox] Skipping install, using cached node_modules")
          send({ type: "step", step: "install", status: "success", message: "Using cached dependencies" })
        } else {
          send({ type: "step", step: "install", status: "running", message: "Installing dependencies..." })
          
          const installCmd = `cd ${PROJECT_DIR} && npm install --legacy-peer-deps --no-audit --no-fund 2>&1`
          let installOutput = ""
          
          try {
            const install = await cmd(sandbox, installCmd, 300000) // 5 min timeout
            
            installOutput = `${install.stdout || ""}\n${install.stderr || ""}`.trim()
            
            // Stream logs
            if (install.stdout) {
              send({ type: "log", step: "install", stream: "stdout", data: install.stdout })
            }
            if (install.stderr) {
              send({ type: "log", step: "install", stream: "stderr", data: install.stderr })
            }
            
            if (install.exitCode !== 0 && install.exitCode !== undefined) {
              throw new Error(`npm install failed with exit code ${install.exitCode}`)
            }
            
            await new Promise(r => setTimeout(r, 150))
            send({ type: "step", step: "install", status: "success", message: "Dependencies installed" })
            
            if (projectId && currentLockHash) {
              try {
                await adminDb.collection("projects").doc(projectId).update({ lastLockHash: currentLockHash })
              } catch {}
            }
          } catch (installErr: any) {
            console.error("[sandbox] Install failed:", installErr)
            emitTerminalError({
              error: `Dependency installation failed: ${installErr.message}`,
              logs: { install: installOutput || installErr.message },
              failureCategory: "deps",
              failureReason: "npm install failed",
            })
            return
          }
        }

        // Configure Vite if needed
        if (framework === "vite") {
          try {
            await ensureViteAllowedHosts(sandbox)
          } catch (e) {
            console.warn("[sandbox] Failed to patch vite config:", e)
          }
        }

        // Clean up any existing processes on the port
        await cleanupPort(sandbox, DEV_PORT)

        // Create and run the dev server script (under PROJECT_DIR to avoid /tmp permission issues)
        const startScriptPath = `${PROJECT_DIR}/.start-dev.sh`
        const startScript = buildDevStartScript(framework)
        console.log("[sandbox] Dev script:\n", startScript)

        await sandbox.files.write(startScriptPath, startScript)
        await cmd(sandbox, `chmod +x "${startScriptPath}"`, 5000).catch(() => {})

        const devMessage = skipInstall
          ? `Starting ${framework} dev server...`
          : `Starting ${framework} dev server (first build may take longer)...`

        send({ type: "step", step: "dev", status: "running", message: devMessage })

        // Start the dev server (fire and forget)
        cmd(sandbox, `bash "${startScriptPath}"`, 0).catch((err) => {
          console.error("[sandbox] Dev start wrapper error (ignored):", err)
        })

        // Wait for PID file with timeout
        let pid = ""
        const pidStartTime = Date.now()
        while (Date.now() - pidStartTime < 15000) {
          pid = await readFileMaybe(sandbox, DEV_PID_PATH)
          if (pid) break
          await new Promise(r => setTimeout(r, 500))
        }

        if (!pid) {
          const earlyLog = await readTail(sandbox, DEV_LOG_PATH, 50)
          console.error("[sandbox] No PID file created. Log:", earlyLog)
          emitTerminalError({
            error: "Dev server failed to start (no PID file)",
            logs: { dev: earlyLog || "No output" },
            failureCategory: "build",
            failureReason: "Failed to launch",
          })
          return
        }

        console.log(`[sandbox] Dev server PID: ${pid}`)

        // Poll for readiness
        let lastLogSent = ""
        let warning: string | undefined
        
        for (let i = 1; i <= MAX_WAIT_SEC; i++) {
          if (streamClosed || req.signal.aborted) {
            console.log("[sandbox] Stream closed or aborted, exiting poll loop")
            return
          }

          // Extend timeout periodically
          if (i % 30 === 0) {
            await tryExtendTimeout(sandbox)
          }

          // Check if process is still alive
          const alive = await pidAlive(sandbox, pid)
          if (!alive) {
            const devLogs = await readTail(sandbox, DEV_LOG_PATH, 300)
            console.error("[sandbox] Dev server died. Logs:", devLogs)
            emitTerminalError({
              error: "Dev server exited unexpectedly",
              logs: { dev: devLogs || "No output" },
              failureCategory: "build",
              failureReason: "Process died",
            })
            return
          }

          // Send progress update
          if (i % 10 === 0 || i === 5) {
            const timeMsg = i > 60 
              ? `${Math.floor(i / 60)}m ${i % 60}s` 
              : `${i}s`
            send({
              type: "step",
              step: "dev",
              status: "running",
              message: `Starting dev server... ${timeMsg}`,
            })
          }

          // Check readiness
          const readyCheck = await checkServerReady(sandbox, DEV_PORT, framework)
          
          // Stream new logs
          if (readyCheck.logs && readyCheck.logs !== lastLogSent) {
            const newLogs = lastLogSent 
              ? readyCheck.logs.slice(lastLogSent.length) 
              : readyCheck.logs
            if (newLogs?.trim()) {
              send({ type: "log", step: "dev", stream: "stdout", data: newLogs })
            }
            lastLogSent = readyCheck.logs
          }

          if (readyCheck.ready) {
            // Require two successful URL checks (with delay) to avoid "Closed Port" in iframe
            await new Promise(r => setTimeout(r, 3000))
            const recheck1 = await previewUrlResponding(sandbox, DEV_PORT)
            if (!recheck1.responding) {
              console.log(`[sandbox] URL recheck 1 failed (${recheck1.error ?? recheck1.statusCode}), continuing to poll`)
              const pollInterval = i < 30 ? LOG_POLL_INTERVAL_MS : Math.min(LOG_POLL_INTERVAL_MS * 2, 5000)
              await new Promise(r => setTimeout(r, pollInterval))
              continue
            }
            await new Promise(r => setTimeout(r, 2000))
            const recheck2 = await previewUrlResponding(sandbox, DEV_PORT)
            if (!recheck2.responding) {
              console.log(`[sandbox] URL recheck 2 failed (${recheck2.error ?? recheck2.statusCode}), continuing to poll`)
              await new Promise(r => setTimeout(r, LOG_POLL_INTERVAL_MS))
              continue
            }

            console.log(`[sandbox] Server ready! Reason: ${readyCheck.reason}`)
            const url = `https://${sandbox.getHost(DEV_PORT)}`
            
            // Get final logs
            const finalLogs = await readTail(sandbox, DEV_LOG_PATH, 300)
            if (finalLogs && finalLogs !== lastLogSent) {
              const newLogs = lastLogSent ? finalLogs.slice(lastLogSent.length) : finalLogs
              if (newLogs?.trim()) {
                send({ type: "log", step: "dev", stream: "stdout", data: newLogs })
              }
            }

            // Add warning if it took a long time
            if (i > 60) {
              warning = "Preview is slow to start — you may want to simplify the project"
            }

            emitSuccess(url, sandbox.sandboxId, warning)
            return
          }

          const pollInterval = i < 30 ? LOG_POLL_INTERVAL_MS : Math.min(LOG_POLL_INTERVAL_MS * 2, 5000)
          await new Promise(r => setTimeout(r, pollInterval))
        }

        // Timeout reached
        const timeoutLogs = await readTail(sandbox, DEV_LOG_PATH, 300)
        console.error(`[sandbox] Timeout after ${MAX_WAIT_SEC}s. Logs:`, timeoutLogs)
        emitTerminalError({
          error: `Dev server did not become ready within ${MAX_WAIT_SEC}s. The build may be taking too long or there may be an error.`,
          logs: { dev: timeoutLogs || "No output" },
          failureCategory: "build",
          failureReason: "Timeout",
        })
        
      } catch (e: any) {
        console.error("[sandbox] Unhandled error:", e)
        emitTerminalError({
          error: e?.message || "Sandbox error",
          failureCategory: "unknown",
          failureReason: e?.name || "Unknown error",
        })
      } finally {
        req.signal.removeEventListener("abort", cleanupOnAbort)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

export async function PATCH(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json({ error: "E2B API key not configured" }, { status: 500 })
  }

  const { sandboxId } = await req.json()
  if (!sandboxId) return Response.json({ error: "sandboxId required" }, { status: 400 })

  const opts = {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: SANDBOX_TTL_MS,
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId, opts)
    await tryExtendTimeout(sandbox)
    return Response.json({ ok: true, sandboxId })
  } catch (err: any) {
    return Response.json({ 
      error: "Failed to extend sandbox timeout",
      details: err?.message 
    }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json({ error: "E2B API key not configured" }, { status: 500 })
  }

  const { sandboxId } = await req.json()
  if (!sandboxId) return Response.json({ error: "Sandbox ID required" }, { status: 400 })

  try {
    const opts = { apiKey: process.env.E2B_API_KEY, timeoutMs: 60_000 }
    const sandbox = await Sandbox.connect(sandboxId, opts)
    await sandbox.kill()
    return Response.json({ success: true })
  } catch (err: any) {
    // If we can't connect, it's probably already dead
    return Response.json({ success: true, note: "Sandbox may have already been terminated" })
  }
}