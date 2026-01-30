// app/api/sandbox/route.ts
import { Sandbox } from "@e2b/code-interpreter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type InputFile = { path: string; content: string }

const PROJECT_DIR = "/home/user/project"
const DEV_PORT = 3000

const SANDBOX_TTL_MS = 55 * 60 * 1000

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
  } catch {
    // ignore
  }
}

async function cmd(sandbox: Sandbox, command: string, timeoutMs: number) {
  return sandbox.commands.run(command, { timeoutMs })
}

async function readTail(sandbox: Sandbox, path: string, lines = 120) {
  const res = await cmd(
    sandbox,
    `bash -lc "(tail -n ${lines} ${path} 2>/dev/null || true)"`,
    10_000,
  )
  return `${res.stdout || ""}\n${res.stderr || ""}`.trim()
}

async function readFileMaybe(sandbox: Sandbox, path: string) {
  const res = await cmd(
    sandbox,
    `bash -lc "(cat ${path} 2>/dev/null || true)"`,
    8_000,
  )
  return (res.stdout || "").trim()
}

async function pidAlive(sandbox: Sandbox, pid: string) {
  const res = await cmd(
    sandbox,
    `bash -lc "kill -0 ${pid} >/dev/null 2>&1; echo $?"`,
    5_000,
  )
  return (res.stdout || "").trim() === "0"
}

// HTTP probe: *any* HTTP status (not "000") counts as "server is listening". [web:264]
async function httpReady(sandbox: Sandbox) {
  const res = await cmd(
    sandbox,
    `bash -lc "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${DEV_PORT} || true"`,
    8_000,
  )
  const code = (res.stdout || "").trim()
  // When port is closed, curl usually prints "" or "000"; anything else means
  // there's a real HTTP server (200, 404, 500, redirect, etc.).
  return !!code && code !== "000"
}

function parsePackageJsonText(txt: string) {
  try {
    return JSON.parse(txt)
  } catch {
    return null
  }
}

function inferFramework(pkg: any): "next" | "vite" | "unknown" {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  if (deps?.next) return "next"
  if (deps?.vite) return "vite"
  return "unknown"
}

// Dev-only start commands, binding to 0.0.0.0:3000. [web:292][web:168]
function buildDevStartCmd(framework: "next" | "vite" | "unknown") {
  const basePrefix = `cd ${PROJECT_DIR} && rm -f /tmp/dev.log /tmp/dev.pid && `
  const baseSuffix = ` > /tmp/dev.log 2>&1 & echo $! > /tmp/dev.pid"`

  if (framework === "next") {
    // next dev with hostname/port flags + env. [web:292]
    return (
      `bash -lc "${basePrefix}` +
      `PORT=${DEV_PORT} HOSTNAME=0.0.0.0 ` +
      `nohup npm run dev -- -H 0.0.0.0 -p ${DEV_PORT}` +
      `${baseSuffix}"`
    )
  }

  if (framework === "vite") {
    // vite dev with host/port/strictPort so it binds correctly. [web:168][web:223]
    return (
      `bash -lc "${basePrefix}` +
      `nohup npm run dev -- --host 0.0.0.0 --port ${DEV_PORT} --strictPort` +
      `${baseSuffix}"`
    )
  }

  // Fallback: generic dev, try host flags then plain dev.
  return (
    `bash -lc "${basePrefix}` +
    `nohup npm run dev -- --host 0.0.0.0 --port ${DEV_PORT} || npm run dev` +
    `${baseSuffix}"`
  )
}

async function tryExtendTimeout(sandbox: Sandbox) {
  if (typeof (sandbox as any).setTimeout === "function") {
    try {
      await (sandbox as any).setTimeout(SANDBOX_TTL_MS, { requestTimeoutMs: 0 })
      return
    } catch {
      try {
        await (sandbox as any).setTimeout(SANDBOX_TTL_MS)
      } catch {
        // ignore
      }
    }
  }
}

