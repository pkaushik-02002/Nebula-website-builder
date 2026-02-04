import JSZip from "jszip"
import { NextResponse } from "next/server"
import { Sandbox } from "@e2b/code-interpreter"
import { adminDb } from "@/lib/firebase-admin"
import { getUserNetlifyToken, requireUserUid } from "@/lib/server-auth"
import { Buffer } from "buffer"

export const runtime = "nodejs"

function jsonLine(obj: any) {
  return JSON.stringify(obj) + "\n"
}

async function getProjectFiles(projectId: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) return null
  const data = snap.data() as any
  const files = Array.isArray(data?.files) ? data.files : null
  return { data, files }
}

async function writeFilesToSandbox(sandbox: Sandbox, files: any[]) {
  await sandbox.files.makeDir("/home/user/project")
  for (const file of files) {
    const filePath = `/home/user/project/${file.path}`
    const dir = filePath.substring(0, filePath.lastIndexOf("/"))
    if (dir) {
      await sandbox.files.makeDir(dir)
    }
    await sandbox.files.write(filePath, file.content)
  }
}

async function zipDistFromSandbox(sandbox: Sandbox) {
  // List all files under dist
  const list = await sandbox.commands.run(
    "bash -lc \"cd /home/user/project && find dist -type f -print\"",
    { timeoutMs: 20000 }
  )

  if (list.exitCode !== 0) {
    const combined = `${list.stdout || ""}\n${list.stderr || ""}`.trim()
    throw new Error(combined || "Failed to list dist files")
  }

  const paths = (list.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)

  const zip = new JSZip()

  for (const fullPath of paths) {
    // Ensure zip root is dist/* (strip leading dist/)
    const rel = fullPath.replace(/^dist\//, "")

    const b64 = await sandbox.commands.run(
      `bash -lc \"cd /home/user/project && base64 -w 0 '${fullPath.replace(/'/g, "'\\''")}'\"`,
      { timeoutMs: 20000 }
    )

    if (b64.exitCode !== 0) {
      const combined = `${b64.stdout || ""}\n${b64.stderr || ""}`.trim()
      throw new Error(combined || `Failed to read ${fullPath}`)
    }

    const data = (b64.stdout || "").trim()
    zip.file(rel, data, { base64: true })
  }

  return zip.generateAsync({ type: "uint8array" })
}

export async function POST(req: Request) {
  let projectId = ""
  let requestedSiteId: string | null = null
  let requestedSiteName: string | null = null

  try {
    const body = await req.json()
    projectId = String(body?.projectId || "")
    requestedSiteId = body?.siteId ? String(body.siteId) : null
    requestedSiteName = body?.siteName ? String(body.siteName) : null
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(jsonLine(obj)))

      try {
        const uid = await requireUserUid(req)
        const token = await getUserNetlifyToken(uid)

        if (!token) {
          send({ type: "error", error: "Netlify not connected" })
          controller.close()
          return
        }

        const project = await getProjectFiles(projectId)
        if (!project || !project.files) {
          send({ type: "error", error: "Project not found or missing files" })
          controller.close()
          return
        }

        // Ensure netlify.toml exists for clarity/portability (even though we're deploying dist output directly)
        const hasNetlifyToml = project.files.some((f: any) => f?.path === "netlify.toml")
        if (!hasNetlifyToml) {
          project.files = [
            ...project.files,
            {
              path: "netlify.toml",
              content: [
                "[build]",
                "  publish = \"dist\"",
                "  command = \"npm run build\"",
                "",
                "[[redirects]]",
                "  from = \"/*\"",
                "  to = \"/index.html\"",
                "  status = 200",
                "",
              ].join("\n"),
            },
          ]
        }

        send({ type: "step", step: "install", status: "running", message: "Installing dependencies..." })

        const sandbox = await Sandbox.create("base", {
          apiKey: process.env.E2B_API_KEY,
          timeoutMs: 300000,
        })

        await writeFilesToSandbox(sandbox, project.files)

        const hasLockFile = project.files.some(
          (f: any) => f?.path === "package-lock.json" || f?.path === "npm-shrinkwrap.json"
        )

        const installCmd = hasLockFile
          ? "bash -lc \"cd /home/user/project && npm ci\""
          : "bash -lc \"cd /home/user/project && npm install --no-audit --no-fund\""

        const install = await sandbox.commands.run(installCmd, {
          timeoutMs: 240000,
          onStdout: (d) => send({ type: "log", stream: "stdout", step: "install", message: (d as any)?.line || String(d) }),
          onStderr: (d) => send({ type: "log", stream: "stderr", step: "install", message: (d as any)?.line || String(d) }),
        })

        if (install.exitCode !== 0) {
          // If npm ci failed (missing lockfile), retry with npm install once.
          if (hasLockFile) {
            send({ type: "log", stream: "stderr", step: "install", message: "npm ci failed, retrying with npm install..." })
            const install2 = await sandbox.commands.run(
              "bash -lc \"cd /home/user/project && npm install --no-audit --no-fund\"",
              {
                timeoutMs: 240000,
                onStdout: (d) =>
                  send({ type: "log", stream: "stdout", step: "install", message: (d as any)?.line || String(d) }),
                onStderr: (d) =>
                  send({ type: "log", stream: "stderr", step: "install", message: (d as any)?.line || String(d) }),
              }
            )

            if (install2.exitCode !== 0) {
              send({ type: "step", step: "install", status: "failed", message: "Install failed" })
              send({ type: "error", error: "Install failed" })
              controller.close()
              return
            }
          } else {
            send({ type: "step", step: "install", status: "failed", message: "Install failed" })
            send({ type: "error", error: "Install failed" })
            controller.close()
            return
          }
        }

        send({ type: "step", step: "install", status: "success", message: "Dependencies installed" })

        send({ type: "step", step: "build", status: "running", message: "Building project..." })

        const build = await sandbox.commands.run("bash -lc \"cd /home/user/project && npm run build\"", {
          timeoutMs: 300000,
          onStdout: (d) => send({ type: "log", stream: "stdout", step: "build", message: (d as any)?.line || String(d) }),
          onStderr: (d) => send({ type: "log", stream: "stderr", step: "build", message: (d as any)?.line || String(d) }),
        })

        if (build.exitCode !== 0) {
          send({ type: "step", step: "build", status: "failed", message: "Build failed" })
          send({ type: "error", error: "Build failed" })
          controller.close()
          return
        }

        send({ type: "step", step: "build", status: "success", message: "Build complete" })

        send({ type: "step", step: "redirects", status: "running", message: "Configuring SPA redirects..." })
        await sandbox.files.write(
          "/home/user/project/dist/_redirects",
          "/* /index.html 200\n"
        )
        send({ type: "step", step: "redirects", status: "success", message: "SPA redirects ready" })

        send({ type: "step", step: "zip", status: "running", message: "Creating ZIP..." })
        const zipBytes = await zipDistFromSandbox(sandbox)
        const zipBody = Buffer.from(zipBytes)
        send({ type: "step", step: "zip", status: "success", message: "ZIP ready" })

        send({ type: "step", step: "upload", status: "running", message: "Uploading to Netlify..." })

        let siteId: string | null = requestedSiteId || project.data?.netlifySiteId || null
        let siteUrl: string | null = project.data?.netlifySiteUrl || null
        let adminUrl: string | null = project.data?.netlifyAdminUrl || null

        // Helper to slugify a human-friendly site name into a Netlify-safe subdomain
        const slugifySiteName = (name: string) =>
          (name || "")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60)

        if (!siteId) {
          const fallbackName = `project-${projectId.toLowerCase().slice(0, 12)}`
          const rawName = (requestedSiteName || "").trim()
          const safeName = slugifySiteName(rawName) || fallbackName

          const createSiteRes = await fetch("https://api.netlify.com/api/v1/sites", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: safeName }),
          })

          if (!createSiteRes.ok) {
            const t = await createSiteRes.text().catch(() => "")
            throw new Error(`Failed to create site: ${createSiteRes.status} ${t}`)
          }

          const s = (await createSiteRes.json()) as any
          siteId = s?.id
          siteUrl = s?.url || s?.ssl_url || null
          adminUrl = s?.admin_url || null
        } else if (requestedSiteName) {
          // Existing site: try to rename it when user provides a new name
          const rawName = requestedSiteName.trim()
          const safeName = slugifySiteName(rawName)
          if (safeName) {
            try {
              const updateSiteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: safeName }),
              })

              if (updateSiteRes.ok) {
                const s = (await updateSiteRes.json()) as any
                siteUrl = s?.url || s?.ssl_url || siteUrl
                adminUrl = s?.admin_url || adminUrl
              }
            } catch {
              // If rename fails, keep using existing site without failing the whole deploy
            }
          }
        }

        const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/zip",
          },
          body: zipBody,
        })

        if (!deployRes.ok) {
          const t = await deployRes.text().catch(() => "")
          throw new Error(`Deploy failed: ${deployRes.status} ${t}`)
        }

        const deploy = (await deployRes.json()) as any
        const deployId = deploy?.id || deploy?.deploy_id || null
        const deployUrl = deploy?.deploy_ssl_url || deploy?.ssl_url || deploy?.deploy_url || null

        await adminDb.collection("projects").doc(projectId).set(
          {
            netlifySiteId: siteId,
            netlifySiteUrl: siteUrl,
            netlifyAdminUrl: adminUrl,
            netlifyDeployId: deployId,
            netlifyDeployUrl: deployUrl,
            netlifyUpdatedAt: new Date(),
          },
          { merge: true }
        )

        send({ type: "step", step: "upload", status: "success", message: "Deploy created" })
        send({
          type: "success",
          siteId,
          deployId,
          siteUrl,
          deployUrl,
          adminUrl,
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
