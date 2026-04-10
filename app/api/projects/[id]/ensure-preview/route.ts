import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { assertProjectCanEdit } from "@/lib/project-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProjectFile = { path: string; content: string }

async function isPreviewResponsive(previewUrl: string): Promise<boolean> {
  const tries = 3
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    try {
      const res = await fetch(previewUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "text/html" },
      })
      clearTimeout(timeout)
      // E2B closed-port pages can still return HTML responses.
      // Detect known "port closed / connection refused" signatures.
      const body = (await res.text().catch(() => "")).toLowerCase()
      const looksClosedPort =
        body.includes("closed port error") ||
        body.includes("connection refused on port") ||
        body.includes("there's no service running on port") ||
        body.includes("there is no service running on port") ||
        body.includes("sandbox is running but there's no service running on port") ||
        body.includes("check the sandbox logs for more information")
      if (looksClosedPort) {
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 1200))
        continue
      }
      if (res.ok) return true
    } catch {
      clearTimeout(timeout)
    }
    if (i < tries - 1) {
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  return false
}

async function parseSandboxStream(res: Response): Promise<{ previewUrl: string; sandboxId: string }> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("Preview stream unavailable")

  const decoder = new TextDecoder()
  let buffer = ""
  let streamError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let data: any
      try {
        data = JSON.parse(trimmed)
      } catch {
        continue
      }

      if (data?.type === "error") {
        streamError = String(data?.error || "Preview failed")
      }

      if (data?.type === "success" && data?.url && data?.sandboxId) {
        return { previewUrl: String(data.url), sandboxId: String(data.sandboxId) }
      }
    }
  }

  if (streamError) throw new Error(streamError)
  throw new Error("Preview did not become ready")
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const uid = await requireUserUid(req)
    const { id: projectId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const force = !!body?.force
    if (!projectId) return NextResponse.json({ error: "Missing project id" }, { status: 400 })

    const { snap } = await assertProjectCanEdit(projectId, uid)
    const project = (snap.data() ?? {}) as {
      files?: ProjectFile[]
      sandboxUrl?: string
      sandboxId?: string
    }
    const files = Array.isArray(project.files) ? project.files : []
    if (files.length === 0) {
      return NextResponse.json({ error: "Project has no files to preview yet." }, { status: 400 })
    }

    const origin = new URL(req.url).origin
    const auth = req.headers.get("authorization") || ""

    // Fast path: try to keep existing runtime alive when possible.
    if (!force && project.sandboxId && project.sandboxUrl) {
      const patchRes = await fetch(`${origin}/api/sandbox`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
        body: JSON.stringify({ sandboxId: project.sandboxId }),
      })
      if (patchRes.ok) {
        const healthy = await isPreviewResponsive(project.sandboxUrl)
        if (healthy) {
          return NextResponse.json({
            previewUrl: project.sandboxUrl,
            sandboxId: project.sandboxId,
            recovered: false,
          })
        }
        console.warn("[ensure-preview] Existing sandbox reachable but preview port not responding, recreating", {
          projectId,
          sandboxId: project.sandboxId,
        })
      }
      console.warn("[ensure-preview] Existing sandbox not available, recreating", { projectId, sandboxId: project.sandboxId })
    }

    // Recreate/recover using project snapshot from DB.
    const sandboxRes = await fetch(`${origin}/api/sandbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify({
        projectId,
        files,
        sandboxId: project.sandboxId || undefined,
      }),
    })
    if (!sandboxRes.ok) {
      const body = await sandboxRes.text().catch(() => "")
      throw new Error(`Failed to ensure preview (${sandboxRes.status}): ${body}`)
    }

    const ensured = await parseSandboxStream(sandboxRes)
    await adminDb.collection("projects").doc(projectId).set(
      {
        sandboxUrl: ensured.previewUrl,
        sandboxId: ensured.sandboxId,
        previewEnsuredAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      previewUrl: ensured.previewUrl,
      sandboxId: ensured.sandboxId,
      recovered: true,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to ensure preview"
    console.error("[ensure-preview] error", message)
    const status = message === "Project not found" ? 404 : message.startsWith("Forbidden:") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
