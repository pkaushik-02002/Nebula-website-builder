import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  ctx: { params: Promise<{ deploymentId: string }> }
) {
  try {
    const uid = await requireUserUid(req)
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""
    const { deploymentId } = await ctx.params

    if (!projectId || !deploymentId) {
      return NextResponse.json({ error: "Missing projectId or deploymentId" }, { status: 400 })
    }

    const snap = await adminDb.collection("projects").doc(projectId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const data = snap.data() as any
    const token = data?.vercelToken
    const ownerId = data?.ownerId || data?.userId
    if (ownerId && ownerId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!token) {
      return NextResponse.json({ error: "Vercel not connected" }, { status: 401 })
    }

    const apiUrl = new URL(`https://api.vercel.com/v13/deployments/${deploymentId}`)

    const res = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const t = await res.text().catch(() => "")
      return NextResponse.json({ error: `Failed to fetch deployment: ${res.status} ${t}` }, { status: 500 })
    }

    const json = (await res.json()) as any

    return NextResponse.json({
      id: json?.id || deploymentId,
      state: json?.readyState || json?.status || null,
      deployUrl: json?.url ? `https://${json.url}` : null,
      siteUrl: Array.isArray(json?.alias) && json.alias[0]
        ? (json.alias[0].startsWith("http") ? json.alias[0] : `https://${json.alias[0]}`)
        : (json?.url ? `https://${json.url}` : null),
      raw: json,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
