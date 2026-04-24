import { adminDb } from "@/lib/firebase-admin"

export function canAccessComputer(data: Record<string, unknown>, uid: string): boolean {
  const collaborators = Array.isArray(data.collaboratorIds)
    ? data.collaboratorIds.filter((value): value is string => typeof value === "string")
    : []

  return data.ownerId === uid || collaborators.includes(uid)
}

export function canManageComputer(data: Record<string, unknown>, uid: string): boolean {
  return data.ownerId === uid
}

export async function getComputerForUser(computerId: string, uid: string) {
  const snap = await adminDb.collection("computers").doc(computerId).get()
  if (!snap.exists) return { snap, data: null, canAccess: false, canManage: false }

  const data = snap.data() as Record<string, unknown>
  return {
    snap,
    data,
    canAccess: canAccessComputer(data, uid),
    canManage: canManageComputer(data, uid),
  }
}
