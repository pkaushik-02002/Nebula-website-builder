import crypto from "crypto"
import { NextResponse } from "next/server"

import type { Message } from "@/app/project/[id]/types"
import { adminDb } from "@/lib/firebase-admin"
import { analyzeSupabaseProvisioningNeed } from "@/lib/integrations/supabase/provision"
import { extractSqlTables, generatePostgresSchema } from "@/lib/integrations/supabase/schema"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { getSupabaseConnection, supabaseManagementFetch } from "@/lib/supabase-management"

export const runtime = "nodejs"

type ProjectFile = { path: string; content: string }

type ProjectRecord = {
  name?: string
  prompt?: string
  workspaceId?: string
  files?: ProjectFile[]
  messages?: Message[]
  generatedSchemaSql?: string
  generatedSchemaTables?: string[]
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseProjectRef?: string
  supabaseProjectName?: string
  generationMeta?: Record<string, unknown>
}

type SupabaseProjectRecord = {
  id?: string
  ref?: string
  name?: string
  region?: string
  organization_id?: string
  api_url?: string
  url?: string
  api_keys?: Array<{ name?: string; api_key?: string }>
}

async function getWorkspaceContext(workspaceId: string) {
  if (!workspaceId) return ""
  const wsSnap = await adminDb.collection("workspaces").doc(workspaceId).get()
  if (!wsSnap.exists) return ""
  const ws = wsSnap.data() as { aiContextPrompt?: string }
  return (ws?.aiContextPrompt ?? "").toString().trim()
}

async function resolveOrganizationId(uid: string, requestedId: string) {
  if (requestedId) return requestedId

  try {
    const organizations = await supabaseManagementFetch<Array<{ id: string }>>(uid, "/v1/organizations")
    const organizationId = organizations[0]?.id || ""
    if (organizationId) return organizationId
  } catch {}

  try {
    const projects = await supabaseManagementFetch<Array<{ organization_id?: string }>>(uid, "/v1/projects")
    return projects.find((project) => !!project.organization_id)?.organization_id || ""
  } catch {
    return ""
  }
}

async function fetchProjectCredentials(uid: string, projectRef: string) {
  const details = await supabaseManagementFetch<SupabaseProjectRecord>(
    uid,
    `/v1/projects/${encodeURIComponent(projectRef)}`
  )
  const apiKeys = await supabaseManagementFetch<Array<{ api_key?: string; name?: string }>>(
    uid,
    `/v1/projects/${encodeURIComponent(projectRef)}/api-keys`
  )

  const supabaseUrl = (details?.api_url ?? details?.url ?? `https://${projectRef}.supabase.co`).toString().trim()
  const supabaseAnonKey = apiKeys.find((key) => (key.name || "").toLowerCase().includes("anon"))?.api_key?.trim() || ""
  const projectName = (details?.name ?? projectRef).toString().trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Could not retrieve Supabase project credentials")
  }

  return {
    projectRef,
    projectName,
    supabaseUrl,
    supabaseAnonKey,
  }
}

