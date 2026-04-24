import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { getComputerForUser } from "@/lib/computer-access"
import { createComputerInvite } from "@/lib/computer-invites"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerCollaborator } from "@/lib/computer-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { snap, data, canManage } = await getComputerForUser(id, uid)
  if (!snap.exists || !data) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  if (!canManage) {
    return Response.json({ error: "Only the owner can invite collaborators" }, { status: 403 })
  }

  let email = ""
  try {
    const body = await req.json()
    email = normalizeEmail(body?.email)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!email || !email.includes("@")) {
    return Response.json({ error: "A valid email is required" }, { status: 400 })
  }

  const invitedUser = await adminAuth.getUserByEmail(email).catch(() => null)
  if (invitedUser?.uid === uid) {
    return Response.json({ error: "You already own this computer" }, { status: 400 })
  }

  const existingCollaborators = Array.isArray(data.collaborators)
    ? data.collaborators.filter((value): value is ComputerCollaborator => {
        return !!value && typeof value === "object" && typeof (value as ComputerCollaborator).uid === "string"
      })
    : []

  const existingCollaborator = invitedUser
    ? existingCollaborators.find((collaborator) => collaborator.uid === invitedUser.uid)
    : null

  if (existingCollaborator) {
    return Response.json({
      invited: false,
      alreadyCollaborator: true,
      emailSent: false,
    })
  }

  const inviter = await adminAuth.getUser(uid).catch(() => null)
  const invite = await createComputerInvite({
    computerId: id,
    computerName: typeof data.name === "string" ? data.name : "lotus.build computer",
    email,
    invitedByUid: uid,
    invitedByName: inviter?.displayName || inviter?.email || null,
    invitedUserUid: invitedUser?.uid ?? null,
  })

  const action = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "message" as const,
    actor: "system" as const,
    content: `Invitation sent to ${email}.`,
  }

  const updates: Record<string, unknown> = {
    pendingInvites: FieldValue.arrayUnion({
      inviteId: invite.inviteId,
      email,
      invitedUserUid: invitedUser?.uid ?? null,
      invitedAt: new Date().toISOString(),
      invitedBy: uid,
      emailSent: invite.emailSent,
    }),
    actions: FieldValue.arrayUnion(action),
    updatedAt: FieldValue.serverTimestamp(),
  }

  await adminDb.collection("computers").doc(id).update(updates)

  return Response.json({
    invited: true,
    inviteId: invite.inviteId,
    emailSent: invite.emailSent,
    emailError: invite.emailError,
  })
}
