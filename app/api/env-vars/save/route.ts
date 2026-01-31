import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { encryptEnvVars } from "@/lib/encrypt-env"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = body?.projectId
    const envVars = body?.envVars
    if (!projectId || typeof envVars !== "object" || envVars === null) {
      return NextResponse.json(
        { error: "Missing projectId or envVars object" },
        { status: 400 }
      )
    }
    const record: Record<string, string> = {}
    for (const [k, v] of Object.entries(envVars)) {
      if (typeof k === "string" && typeof v === "string" && k.trim()) {
        record[k.trim()] = v
      }
    }
    const plain = JSON.stringify(record)
    const { encrypted } = encryptEnvVars(plain)
    const projectRef = adminDb.collection("projects").doc(projectId)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    await projectRef.set(
      {
        envVarsEncrypted: encrypted,
        envVarNames: Object.keys(record),
        envVarsUpdatedAt: new Date(),
      },
      { merge: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
