import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { getComputerForUser } from "@/lib/computer-access"
import { createComputerVersion } from "@/lib/computer-versions"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerAction, ComputerVersion } from "@/lib/computer-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, versionId } = await params
  const { snap, canManage } = await getComputerForUser(id, uid)
  if (!snap.exists) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  if (!canManage) {
    return Response.json({ error: "Only the owner can restore versions" }, { status: 403 })
  }

  const versionSnap = await snap.ref.collection("versions").doc(versionId).get()
  if (!versionSnap.exists) {
    return Response.json({ error: "Version not found" }, { status: 404 })
  }

  const version = versionSnap.data() as Omit<ComputerVersion, "id">
  if (!Array.isArray(version.files) || version.files.length === 0) {
    return Response.json({ error: "Version has no files to restore" }, { status: 400 })
  }

  const restored = await createComputerVersion({
    computerId: id,
    files: version.files,
    source: "restore",
    title: `Restored ${version.title}`,
    createdBy: "user",
    createdByUid: uid,
  })

  const action: ComputerAction = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "message",
    actor: "system",
    content: `Restored ${version.title}.`,
  }

  await snap.ref.update({
    files: version.files,
    currentGeneratingFile: null,
    sandboxUrl: null,
    sandboxId: null,
    currentVersionId: restored.id,
    actions: FieldValue.arrayUnion(action),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return Response.json({ ok: true, versionId: restored.id, versionNumber: restored.versionNumber })
}
