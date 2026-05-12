import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { getUserNetlifyToken, requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request, ctx: { params: Promise<{ deployId: string }> }) {
  try {
    const uid = await requireUserUid(req)

    const { deployId } = await ctx.params
    if (!deployId) {
      return NextResponse.json({ error: "Missing deployId" }, { status: 400 })
    }

    // Require the caller to supply the projectId so we can verify ownership
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("projectId")?.trim()
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    // Verify the project belongs to the requesting user
    const projectSnap = await adminDb.collection("projects").doc(projectId).get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const projectData = projectSnap.data() as { ownerId?: string; editorIds?: string[]; netlifyDeployId?: string }
    const isOwner = !projectData.ownerId || projectData.ownerId === uid
    const isEditor = Array.isArray(projectData.editorIds) && projectData.editorIds.includes(uid)
    if (!isOwner && !isEditor) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Verify the deployId actually belongs to this project (prevents probing other deploys)
    const storedDeployId = (projectData.netlifyDeployId ?? "").trim()
    if (storedDeployId && storedDeployId !== deployId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const token = await getUserNetlifyToken(uid)
    if (!token) {
      return NextResponse.json({ error: "Netlify not connected" }, { status: 401 })
    }

    const res = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const t = await res.text().catch(() => "")
      return NextResponse.json({ error: `Failed to fetch deploy: ${res.status} ${t}` }, { status: 500 })
    }

    const json = (await res.json()) as Record<string, unknown>

    return NextResponse.json({
      id: json?.id || deployId,
      state: json?.state || json?.status || null,
      deployUrl: json?.deploy_ssl_url || json?.ssl_url || json?.deploy_url || null,
      siteId: json?.site_id || null,
      adminUrl: json?.admin_url || null,
      logAccessUrl: (json?.log_access_attributes as Record<string, unknown>)?.url || null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
