import { NextResponse } from "next/server"
import { getUserNetlifyToken, requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request, ctx: { params: Promise<{ deployId: string }> }) {
  try {
    const uid = await requireUserUid(req)
    const token = await getUserNetlifyToken(uid)
    if (!token) {
      return NextResponse.json({ error: "Netlify not connected" }, { status: 401 })
    }

    const { deployId } = await ctx.params
    if (!deployId) {
      return NextResponse.json({ error: "Missing deployId" }, { status: 400 })
    }

    const res = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const t = await res.text().catch(() => "")
      return NextResponse.json({ error: `Failed to fetch deploy: ${res.status} ${t}` }, { status: 500 })
    }

    const json = (await res.json()) as any

    return NextResponse.json({
      id: json?.id || deployId,
      state: json?.state || json?.status || null,
      deployUrl: json?.deploy_ssl_url || json?.ssl_url || json?.deploy_url || null,
      siteId: json?.site_id || null,
      adminUrl: json?.admin_url || null,
      logAccessUrl: json?.log_access_attributes?.url || null,
      raw: json,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
