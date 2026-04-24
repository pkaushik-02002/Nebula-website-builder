import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { getComputerForUser } from "@/lib/computer-access"
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
  if (!invitedUser) {
    return Response.json({ error: "No Lotus account found for that email yet" }, { status: 404 })
  }

  if (invitedUser.uid === uid) {
    return Response.json({ error: "You already own this computer" }, { status: 400 })
  }

  const existingCollaborators = Array.isArray(data.collaborators)
    ? data.collaborators.filter((value): value is ComputerCollaborator => {
        return !!value && typeof value === "object" && typeof (value as ComputerCollaborator).uid === "string"
      })
    : []

  const existingCollaborator = existingCollaborators.find((collaborator) => collaborator.uid === invitedUser.uid)
  const collaborator: ComputerCollaborator = existingCollaborator ?? {
    uid: invitedUser.uid,
    email: invitedUser.email ?? email,
    displayName: invitedUser.displayName ?? invitedUser.email ?? email,
    photoURL: invitedUser.photoURL ?? null,
    invitedAt: new Date().toISOString(),
    invitedBy: uid,
  }

  const action = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "message" as const,
    actor: "system" as const,
    content: `${collaborator.displayName ?? collaborator.email ?? "A collaborator"} joined this computer.`,
  }

  const updates: Record<string, unknown> = {
    collaboratorIds: FieldValue.arrayUnion(invitedUser.uid),
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (!existingCollaborator) {
    updates.collaborators = FieldValue.arrayUnion(collaborator)
    updates.actions = FieldValue.arrayUnion(action)
  }

  await adminDb.collection("computers").doc(id).update(updates)

  return Response.json({ collaborator })
}
