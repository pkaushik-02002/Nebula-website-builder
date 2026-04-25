import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { canAccessComputer, canManageComputer } from "@/lib/computer-access"
import {
  extractReferenceDomainsFromText,
  extractReferenceUrlsFromText,
  mergeReferenceUrls,
} from "@/lib/computer-agent/reference-urls"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerAction, ComputerPermissions } from "@/lib/computer-types"

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
  if (!canAccessComputer(data, uid)) {
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
  const canAccess = canAccessComputer(data, uid)
  const canManage = canManageComputer(data, uid)
  if (!canAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let intent: "chat_message" | "message" | "edit_chat_message" | "edit_message" | "interrupt" | "stop" | "approve_plan" | "approve_backend" | "update_permissions"
  let message = ""
  let actionId: string | undefined
  let editedActionId: string | undefined
  let permissions: Partial<ComputerPermissions> | null = null

  try {
    const body = await req.json()
    intent = body?.intent
    message = typeof body?.message === "string" ? body.message.trim() : ""
    actionId = typeof body?.actionId === "string" ? body.actionId : undefined
    editedActionId = typeof body?.editedActionId === "string" ? body.editedActionId : undefined
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

  if (!["chat_message", "message", "edit_chat_message", "edit_message", "interrupt", "stop", "approve_plan", "approve_backend", "update_permissions"].includes(intent)) {
    return Response.json({ error: "Invalid intent" }, { status: 400 })
  }

  if ((intent === "chat_message" || intent === "message" || intent === "edit_chat_message" || intent === "edit_message" || intent === "interrupt") && !message) {
    return Response.json({ error: "message is required" }, { status: 400 })
  }

  if ((intent === "edit_chat_message" || intent === "edit_message") && !editedActionId) {
    return Response.json({ error: "editedActionId is required" }, { status: 400 })
  }

  if (["approve_plan", "approve_backend", "update_permissions"].includes(intent) && !canManage) {
    return Response.json({ error: "Only the owner can approve plans or change permissions" }, { status: 403 })
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
  const hasCurrentBuild =
    Boolean(data.plan) &&
    Array.isArray(data.files) &&
    data.files.some((file) => {
      return Boolean(
        file &&
        typeof file === "object" &&
        typeof (file as { path?: unknown }).path === "string" &&
        typeof (file as { content?: unknown }).content === "string"
      )
    })
  const currentReferenceUrls = Array.isArray(data.referenceUrls)
    ? data.referenceUrls.filter((value): value is string => typeof value === "string")
    : []
  const recentDiscussion = Array.isArray(data.actions)
    ? data.actions
        .filter((value): value is ComputerAction => {
          if (!value || typeof value !== "object") return false
          const candidate = value as ComputerAction
          return candidate.actor === "user" && candidate.type === "message" && typeof candidate.content === "string"
        })
        .slice(-20)
        .map((entry) => `${entry.authorName ?? "User"}: ${entry.content}`)
    : []
  const currentActions = Array.isArray(data.actions)
    ? data.actions.filter((value): value is ComputerAction => {
        return Boolean(value && typeof value === "object" && typeof (value as ComputerAction).id === "string")
      })
    : []
  const author = await adminAuth.getUser(uid).catch(() => null)
  const authorName =
    author?.displayName ||
    author?.email ||
    (typeof data.ownerId === "string" && data.ownerId === uid ? "Owner" : "Collaborator")

  if (intent === "edit_chat_message" || intent === "edit_message") {
    const editIndex = currentActions.findIndex((candidate) => candidate.id === editedActionId)
    const targetAction = editIndex >= 0 ? currentActions[editIndex] : null

    if (!targetAction || targetAction.actor !== "user" || targetAction.type !== "message") {
      return Response.json({ error: "Editable message not found" }, { status: 404 })
    }

    if (targetAction.authorUid && targetAction.authorUid !== uid) {
      return Response.json({ error: "Only the message author can edit this message" }, { status: 403 })
    }

    const editedAction: ComputerAction = {
      ...targetAction,
      timestamp: new Date().toISOString(),
      content: message,
    }
    const keptActions = currentActions.slice(0, editIndex)
    const nextActions = [...keptActions, editedAction]
    const nextReferenceUrls = mergeReferenceUrls(
      currentReferenceUrls,
      extractReferenceUrlsFromText(message),
      extractReferenceDomainsFromText(message)
    )
    const instruction = message.replace(/(^|\s)@lotusagent\b/gi, " ").replace(/\s+/g, " ").trim() || message
    const discussionContext = nextActions
      .filter((entry) => entry.actor === "user" && entry.type === "message")
      .slice(-20)
      .map((entry) => `- ${entry.authorName ?? "User"}: ${entry.content}`)
      .join("\n")

    action = editedAction
    updates.actions = nextActions
    updates.referenceUrls = nextReferenceUrls
    if (intent === "edit_chat_message") {
      await ref.update(updates)
      return Response.json({ ok: true, action })
    }
    updates.prompt = currentPrompt
      ? `${currentPrompt}\n\nEdited conversation through ${authorName}:\n${discussionContext}\n\nEdited instruction from ${authorName}:\n${instruction}`
      : `Edited conversation:\n${discussionContext}\n\nInstruction:\n${instruction}`
    updates.followUpInstruction = hasCurrentBuild ? instruction : null
    updates.planningStatus = hasCurrentBuild ? "approved" : "draft"
    updates.clarificationQuestions = []
    if (!hasCurrentBuild) {
      updates.plan = null
    }
    updates.approvedAt = null
    updates.currentGeneratingFile = null
    updates.cancelRequested = true
  } else if (message) {
    action = {
      id: actionId || nanoid(),
      timestamp: new Date().toISOString(),
      type: "message",
      actor: "user",
      authorUid: uid,
      authorName,
      authorPhotoURL: author?.photoURL ?? null,
      content: message,
    }

    const nextReferenceUrls = mergeReferenceUrls(
      currentReferenceUrls,
      extractReferenceUrlsFromText(message),
      extractReferenceDomainsFromText(message)
    )

    updates.actions = FieldValue.arrayUnion(action)
    updates.referenceUrls = nextReferenceUrls

    if (intent !== "chat_message") {
      const instruction = message.replace(/(^|\s)@lotusagent\b/gi, " ").replace(/\s+/g, " ").trim() || message
      const discussionContext = [...recentDiscussion, `${authorName}: ${message}`]
        .map((entry) => `- ${entry}`)
        .join("\n")
      updates.prompt = currentPrompt
        ? `${currentPrompt}\n\nRecent collaborator discussion:\n${discussionContext}\n\nAdditional instruction from ${authorName}:\n${instruction}`
        : `Recent collaborator discussion:\n${discussionContext}\n\nInstruction:\n${instruction}`
      updates.followUpInstruction = hasCurrentBuild ? instruction : null
      updates.planningStatus = hasCurrentBuild ? "approved" : "draft"
      updates.clarificationQuestions = []
      if (!hasCurrentBuild) {
        updates.plan = null
      }
      updates.approvedAt = null
      updates.currentGeneratingFile = null
    }
  }

  if (intent === "interrupt" || intent === "stop") {
    updates.cancelRequested = true
    updates.currentGeneratingFile = null
    if (intent === "stop") {
      updates.status = "idle"
    }
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
    updates.followUpInstruction = null
    updates.cancelRequested = false
    updates.currentGeneratingFile = null
  }

  if (intent === "approve_backend") {
    const pendingBackend = data.pendingBackendSetup
    if (!pendingBackend || typeof pendingBackend !== "object") {
      return Response.json({ error: "No pending backend setup to approve" }, { status: 400 })
    }

    action = {
      id: actionId || nanoid(),
      timestamp: new Date().toISOString(),
      type: "decision",
      actor: "user",
      content: "Supabase backend approved. Continue backend setup.",
    }

    updates.actions = FieldValue.arrayUnion(action)
    updates.supabaseBackendApproved = true
    updates.followUpInstruction = null
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