async function ensureLinkedSupabaseProject(params: {
  uid: string
  projectId: string
  project: ProjectRecord
  body: Record<string, unknown>
}) {
  const linkedRef = (params.project?.supabaseProjectRef ?? "").toString().trim()
  if (linkedRef) {
    const credentials = await fetchProjectCredentials(params.uid, linkedRef)
    return credentials
  }

  const requestedRef = (params.body?.supabaseProjectRef ?? params.body?.supabaseProjectId ?? "").toString().trim()
  if (requestedRef) {
    return fetchProjectCredentials(params.uid, requestedRef)
  }

  const createProject = params.body?.createProject === true
  if (!createProject) {
    throw new Error("No linked Supabase project. Provide supabaseProjectRef or set createProject=true.")
  }

  const projectName =
    (params.body?.projectName ?? params.body?.name ?? params.project?.name ?? "").toString().trim()
  const region = (params.body?.region ?? "").toString().trim()
  const dbPassword =
    (params.body?.dbPassword ?? params.body?.databasePassword ?? "").toString().trim() ||
    crypto.randomBytes(24).toString("base64url")
  const organizationId = await resolveOrganizationId(
    params.uid,
    (params.body?.organizationId ?? "").toString().trim()
  )

  if (!projectName || !region) {
    throw new Error("Missing required fields to create Supabase project: projectName, region")
  }
  if (!organizationId) {
    throw new Error("No Supabase organization found for this account")
  }

  const created = await supabaseManagementFetch<SupabaseProjectRecord>(params.uid, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      region,
      db_pass: dbPassword,
      organization_id: organizationId,
    }),
  })

  const projectRef = (created?.ref ?? created?.id ?? "").toString().trim()
  if (!projectRef) {
    throw new Error("Supabase project was created without a project ref")
  }

  return fetchProjectCredentials(params.uid, projectRef)
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const projectId = (body?.projectId ?? "").toString().trim()
    const userId = (body?.userId ?? "").toString().trim()

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }
    if (userId && userId !== uid) {
      return NextResponse.json({ error: "userId does not match authenticated user" }, { status: 403 })
    }

    await assertProjectCanEdit(projectId, uid)

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const project = projectSnap.data() as ProjectRecord
    const prompt = (project?.prompt ?? "").toString().trim()
    if (!prompt) {
      return NextResponse.json({ error: "Project prompt is missing" }, { status: 400 })
    }

    const connection = await getSupabaseConnection(uid)
    if (!connection) {
      return NextResponse.json({ error: "Supabase OAuth connection required" }, { status: 401 })
    }

    if (project?.supabaseProjectRef && project?.supabaseUrl && project?.supabaseAnonKey) {
      return NextResponse.json({
        supabaseUrl: project.supabaseUrl,
        supabaseAnonKey: project.supabaseAnonKey,
        projectRef: project.supabaseProjectRef,
      })
    }

    const files = Array.isArray(project?.files) ? project.files : []
    const messages = Array.isArray(project?.messages) ? project.messages : []
    const companyContext = await getWorkspaceContext((project?.workspaceId ?? "").toString().trim())

    const plan = await analyzeSupabaseProvisioningNeed({
      prompt,
      projectName: (project?.name ?? "").toString().trim(),
      messages,
      files,
      generationMeta: project?.generationMeta,
    })

    if (!plan?.shouldProvision) {
      await projectRef.set(
        {
          supabaseProvisioningStatus: "skipped",
          supabaseProvisioningReason: plan?.reason || "Backend not required",
          supabaseProvisionedAt: null,
        },
        { merge: true }
      )

      return NextResponse.json({
        supabaseUrl: "",
        supabaseAnonKey: "",
        projectRef: "",
      })
    }

    const linkedProject = await ensureLinkedSupabaseProject({
      uid,
      projectId,
      project,
      body,
    })

    const schemaResult =
      typeof project?.generatedSchemaSql === "string" && project.generatedSchemaSql.trim()
        ? {
            sql: project.generatedSchemaSql.trim(),
            tables: Array.isArray(project?.generatedSchemaTables) ? project.generatedSchemaTables : extractSqlTables(project.generatedSchemaSql),
          }
        : await generatePostgresSchema({
            appPrompt: prompt,
            projectName: (project?.name ?? "").toString().trim(),
            companyContext,
            existingFiles: files,
            conversationMessages: messages.map((message) => `${message.role}: ${message.content}`),
            setupReason: plan.reason,
          })

    let schemaPushStatus = "skipped"
    let schemaPushError = ""

    if (schemaResult.sql.trim()) {
      try {
        await supabaseManagementFetch(uid, `/v1/projects/${encodeURIComponent(linkedProject.projectRef)}/database/query`, {
          method: "POST",
          body: JSON.stringify({ query: schemaResult.sql }),
        })
        schemaPushStatus = "success"
      } catch (err) {
        schemaPushStatus = "failed"
        schemaPushError = err instanceof Error ? err.message : "Unknown schema push error"
        throw err
      }
    }

    await adminDb.collection("supabaseLinks").doc(projectId).set(
      {
        id: projectId,
        userId: uid,
        builderProjectId: projectId,
        supabaseProjectRef: linkedProject.projectRef,
        supabaseProjectName: linkedProject.projectName,
        supabaseUrl: linkedProject.supabaseUrl,
        supabaseAnonKey: linkedProject.supabaseAnonKey,
        oauthTokenId: uid,
        updatedAt: new Date(),
        ...(project?.supabaseProjectRef ? {} : { createdAt: new Date() }),
      },
      { merge: true }
    )

    await projectRef.set(
      {
        generatedSchemaSql: schemaResult.sql,
        generatedSchemaTables: schemaResult.tables,
        generatedSchemaUpdatedAt: new Date(),
        schemaPushedAt: schemaResult.sql.trim() ? new Date() : null,
        schemaPushStatus,
        schemaPushError: schemaPushError || null,
        supabaseProjectRef: linkedProject.projectRef,
        supabaseProjectName: linkedProject.projectName,
        supabaseUrl: linkedProject.supabaseUrl,
        supabaseAnonKey: linkedProject.supabaseAnonKey,
        supabaseProvisioningStatus: "success",
        supabaseProvisioningReason: plan.reason,
        supabaseProvisionedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      supabaseUrl: linkedProject.supabaseUrl,
      supabaseAnonKey: linkedProject.supabaseAnonKey,
      projectRef: linkedProject.projectRef,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to auto-setup Supabase"
    const status =
      message.includes("Forbidden") ? 403 :
      message.includes("not found") ? 404 :
      message.includes("OAuth") || message.includes("connected") ? 401 :
      message.includes("Missing") || message.includes("Provide") ? 400 :
      message.includes("organization") ? 400 :
      500

    return NextResponse.json({ error: message }, { status })
  }
}
