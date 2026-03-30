import { NextResponse } from "next/server"

import type { Message } from "@/app/project/[id]/types"
import { adminDb } from "@/lib/firebase-admin"
import {
  analyzeSupabaseProvisioningNeed,
  generateSupabaseIntegrationUpdates,
  mergeProjectFiles,
} from "@/lib/integrations/supabase/provision"
import { generatePostgresSchema } from "@/lib/integrations/supabase/schema"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { supabaseManagementFetch } from "@/lib/supabase-management"
import { encryptEnvVars } from "@/lib/encrypt-env"

export const runtime = "nodejs"

type ProjectRecord = {
  name?: string
  prompt?: string
  workspaceId?: string
  files?: Array<{ path: string; content: string }>
  messages?: Message[]
  generatedSchemaSql?: string
  generatedSchemaTables?: string[]
  supabaseUrl?: string
  supabaseAnonKey?: string
  generationMeta?: Record<string, unknown>
}

function ensureSupportFiles(params: {
  files: Array<{ path: string; content: string }>
  schemaSql: string
}) {
  const next = new Map(params.files.map((file) => [file.path, file]))

  if (!next.has(".env.example")) {
    next.set(".env.example", {
      path: ".env.example",
      content: [
        "VITE_SUPABASE_URL=",
        "VITE_SUPABASE_ANON_KEY=",
      ].join("\n"),
    })
  }

  if (params.schemaSql.trim()) {
    next.set("supabase/migrations/001_initial.sql", {
      path: "supabase/migrations/001_initial.sql",
      content: params.schemaSql.trim(),
    })
  }

  return Array.from(next.values())
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = (body?.projectId ?? "").toString().trim()
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
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

    const linkSnap = await adminDb.collection("supabaseLinks").doc(projectId).get()
    if (!linkSnap.exists) {
      return NextResponse.json({ error: "No Supabase project linked" }, { status: 400 })
    }

    const link = linkSnap.data() as { supabaseProjectRef?: string; supabaseUrl?: string; supabaseAnonKey?: string }
    const projectRefId = (link?.supabaseProjectRef ?? "").toString().trim()
    const supabaseUrl = (project?.supabaseUrl ?? link?.supabaseUrl ?? "").toString().trim()
    const supabaseAnonKey = (project?.supabaseAnonKey ?? link?.supabaseAnonKey ?? "").toString().trim()

    if (!projectRefId || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Linked Supabase project is incomplete. Re-link the project." }, { status: 400 })
    }

    let companyContext = ""
    const workspaceId = (project?.workspaceId ?? "").toString().trim()
    if (workspaceId) {
      const wsSnap = await adminDb.collection("workspaces").doc(workspaceId).get()
      if (wsSnap.exists) {
        const ws = wsSnap.data() as { aiContextPrompt?: string }
        companyContext = (ws?.aiContextPrompt ?? "").toString().trim()
      }
    }

    const files = Array.isArray(project?.files) ? project.files : []
    const messages = Array.isArray(project?.messages) ? project.messages : []
    const generationMeta = project?.generationMeta

    const plan = await analyzeSupabaseProvisioningNeed({
      prompt,
      projectName: (project?.name ?? "").toString().trim(),
      messages,
      files,
      generationMeta,
    })

    if (!plan.shouldProvision) {
      await projectRef.set(
        {
          supabaseProvisioningStatus: "not-needed",
          supabaseProvisioningReason: plan.reason,
          supabaseProvisionedAt: new Date(),
        },
        { merge: true }
      )

      return NextResponse.json({ ok: true, provisioned: false, reason: plan.reason })
    }

    const schemaSql =
      typeof project?.generatedSchemaSql === "string" && project.generatedSchemaSql.trim()
        ? project.generatedSchemaSql.trim()
        : plan.needsSchema
          ? (
              await generatePostgresSchema({
                appPrompt: prompt,
                projectName: (project?.name ?? "").toString().trim(),
                companyContext,
                existingFiles: files,
                conversationMessages: messages.map((message) => `${message.role}: ${message.content}`),
                setupReason: plan.reason,
              })
            ).sql
          : ""

    if (schemaSql) {
      await supabaseManagementFetch(uid, `/v1/projects/${encodeURIComponent(projectRefId)}/database/query`, {
        method: "POST",
        body: JSON.stringify({ query: schemaSql }),
      })
    }

    let nextFiles = files
    if (plan.needsClientIntegration) {
      const updates = await generateSupabaseIntegrationUpdates({
        prompt,
        projectName: (project?.name ?? "").toString().trim(),
        messages,
        files,
        schemaSql,
        supabaseUrl,
        anonKeyPresent: Boolean(supabaseAnonKey),
        setupReason: plan.reason,
      })

      if (updates.length > 0) {
        nextFiles = mergeProjectFiles(files, updates)
      }
    }

    nextFiles = ensureSupportFiles({ files: nextFiles, schemaSql })

    const { encrypted } = encryptEnvVars(
      JSON.stringify({
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
      })
    )

    await projectRef.set(
      {
        files: nextFiles,
        generatedSchemaSql: schemaSql || project?.generatedSchemaSql || "",
        generatedSchemaTables: Array.isArray(project?.generatedSchemaTables) ? project.generatedSchemaTables : [],
        schemaPushedAt: schemaSql ? new Date() : null,
        schemaPushStatus: schemaSql ? "success" : "skipped",
        envVarsEncrypted: encrypted,
        envVarNames: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
        envVarsUpdatedAt: new Date(),
        supabaseProvisioningStatus: "success",
        supabaseProvisioningReason: plan.reason,
        supabaseProvisionedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      provisioned: true,
      reason: plan.reason,
      filesUpdated: nextFiles.length,
      schemaApplied: Boolean(schemaSql),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to provision Supabase"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
