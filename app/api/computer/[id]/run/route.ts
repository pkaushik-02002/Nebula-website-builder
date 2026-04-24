import { FieldValue } from "firebase-admin/firestore"

import { AgentRunQuotaExceededError, consumeAgentRun } from "@/lib/agent-run-quota"
import { canAccessComputer } from "@/lib/computer-access"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerAction, ComputerStep, ComputerStatus, ComputerStepKind } from "@/lib/computer-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function stripUndefinedFields<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T
}

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
  const snap = await adminDb.collection("computers").doc(id).get()
  if (!snap.exists) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const data = snap.data() as Record<string, unknown>
  if (!canAccessComputer(data, uid)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    await consumeAgentRun(uid)
  } catch (error) {
    if (error instanceof AgentRunQuotaExceededError) {
      return Response.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof Error && error.message === "user-not-found") {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    console.error("Failed to enforce agent run quota", error)
    return Response.json({ error: "Failed to verify agent run allowance" }, { status: 500 })
  }

  const ref = adminDb.collection("computers").doc(id)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      await ref.update({
        cancelRequested: false,
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})

      const send = (event: unknown) => {
        try { sse(controller, encoder, event) } catch {}
      }

      const emitAction = async (action: ComputerAction) => {
        send({ type: "action", action })
        await ref.update({
          actions: FieldValue.arrayUnion(action),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      const emitStep = async (step: ComputerStep) => {
        const sanitizedStep = stripUndefinedFields(step)
        send({ type: "step", step: sanitizedStep })
        await ref.update({
          steps: FieldValue.arrayUnion(sanitizedStep),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      const emitStatus = async (status: ComputerStatus, currentStep?: ComputerStepKind) => {
        send({ type: "status", status, currentStep })
        await ref.update({
          status,
          ...(currentStep !== undefined ? { currentStep } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      try {
        const { runComputerOrchestrator } = await import("@/lib/computer-agent/orchestrator")
        const computerData = data as { prompt?: string; referenceUrls?: string[] }
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
        const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""

        await runComputerOrchestrator({
          computerId: id,
          uid,
          idToken,
          prompt: computerData.prompt ?? "",
          referenceUrls: Array.isArray(computerData.referenceUrls) ? computerData.referenceUrls : [],
          emitAction,
          emitStep,
          emitStatus,
          shouldCancel: async () => {
            const latest = await ref.get()
            return latest.data()?.cancelRequested === true
          },
        })

        send({ type: "done" })
      } catch (err: any) {
        send({ type: "error", error: err?.message ?? "Orchestrator error" })
        await ref.update({ status: "error", updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
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
