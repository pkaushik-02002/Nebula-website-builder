import { NextResponse } from "next/server"
import { requireUserUid } from "@/lib/server-auth"
import { supabaseManagementFetch } from "@/lib/supabase-management"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const name = (body?.name ?? body?.projectName ?? "").toString().trim()
    const region = (body?.region ?? "").toString().trim()
    const dbPassword = (body?.dbPassword ?? body?.databasePassword ?? "").toString().trim()
    const organizationIdFromBody = (body?.organizationId ?? "").toString().trim()

    if (!name || !region || !dbPassword) {
      return NextResponse.json(
        { error: "Missing required fields: name, region, dbPassword" },
        { status: 400 }
      )
    }

    let organizationId = organizationIdFromBody
    if (!organizationId) {
      const organizations = await supabaseManagementFetch<Array<{ id: string }>>(uid, "/v1/organizations")
      organizationId = organizations[0]?.id || ""
    }
    if (!organizationId) {
      const projects = await supabaseManagementFetch<Array<{ organization_id?: string }>>(uid, "/v1/projects")
      organizationId = projects.find((p) => !!p.organization_id)?.organization_id || ""
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "No Supabase organization found for this account. Reconnect Supabase or create an organization first." },
        { status: 400 }
      )
    }

    const created = await supabaseManagementFetch(uid, "/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        region,
        db_pass: dbPassword,
        organization_id: organizationId,
      }),
    })

    const createdRecord = created as { id?: string; ref?: string; name?: string; region?: string }
    const projectRef = (createdRecord?.ref ?? createdRecord?.id ?? "").toString()

    return NextResponse.json({
      project: created,
      projectRef,
      projectName: (createdRecord?.name ?? name).toString(),
      region,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create Supabase project"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
