import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { serializeProjectForApi } from "@/lib/project-shape"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Returns uid if Authorization Bearer token is valid, otherwise null. */
async function getOptionalUserUid(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return null
  const idToken = header.slice("Bearer ".length).trim()
  if (!idToken) return null
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    return decoded.uid
  } catch {
    return null
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 })
    }

    const uid = await getOptionalUserUid(req)
    const snap = await adminDb.collection("projects").doc(projectId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const data = snap.data() as {
      visibility?: "public" | "private" | "link-only"
      ownerId?: string
      editorIds?: string[]
      [key: string]: unknown
    }
    const visibility = data.visibility ?? "private"
    const ownerId = data.ownerId
    const editorIds = Array.isArray(data.editorIds) ? data.editorIds : []

    const isOwner = !!uid && uid === ownerId
    const isEditor = !!uid && editorIds.includes(uid)
    const canViewPublic = visibility === "public" || visibility === "link-only"

    if (visibility === "private" && !isOwner && !isEditor) {
      return NextResponse.json({ error: "This project is private" }, { status: 403 })
    }
    if (canViewPublic || isOwner || isEditor) {
      const payload = serializeProjectForApi({ id: snap.id, ...data }, snap.id)
      return NextResponse.json(payload)
    }

    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await requireUserUid(req)
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 })
    }

    const snap = await adminDb.collection("projects").doc(projectId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const data = snap.data() as { ownerId?: string }
    if (data.ownerId && data.ownerId !== uid) {
      return NextResponse.json({ error: "Only the owner can update share settings" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const visibility = body.visibility
    const editorIds = body.editorIds

    const updates: Record<string, unknown> = {}
    if (visibility === "public" || visibility === "private" || visibility === "link-only") {
      updates.visibility = visibility
    }
    if (Array.isArray(editorIds)) {
      updates.editorIds = editorIds
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true })
    }

    await adminDb.collection("projects").doc(projectId).update(updates)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: err instanceof Error && message.includes("Authorization") ? 401 : 500 })
  }
}
