import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = body?.projectId
    const url = (body?.url ?? "").toString().trim().replace(/\/$/, "")
    const anonKey = (body?.anonKey ?? "").toString().trim()
    const serviceRoleKey = (body?.serviceRoleKey ?? "").toString().trim() || undefined

    if (!projectId || !url || !anonKey) {
      return NextResponse.json(
        { error: "Missing projectId, url, or anonKey" },
        { status: 400 }
      )
    }
    if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
      return NextResponse.json({ error: "Invalid Supabase project URL" }, { status: 400 })
    }

    const projectRef = adminDb.collection("projects").doc(projectId)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    await projectRef.set(
      {
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        ...(serviceRoleKey ? { supabaseServiceRoleKey: serviceRoleKey } : {}),
        supabaseConnectedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, connected: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
