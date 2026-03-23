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

async function normalizePostcssConfigForPreview(sandbox: Sandbox): Promise<void> {
  const postcssPath = `${PROJECT_DIR}/postcss.config.js`
  const packageJsonPath = `${PROJECT_DIR}/package.json`

  const postcssContent = await readFileMaybe(sandbox, postcssPath)
  if (!postcssContent || !/^\s*export\s+default\b/m.test(postcssContent)) {
    return
  }

  let packageType = ""
  try {
    const pkg = JSON.parse(await readFileMaybe(sandbox, packageJsonPath))
    packageType = String(pkg?.type || "")
  } catch {}

  // Keep ESM config if project is explicitly ESM.
  if (packageType === "module") {
    return
  }

  const normalized = postcssContent.replace(/^\s*export\s+default\b/m, "module.exports =")
  if (normalized !== postcssContent) {
    await sandbox.files.write(postcssPath, normalized)
    console.log("[sandbox] Normalized postcss.config.js to CommonJS for preview runtime")
  }
}

function getFatalDevError(devLogs: string): { reason: string; category: "build" | "deps" | "env" } | null {
  const logs = devLogs || ""
  if (/Failed to load PostCSS config/i.test(logs) && /Unexpected token 'export'/i.test(logs)) {
    return { reason: "postcss-config-format", category: "build" }
  }
  if (/EADDRINUSE|address already in use/i.test(logs)) {
    return { reason: "port-in-use", category: "env" }
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|Module not found/i.test(logs)) {
    return { reason: "missing-module", category: "deps" }
  }
  return null
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

function isSandboxNotFoundError(error: unknown): boolean {
  const err = error as { name?: string; message?: string; statusCode?: number } | undefined
  const message = (err?.message || "").toLowerCase()
  return (
    err?.name === "NotFoundError" ||
    err?.statusCode === 404 ||
    message.includes("not found") ||
    message.includes("paused sandbox")
  )
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
    
    const body = (await response.text().catch(() => "")).toLowerCase()
    const looksClosedPort =
      body.includes("closed port error") ||
      body.includes("connection refused on port") ||
      body.includes("there's no service running on port") ||
      body.includes("there is no service running on port") ||
      body.includes("sandbox is running but there's no service running on port") ||
      body.includes("check the sandbox logs for more information")
    if (looksClosedPort) {
      return {
        responding: false,
        statusCode: response.status,
        error: "closed-port-page",
      }
    }

    const isOk = response.ok
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

async function localHttpResponding(sandbox: Sandbox, port: number): Promise<boolean> {
  try {
    const result = await cmd(
      sandbox,
      `bash -c '
        if command -v curl >/dev/null 2>&1; then
          code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:${port}/ || echo "000")
          [ "$code" != "000" ] && [ "$code" != "000000" ] && echo "OK" || echo "NO"
        else
          node -e "const http=require(\"http\");const r=http.get({host:\"127.0.0.1\",port:${port},path:\"/\",timeout:4000},(res)=>{console.log(\"OK\");res.resume();});r.on(\"error\",()=>console.log(\"NO\"));r.on(\"timeout\",()=>{r.destroy();console.log(\"NO\");});"
        fi
      '`,
      7000
    )
    return (result.stdout || "").includes("OK")
  } catch {
    return false
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

  let sawExistingConfig = false

  for (const configPath of configPaths) {
    try {
      const content = await readFileMaybe(sandbox, configPath)
      if (!content) continue
      sawExistingConfig = true

      if (content.includes("allowedHosts")) return

      let patched = content

      const injectedServer = `server: {
    host: "0.0.0.0",
    port: ${DEV_PORT},
    strictPort: true,
    allowedHosts: true,
    hmr: { overlay: false },
  }`

      if (/server\s*:\s*\{/.test(content)) {
        patched = content.replace(/server\s*:\s*\{[\s\S]*?\}/m, (serverBlock) => {
          const inner = serverBlock
            .replace(/^server\s*:\s*\{/, "")
            .replace(/\}$/, "")
            .trim()
            .replace(/\ballowedHosts\s*:\s*[^,}]+,?/g, "")
            .replace(/\bhmr\s*:\s*\{[\s\S]*?\},?/g, "")
            .replace(/\bhost\s*:\s*[^,}]+,?/g, "")
            .replace(/\bport\s*:\s*[^,}]+,?/g, "")
            .replace(/\bstrictPort\s*:\s*[^,}]+,?/g, "")
            .trim()

          const normalizedInner = inner
            ? `${inner.replace(/\n/g, "\n    ").replace(/,?\s*$/, ",")}\n    `
            : ""

          return `server: {\n    ${normalizedInner}host: "0.0.0.0",\n    port: ${DEV_PORT},\n    strictPort: true,\n    allowedHosts: true,\n    hmr: { overlay: false },\n  }`
        })
      } else if (/export\s+default\s+defineConfig\s*\(\s*\{/.test(content)) {
        patched = content.replace(/export\s+default\s+defineConfig\s*\(\s*\{/, (match) => `${match}\n  ${injectedServer},`)
      } else if (/defineConfig\s*\(\s*\{/.test(content)) {
        patched = content.replace(/defineConfig\s*\(\s*\{/, (match) => `${match}\n  ${injectedServer},`)
      } else if (/export\s+default\s*\{/.test(content)) {
        patched = content.replace(/export\s+default\s*\{/, (match) => `${match}\n  ${injectedServer},`)
      }

      if (patched !== content) {
        await sandbox.files.write(configPath, patched)
        console.log(`[sandbox] Patched ${configPath} with allowedHosts and hmr.overlay: false`)
        return
      }
    } catch (e) {
      console.warn(`[sandbox] Failed to patch ${configPath}:`, e)
    }
  }

  if (!sawExistingConfig) {
    const fallbackConfig = `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: ${DEV_PORT},
    strictPort: true,
    allowedHosts: true,
    hmr: { overlay: false },
  },
})
`
    await sandbox.files.write(`${PROJECT_DIR}/vite.config.ts`, fallbackConfig)
    console.log("[sandbox] Wrote fallback vite.config.ts with allowedHosts enabled")
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
  const localReady = await localHttpResponding(sandbox, port)
  
  console.log(`[checkServerReady] framework=${framework}, logReady=${logReady}, portReady=${portReady}, localReady=${localReady}`)

  if (localReady) {
    return { ready: true, reason: "local-http-responding", logs: devLog }
  }
  
  // Try URL check
  const urlCheck = await previewUrlResponding(sandbox, port)
  
  // Do not trust URL reachability alone; require at least one server signal.
  if (urlCheck.responding && (portReady || logReady)) {
    return { ready: true, reason: "url-responding-with-signal", logs: devLog }
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
  var sectionCounter = 0;
  var SECTION_SELECTOR = 'section, header, footer, nav, main > div, [data-bstudio-section]';
  function addIds(root) {
    if (!root || root.nodeType !== 1) return;
    if (!root.hasAttribute || root.hasAttribute('data-bstudio-id')) return;
    root.setAttribute('data-bstudio-id', 'bstudio-' + (idCounter++));
    var c = root.firstChild;
    while (c) { addIds(c); c = c.nextSibling; }
  }
  function run() {
    addIds(document.body);
    ensureSectionIds();
    postStructure();
  }
  function getKind(el) {
    if (!el || !el.tagName) return 'generic';
    var tag = String(el.tagName).toLowerCase();
    if (tag === 'header' || tag === 'nav') return 'header';
    if (tag === 'footer') return 'footer';
    var label = ((el.getAttribute('aria-label') || '') + ' ' + (el.className || '')).toLowerCase();
    if (/hero/.test(label)) return 'hero';
    if (/cta|call-to-action/.test(label)) return 'cta';
    if (/feature|benefit|pricing|testimonial|faq/.test(label)) return 'content';
    return 'generic';
  }
  function getLabel(el, index) {
    var aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
    if (aria && aria.trim()) return aria.trim();
    var heading = el.querySelector ? el.querySelector('h1, h2, h3') : null;
    if (heading && heading.textContent && heading.textContent.trim()) return heading.textContent.trim().slice(0, 48);
    var kind = getKind(el);
    if (kind === 'header') return 'Header';
    if (kind === 'footer') return 'Footer';
    if (kind === 'hero') return 'Hero';
    if (kind === 'cta') return 'Call to action';
    return 'Section ' + (index + 1);
  }
  function getSections() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(SECTION_SELECTOR));
    var filtered = nodes.filter(function(el) {
      if (!el || !el.getBoundingClientRect) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40) return false;
      if (el.closest && el.closest('[data-bstudio-section-id]') && !el.hasAttribute('data-bstudio-section-id')) return false;
      return true;
    });
    return filtered;
  }
  function ensureSectionIds() {
    var sections = getSections();
    sections.forEach(function(el) {
      if (!el.hasAttribute('data-bstudio-section-id')) {
        el.setAttribute('data-bstudio-section-id', 'bstudio-section-' + (sectionCounter++));
      }
    });
  }
  function postStructure() {
    ensureSectionIds();
    var sections = getSections().map(function(el, index) {
      return {
        id: el.getAttribute('data-bstudio-section-id'),
        kind: getKind(el),
        label: getLabel(el, index),
        index: index
      };
    });
    window.parent.postMessage({ type: 'preview-structure', sections: sections }, '*');
  }
  function getSectionForElement(el) {
    if (!el || !el.closest) return null;
    return el.closest('[data-bstudio-section-id]');
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
    postStructure();
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
      var sectionEl = getSectionForElement(el);
      var sectionId = sectionEl ? sectionEl.getAttribute('data-bstudio-section-id') : null;
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
        multi: !!(e.metaKey || e.ctrlKey),
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        description: desc,
        sectionId: sectionId,
        snapshot: { content: content, styles: styles }
      }, '*');
    }
  }, true);
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d) return;
    if (d.type === 'bstudio-apply-design' && d.id) {
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
      return;
    }
    if (d.type !== 'bstudio-structure-command' || !d.command) return;
    var cmd = d.command;
    ensureSectionIds();
    var sections = getSections();
    var section = cmd.sectionId
      ? document.querySelector('[data-bstudio-section-id="' + cmd.sectionId + '"]')
      : null;
    if (cmd.type === 'select-section' && section) {
      var rect = section.getBoundingClientRect();
      var sid = section.getAttribute('data-bstudio-id') || '';
      window.parent.postMessage({
        type: 'preview-select',
        id: sid,
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        description: 'section "' + getLabel(section, 0) + '"',
        sectionId: section.getAttribute('data-bstudio-section-id'),
        snapshot: { content: '', styles: {} }
      }, '*');
      section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!section && cmd.type !== 'insert-section') return;
    if (cmd.type === 'move-section') {
      var parent = section.parentElement;
      if (!parent) return;
      if (cmd.direction === 'up' && section.previousElementSibling) {
        parent.insertBefore(section, section.previousElementSibling);
      } else if (cmd.direction === 'down' && section.nextElementSibling) {
        parent.insertBefore(section.nextElementSibling, section);
      }
      postStructure();
      return;
    }
    if (cmd.type === 'reorder-section') {
      var owner = section.parentElement;
      if (!owner) return;
      var siblings = Array.prototype.slice.call(owner.children).filter(function(child) {
        return child.hasAttribute && child.hasAttribute('data-bstudio-section-id');
      });
      var to = Math.max(0, Math.min(Number(cmd.toIndex) || 0, siblings.length - 1));
      var target = siblings[to];
      if (!target || target === section) return;
      owner.insertBefore(section, to < siblings.indexOf(section) ? target : target.nextSibling);
      postStructure();
      return;
    }
    if (cmd.type === 'duplicate-section') {
      var clone = section.cloneNode(true);
      if (clone && clone.setAttribute) {
        clone.setAttribute('data-bstudio-section-id', 'bstudio-section-' + (sectionCounter++));
      }
      section.parentElement.insertBefore(clone, section.nextSibling);
      addIds(clone);
      postStructure();
      return;
    }
    if (cmd.type === 'delete-section') {
      if (sections.length <= 1) return;
      section.remove();
      postStructure();
      return;
    }
    if (cmd.type === 'insert-section') {
      var after = cmd.afterSectionId ? document.querySelector('[data-bstudio-section-id="' + cmd.afterSectionId + '"]') : null;
      var parentNode = after ? after.parentElement : document.body;
      if (!parentNode) return;
      var newSection = document.createElement('section');
      newSection.setAttribute('data-bstudio-section-id', 'bstudio-section-' + (sectionCounter++));
      newSection.style.padding = '56px 24px';
      newSection.style.borderTop = '1px solid #e6e6e1';
      newSection.style.borderBottom = '1px solid #e6e6e1';
      var title = document.createElement('h2');
      title.style.fontSize = '32px';
      title.style.margin = '0 0 12px';
      title.style.color = '#18181b';
      title.textContent =
        cmd.variant === 'hero' ? 'New hero section' :
        cmd.variant === 'features' ? 'New features section' :
        cmd.variant === 'cta' ? 'New call to action' :
        'New section';
      var body = document.createElement('p');
      body.style.margin = '0';
      body.style.fontSize = '16px';
      body.style.color = '#52525b';
      body.textContent = 'Describe what this section should communicate.';
      newSection.appendChild(title);
      newSection.appendChild(body);
      if (after) parentNode.insertBefore(newSection, after.nextSibling);
      else parentNode.insertBefore(newSection, parentNode.firstChild);
      addIds(newSection);
      postStructure();
      return;
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
                  if (isSandboxNotFoundError(e)) {
                    // Previous sandbox was already deleted/expired; continue safely.
                    console.log(`[sandbox] Previous sandbox already unavailable: ${prevSandboxId}`)
                  } else {
                    console.warn("[sandbox] Failed to kill previous sandbox:", e)
                  }
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
            await normalizePostcssConfigForPreview(sandbox)
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

            const fatal = getFatalDevError(readyCheck.logs)
            if (fatal) {
              emitTerminalError({
                error: "Dev server failed to start",
                logs: { dev: readyCheck.logs },
                failureCategory: fatal.category,
                failureReason: fatal.reason,
              })
              return
            }
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
