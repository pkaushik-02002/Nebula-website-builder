import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = String(body?.projectId ?? "").trim()
    const computerId = String(body?.computerId ?? "").trim()
    const sourceId = computerId || projectId
    const collection = computerId ? "computers" : "projects"
    const token = typeof body?.token === "string" ? body.token.trim() : ""

    if (!sourceId) {
      return NextResponse.json({ error: "Missing projectId or computerId" }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const snap = await adminDb.collection(collection).doc(sourceId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const data = snap.data() as any
    const ownerId = data?.ownerId ?? data?.userId
    if (ownerId && ownerId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await adminDb.collection(collection).doc(sourceId).update({
      vercelToken: token,
      vercelConnectedAt: new Date(),
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