export async function POST(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json(
      { error: "E2B API key not configured" },
      { status: 500 },
    )
  }

  let files: InputFile[] = []
  let sandboxId: string | undefined

  try {
    const body = await req.json()
    files = body?.files
    sandboxId = body?.sandboxId
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(files)) {
    return Response.json(
      { error: "'files' must be an array" },
      { status: 400 },
    )
  }

  if (!files.some((f) => f?.path === "package.json")) {
    return Response.json(
      { error: "Missing package.json at repository root." },
      { status: 400 },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => ndjson(controller, encoder, obj)

      const heartbeat = setInterval(() => {
        try {
          send({ type: "ping", ts: Date.now() })
        } catch {}
      }, 10_000)

      const finish = () => {
        clearInterval(heartbeat)
        controller.close()
      }

      let sandbox: Sandbox | null = null

      try {
        const opts: any = {
          apiKey: process.env.E2B_API_KEY,
          timeoutMs: SANDBOX_TTL_MS,
          requestTimeoutMs: 0,
        }

        // Reuse sandbox if possible
        if (sandboxId) {
          try {
            sandbox = await Sandbox.connect(sandboxId, opts)
          } catch {
            sandbox = null
          }
        }

        if (!sandbox) {
          sandbox = await Sandbox.create("base", opts)
        }

        await tryExtendTimeout(sandbox)

        // Write project files
        await safeMakeDir(sandbox, PROJECT_DIR)
        for (const file of files) {
          const fullPath = `${PROJECT_DIR}/${file.path}`
          const dir = fullPath.slice(0, fullPath.lastIndexOf("/"))
          if (dir) await safeMakeDir(sandbox, dir)
          await sandbox.files.write(fullPath, file.content)
        }

        // Detect framework
        const pkgText = await readFileMaybe(sandbox, `${PROJECT_DIR}/package.json`)
        const pkg = parsePackageJsonText(pkgText)
        const framework = inferFramework(pkg)
        const startCmd = buildDevStartCmd(framework)

        // Install deps
        send({
          type: "step",
          step: "install",
          status: "running",
          message: "Installing dependencies...",
        })

        const install = await sandbox.commands.run(
          `bash -lc "cd ${PROJECT_DIR} && npm install --legacy-peer-deps --no-audit --no-fund"`,
          {
            timeoutMs: 0,
            onStdout: (data: string) =>
              send({ type: "log", step: "install", stream: "stdout", data }),
            onStderr: (data: string) =>
              send({ type: "log", step: "install", stream: "stderr", data }),
          },
        )

        if (install.exitCode !== 0) {
          const combined = `${install.stdout || ""}\n${install.stderr || ""}`.trim()
          send({
            type: "error",
            error: "Dependency installation failed",
            logs: { install: combined },
            failureCategory: "deps",
            failureReason: "Install failed",
          })
          finish()
          return
        }

        send({
          type: "step",
          step: "install",
          status: "success",
          message: "Dependencies installed successfully",
        })

        // Start dev server ONLY (no build)
        send({
          type: "step",
          step: "dev",
          status: "running",
          message: `Starting dev server (${framework})...`,
        })

        // Kill previous dev process if reusing sandbox
        await cmd(
          sandbox,
          `bash -lc "if [ -f /tmp/dev.pid ]; then kill -9 $(cat /tmp/dev.pid) >/dev/null 2>&1 || true; fi"`,
          10_000,
        )

        try {
          await cmd(sandbox, startCmd, 0)
        } catch {
          // we'll detect issues via logs/HTTP; don't block here
        }

        // Wait until *something* is listening on port 3000 before exposing URL
        // so E2B never shows "Closed Port Error". [web:264]
        let ready = false
        for (let i = 1; i <= 180; i++) {
          await tryExtendTimeout(sandbox)

          const pid = await readFileMaybe(sandbox, "/tmp/dev.pid")
          if (pid) {
            const alive = await pidAlive(sandbox, pid)
            if (!alive) {
              const logs = await readTail(sandbox, "/tmp/dev.log", 250)
              send({
                type: "error",
                error: logs || "Dev server exited before becoming ready.",
                logs: { dev: logs },
                failureCategory: "build",
                failureReason: "Dev server exited",
              })
              finish()
              return
            }
          }

          if (i % 3 === 0) {
            const logs = await readTail(sandbox, "/tmp/dev.log", 120)
            if (logs) {
              send({
                type: "log",
                step: "dev",
                stream: "stdout",
                data: "\n" + logs + "\n",
              })
            }
            send({
              type: "step",
              step: "dev",
              status: "running",
              message: `Waiting for dev server... (${i}s)`,
            })
          }

          if (await httpReady(sandbox)) {
            ready = true
            break
          }

          await new Promise((r) => setTimeout(r, 1000))
        }

        if (!ready) {
          const logs = await readTail(sandbox, "/tmp/dev.log", 250)
          send({
            type: "error",
            error: logs || "Dev server did not become ready.",
            logs: { dev: logs },
            failureCategory: "build",
            failureReason: "Dev server not ready",
          })
          finish()
          return
        }

        send({
          type: "step",
          step: "dev",
          status: "success",
          message: "Dev server started",
        })

        const url = `https://${sandbox.getHost(DEV_PORT)}`
        send({ type: "success", url, sandboxId: sandbox.sandboxId })

        finish()
      } catch (e: any) {
        send({ type: "error", error: e?.message || "Sandbox error" })
        finish()
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

// Keepalive: call every 30–60s while preview tab is open. [web:290]
export async function PATCH(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json(
      { error: "E2B API key not configured" },
      { status: 500 },
    )
  }

  const { sandboxId } = await req.json()
  if (!sandboxId) {
    return Response.json({ error: "sandboxId required" }, { status: 400 })
  }

  const opts: any = {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: SANDBOX_TTL_MS,
    requestTimeoutMs: 0,
  }

  const sandbox = await Sandbox.connect(sandboxId, opts)
  await tryExtendTimeout(sandbox)

  return Response.json({ ok: true, sandboxId })
}

export async function DELETE(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json(
      { error: "E2B API key not configured" },
      { status: 500 },
    )
  }

  const { sandboxId } = await req.json()
  if (!sandboxId) {
    return Response.json({ error: "Sandbox ID required" }, { status: 400 })
  }

  try {
    const opts: any = {
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: 60_000,
      requestTimeoutMs: 0,
    }
    const sandbox = await Sandbox.connect(sandboxId, opts)
    await sandbox.kill()
  } catch {
    // already gone
  }

  return Response.json({ success: true })
}
