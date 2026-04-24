import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { verifyComputerInviteToken } from "@/lib/computer-invites"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerAction, ComputerCollaborator } from "@/lib/computer-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export async function POST(req: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { inviteId } = await params
  let token = ""
  try {
    const body = await req.json()
    token = typeof body?.token === "string" ? body.token.trim() : ""
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!token) {
    return Response.json({ error: "Invite token is required" }, { status: 400 })
  }

  const inviteRef = adminDb.collection("computerInvites").doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) {
    return Response.json({ error: "Invite not found" }, { status: 404 })
  }

  const invite = inviteSnap.data() as {
    computerId?: string
    email?: string
    invitedBy?: string
    invitedUserUid?: string | null
    tokenHash?: string
    status?: string
    expiresAt?: Timestamp
  }

  if (invite.status !== "pending") {
    return Response.json({ error: "Invite is no longer pending" }, { status: 400 })
  }
  if (!invite.tokenHash || !verifyComputerInviteToken(token, invite.tokenHash)) {
    return Response.json({ error: "Invalid invite token" }, { status: 403 })
  }
  if (invite.expiresAt?.toDate && invite.expiresAt.toDate().getTime() < Date.now()) {
    await inviteRef.update({
      status: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    })
    return Response.json({ error: "Invite has expired" }, { status: 400 })
  }
  if (!invite.computerId || !invite.email) {
    return Response.json({ error: "Invite is incomplete" }, { status: 400 })
  }

  const user = await adminAuth.getUser(uid)
  const userEmail = normalizeEmail(user.email)
  const inviteEmail = normalizeEmail(invite.email)
  if (invite.invitedUserUid && invite.invitedUserUid !== uid) {
    return Response.json({ error: "This invite belongs to a different account" }, { status: 403 })
  }
  if (!invite.invitedUserUid && userEmail !== inviteEmail) {
    return Response.json({ error: "Sign in with the invited email address to accept this invite" }, { status: 403 })
  }

  const computerRef = adminDb.collection("computers").doc(invite.computerId)
  const computerSnap = await computerRef.get()
  if (!computerSnap.exists) {
    return Response.json({ error: "Computer not found" }, { status: 404 })
  }

  const computer = computerSnap.data() as { ownerId?: string; collaboratorIds?: unknown }
  if (computer.ownerId === uid) {
    await inviteRef.update({
      status: "accepted",
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return Response.json({ ok: true, computerId: invite.computerId })
  }

  const collaboratorIds = Array.isArray(computer.collaboratorIds)
    ? computer.collaboratorIds.filter((value): value is string => typeof value === "string")
    : []

  const collaborator: ComputerCollaborator = {
    uid,
    email: user.email ?? invite.email,
    displayName: user.displayName ?? user.email ?? invite.email,
    photoURL: user.photoURL ?? null,
    invitedAt: new Date().toISOString(),
    invitedBy: invite.invitedBy,
  }
  const action: ComputerAction = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "message",
    actor: "system",
    content: `${collaborator.displayName ?? collaborator.email ?? "A collaborator"} joined this computer.`,
  }

  await computerRef.update({
    ...(collaboratorIds.includes(uid)
      ? {}
      : {
          collaboratorIds: FieldValue.arrayUnion(uid),
          collaborators: FieldValue.arrayUnion(collaborator),
          actions: FieldValue.arrayUnion(action),
        }),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await inviteRef.update({
    status: "accepted",
    acceptedAt: FieldValue.serverTimestamp(),
    acceptedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return Response.json({ ok: true, computerId: invite.computerId })
}
