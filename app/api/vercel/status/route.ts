import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""
    const computerId = url.searchParams.get("computerId") || ""
    const sourceId = computerId || projectId
    const collection = computerId ? "computers" : "projects"

    if (!sourceId) {
      return NextResponse.json({ error: "Missing projectId or computerId" }, { status: 400 })
    }

    const snap = await adminDb.collection(collection).doc(sourceId).get()
    if (!snap.exists) {
      return NextResponse.json({ connected: false })
    }

    const data = snap.data() as any
    const ownerId = data?.ownerId || (data?.userId as string)
    if (ownerId && ownerId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const connected = !!data?.vercelToken
    return NextResponse.json({ connected })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
