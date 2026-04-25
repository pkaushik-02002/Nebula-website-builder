import { FieldValue } from "firebase-admin/firestore"

import { canAccessComputer } from "@/lib/computer-access"
import { runSandbox } from "@/lib/computer-agent/tools"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import type { ProjectFile } from "@/lib/computer-agent/tools"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function sse(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const ref = adminDb.collection("computers").doc(id)
  const snap = await ref.get()

  if (!snap.exists) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const data = snap.data() as Record<string, unknown>
  if (!canAccessComputer(data, uid)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const files = Array.isArray(data.files) ? (data.files as ProjectFile[]) : []
  if (!files.length) {
    return Response.json({ error: "No files to sandbox" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try { sse(controller, encoder, event) } catch {}
      }

      try {
        send({ type: "status", message: "Starting sandbox…" })

        await ref.update({
          sandboxUrl: null,
          sandboxId: null,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})

        const { ready, previewUrl, sandboxId, errors } = await runSandbox(files, { computerId: id })

        await ref.update({
          sandboxUrl: ready && previewUrl ? previewUrl : null,
          sandboxId,
          updatedAt: FieldValue.serverTimestamp(),
        })

        send({ type: "done", ready, previewUrl, sandboxId, errors })
      } catch (err: any) {
        send({ type: "error", error: err?.message ?? "Sandbox error" })
      } finally {
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
