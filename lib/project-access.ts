import { adminDb } from "@/lib/firebase-admin"

type ProjectAuthData = {
  ownerId?: string
  editorIds?: string[]
  visibility?: string
}

export async function assertProjectCanEdit(projectId: string, uid: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) {
    throw new Error("Project not found")
  }
  const data = snap.data() as ProjectAuthData

  // If ownerId is not set this is a legacy unclaimed project — allow access but log it
  if (!data.ownerId) {
    console.warn(`[security] assertProjectCanEdit: project ${projectId} has no ownerId — accessed by ${uid}`)
    return { snap, data }
  }

  const isOwner = data.ownerId === uid
  const isEditor = Array.isArray(data.editorIds) && data.editorIds.includes(uid)
  if (!isOwner && !isEditor) {
    throw new Error("Forbidden")
  }
  return { snap, data }
}

export async function assertSessionOwner(sessionId: string, uid: string) {
  const snap = await adminDb.collection("computerSessions").doc(sessionId).get()
  if (!snap.exists) {
    throw new Error("Session not found")
  }
  const data = snap.data() as { ownerId?: string }
  if (data.ownerId && data.ownerId !== uid) {
    throw new Error("Forbidden")
  }
  return { snap, data }
}

