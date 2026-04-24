import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

function jsonLine(obj: any) {
  return JSON.stringify(obj) + "\n"
}

/** Vercel: project names must be lowercase, letters/digits/._-, no sequence '---', max 100 chars */
function toVercelProjectName(projectId: string): string {
  const base = `lotus-build-${projectId}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return (base || "lotus-build-project").slice(0, 100)
}

async function getProjectWithVercel(projectId: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) return null
  const data = snap.data() as any
  const files = Array.isArray(data?.files) ? data.files : null
  const token = typeof data?.vercelToken === "string" ? data.vercelToken : null
  const name = toVercelProjectName(projectId)
  return { data, files, token, name, teamId: null as string | null }
}

async function getComputerWithVercel(computerId: string) {
  const snap = await adminDb.collection("computers").doc(computerId).get()
  if (!snap.exists) return null
  const data = snap.data() as any
  const files = Array.isArray(data?.files) ? data.files : null
  const token = typeof data?.vercelToken === "string" ? data.vercelToken : null
  const name = toVercelProjectName(computerId)
  return { data, files, token, name, teamId: null as string | null }
}

function normalizeSourceImports(files: any[]) {
  return files.map((file: any) => {
    if (!file?.path || typeof file.content !== "string") return file
    if (!/\.(tsx?|jsx?)$/.test(file.path)) return file

    const normalizedContent = file.content.replace(
      /((?:from\s+|import\s+)\s*["'][^"']+)\.(tsx?|jsx?)(["'])/g,
      "$1$3"
    )

    return normalizedContent === file.content
      ? file
      : { ...file, content: normalizedContent }
  })
}

export async function POST(req: Request) {
  let projectId = ""
  let computerId = ""

  try {
    const body = await req.json()
    projectId = String(body?.projectId || "")
    computerId = String(body?.computerId || "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const isComputer = !!computerId
  const sourceId = computerId || projectId

  if (!sourceId) {
    return NextResponse.json({ error: "Missing projectId or computerId" }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(jsonLine(obj)))

      try {
        const uid = await requireUserUid(req)
        const project = isComputer
          ? await getComputerWithVercel(computerId)
          : await getProjectWithVercel(projectId)

        if (!project) {
          send({ type: "error", error: "Project not found" })
          controller.close()
          return
        }

        const ownerId = (project.data as any)?.ownerId ?? (project.data as any)?.userId
        if (ownerId && ownerId !== uid) {
          send({ type: "error", error: "Forbidden" })
          controller.close()
          return
        }

        if (!project.token) {
          send({ type: "error", error: "Vercel not connected" })
          controller.close()
          return
        }

        if (!project.files?.length) {
          send({ type: "error", error: "Project not found or missing files" })
          controller.close()
          return
        }

        send({ type: "step", step: "starting", status: "running", message: "Starting deployment..." })
        send({ type: "log", message: "Uploading files..." })

        const normalizedFiles = normalizeSourceImports(project.files)

        const files = normalizedFiles.map((f: any) => ({
          file: f.path,
          data: typeof f.content === "string" ? f.content : "",
        }))

        const deployPayload: Record<string, unknown> = {
          name: project.name,
          files,
          target: "production",
        }

        const apiUrl = new URL("https://api.vercel.com/v13/deployments")
        if (project.teamId) {
          apiUrl.searchParams.set("teamId", project.teamId)
        }
        apiUrl.searchParams.set("skipAutoDetectionConfirmation", "1")

        const deployRes = await fetch(apiUrl.toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${project.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(deployPayload),
        })

        if (!deployRes.ok) {
          const t = await deployRes.text().catch(() => "")
          throw new Error(`Vercel deploy failed: ${deployRes.status} ${t}`)
        }

        const deploy = (await deployRes.json()) as any
        const deploymentId = deploy?.id || null
        const deployUrl = deploy?.url ? `https://${deploy.url}` : null
        const alias = Array.isArray(deploy?.alias) && deploy.alias[0] ? deploy.alias[0] : null
        const siteUrl = alias ? (alias.startsWith("http") ? alias : `https://${alias}`) : deployUrl
        const adminUrl = deploymentId
          ? `https://vercel.com/dashboard/deployments/${deploymentId}`
          : null

        await adminDb.collection(isComputer ? "computers" : "projects").doc(sourceId).set(
          {
            vercelDeployUrl: siteUrl || deployUrl,
            deployUrl: siteUrl || deployUrl,
            vercelDeploymentId: deploymentId,
            vercelUpdatedAt: new Date(),
          },
          { merge: true }
        )

        send({ type: "step", step: "upload", status: "success", message: "Deploy created" })
        send({
          type: "success",
          siteUrl: siteUrl || deployUrl,
          deployUrl: deployUrl || siteUrl,
          adminUrl,
          deploymentId,
        })

        controller.close()
      } catch (err: any) {
        send({ type: "error", error: err?.message || "Deploy failed" })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  })
}
