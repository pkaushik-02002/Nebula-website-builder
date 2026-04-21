import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"
import type { ComputerAction, ComputerPermissions } from "@/lib/computer-types"
import {
  extractReferenceDomainsFromText,
  extractReferenceUrlsFromText,
  mergeReferenceUrls,
} from "@/lib/computer-agent/reference-urls"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (data.ownerId !== uid) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  return Response.json({ computer: { id: snap.id, ...data } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (data.ownerId !== uid) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let intent: "message" | "interrupt" | "stop" | "approve_plan" | "update_permissions"
  let message = ""
  let actionId: string | undefined
  let permissions: Partial<ComputerPermissions> | null = null

  try {
    const body = await req.json()
    intent = body?.intent
    message = typeof body?.message === "string" ? body.message.trim() : ""
    actionId = typeof body?.actionId === "string" ? body.actionId : undefined
    if (body?.permissions && typeof body.permissions === "object") {
      permissions = {
        ...(typeof body.permissions.requirePlanApproval === "boolean"
          ? { requirePlanApproval: body.permissions.requirePlanApproval }
          : {}),
      }
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!["message", "interrupt", "stop", "approve_plan", "update_permissions"].includes(intent)) {
    return Response.json({ error: "Invalid intent" }, { status: 400 })
  }

  if ((intent === "message" || intent === "interrupt") && !message) {
    return Response.json({ error: "message is required" }, { status: 400 })
  }

  if (intent === "update_permissions" && !permissions) {
    return Response.json({ error: "permissions are required" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  let action: ComputerAction | null = null
  const currentPrompt = typeof data.prompt === "string" ? data.prompt.trim() : ""
  const currentPermissions = (data.permissions as ComputerPermissions | undefined) ?? {
    requirePlanApproval: true,
  }
  const currentReferenceUrls = Array.isArray(data.referenceUrls)
    ? data.referenceUrls.filter((value): value is string => typeof value === "string")
    : []

  if (message) {
    action = {
      id: actionId || nanoid(),
      timestamp: new Date().toISOString(),
      type: "message",
      actor: "user",
      content: message,
    }

    const nextReferenceUrls = mergeReferenceUrls(
      currentReferenceUrls,
      extractReferenceUrlsFromText(message),
      extractReferenceDomainsFromText(message)
    )

    updates.actions = FieldValue.arrayUnion(action)
    updates.prompt = currentPrompt
      ? `${currentPrompt}\n\nAdditional instruction from user:\n${message}`
      : message
    updates.referenceUrls = nextReferenceUrls
    updates.planningStatus = "draft"
    updates.clarificationQuestions = []
    updates.plan = null
    updates.approvedAt = null
    updates.currentGeneratingFile = null
  }

  if (intent === "interrupt" || intent === "stop") {
    updates.cancelRequested = true
  }

  if (intent === "approve_plan") {
    if (!data.plan) {
      return Response.json({ error: "No plan available to approve" }, { status: 400 })
    }

    action = {
      id: actionId || nanoid(),
      timestamp: new Date().toISOString(),
      type: "decision",
      actor: "user",
      content: "Plan approved. Continue into build.",
    }

    updates.actions = FieldValue.arrayUnion(action)
    updates.planningStatus = "approved"
    updates.approvedAt = FieldValue.serverTimestamp()
    updates.cancelRequested = false
    updates.currentGeneratingFile = null
  }

  if (intent === "update_permissions" && permissions) {
    const nextPermissions: ComputerPermissions = {
      ...currentPermissions,
      ...permissions,
    }

    action = {
      id: actionId || nanoid(),
      timestamp: new Date().toISOString(),
      type: "decision",
      actor: "user",
      content: nextPermissions.requirePlanApproval
        ? "Plan approval required before build."
        : "Plan approval disabled. The agent may continue with reasonable assumptions after planning.",
    }

    updates.actions = FieldValue.arrayUnion(action)
    updates.permissions = nextPermissions
  }

  await ref.update(updates)

  return Response.json({ ok: true, action })
}
