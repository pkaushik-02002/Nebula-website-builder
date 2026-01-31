import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    await requireUserUid(req)
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }
    const snap = await adminDb.collection("projects").doc(projectId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const data = snap.data() as { supabaseUrl?: string }
    return NextResponse.json({ connected: !!data?.supabaseUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
