import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { getGitHubToken, requireUserUid } from "@/lib/server-auth"
import {
  getAllAppInstallationRepos,
  getAppInstallations,
  getInstallationToken,
  getUserInstallationRepos,
  getUserInstallations,
} from "@/lib/integrations/github-app"

export const runtime = "nodejs"

const GITHUB_API = "https://api.github.com"

async function getProject(projectId: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) return null
  const data = snap.data() as {
    name?: string
    files?: { path: string; content: string }[]
    githubRepoFullName?: string
    githubInstallationId?: number
  }
  const files = Array.isArray(data?.files) ? data.files : null
  return { data, files }
}

function slugifyRepoName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return slug || "builderstudio-site"
}

async function createRepositoryForInstallation(params: {
  userToken: string
  installationId: number
  ownerLogin: string
  ownerType?: string | null
  baseName: string
  description?: string
}): Promise<{ repoFullName: string; installationId: number }> {
  const ownerType = String(params.ownerType || "").toLowerCase()
  const candidateNames = [
    params.baseName,
    `${params.baseName}-${Date.now().toString().slice(-6)}`,
    `${params.baseName}-${Math.random().toString(36).slice(2, 8)}`,
  ]

  for (const name of candidateNames) {
    if (!name) continue

    if (ownerType === "organization") {
      const installationToken = await getInstallationToken(params.installationId)
      const res = await githubRequest(installationToken, "POST", `/orgs/${params.ownerLogin}/repos`, {
        name,
        description: params.description,
        private: true,
        auto_init: true,
      })
      if (res.ok) {
        const json = await res.json()
        return {
          repoFullName: String(json?.full_name || `${params.ownerLogin}/${name}`),
          installationId: params.installationId,
        }
      }
      const errText = await res.text().catch(() => "")
      if (res.status !== 422) {
        throw new Error(`Failed to create GitHub repository: ${res.status} ${errText}`)
      }
      continue
    }

    const res = await githubRequest(params.userToken, "POST", "/user/repos", {
      name,
      description: params.description,
      private: true,
      auto_init: true,
    })
    if (res.ok) {
      const json = await res.json()
      return {
        repoFullName: String(json?.full_name || `${params.ownerLogin}/${name}`),
        installationId: params.installationId,
      }
    }
    const errText = await res.text().catch(() => "")
    if (res.status !== 422) {
      throw new Error(`Failed to create GitHub repository: ${res.status} ${errText}`)
    }
  }

  throw new Error("Could not create a unique GitHub repository name for this project.")
}

async function githubRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const token = await getGitHubToken(uid)
    if (!token) {
      return NextResponse.json({ error: "GitHub not connected. Connect your account in Settings." }, { status: 400 })
    }

    let projectId: string
    try {
      const body = await req.json()
      projectId = String(body?.projectId ?? "")
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project || !project.files || project.files.length === 0) {
      return NextResponse.json({ error: "Project not found or has no files" }, { status: 404 })
    }

    const { data: projectData, files } = project
    const installations = await getUserInstallations(token)
    const appInstallations = await getAppInstallations().catch(() => [])
    if (!installations.length) {
      try {
        const fallbackRepos = await getAllAppInstallationRepos()
        if (fallbackRepos.length) {
          const preferredRepoFullName = String(projectData?.githubRepoFullName || "")
          const selectedRepo =
            (preferredRepoFullName
              ? fallbackRepos.find((repo) => String(repo.full_name) === preferredRepoFullName)
              : null) || fallbackRepos[0]

          if (selectedRepo?.full_name) {
            const installationId = Number(selectedRepo.installationId)
            const [owner, repoName] = String(selectedRepo.full_name).split("/")
            if (!owner || !repoName) {
              return NextResponse.json({ error: "Invalid GitHub repository on project." }, { status: 400 })
            }

            const installationToken = await getInstallationToken(installationId)

            for (const file of files) {
              const path = file.path
              const content = Buffer.from(file.content, "utf8").toString("base64")
              const encodedPath = encodeURIComponent(path)

              let sha: string | undefined
              const getRes = await githubRequest(installationToken, "GET", `/repos/${owner}/${repoName}/contents/${encodedPath}`)
              if (getRes.ok) {
                const getJson = await getRes.json()
                sha = getJson?.sha
              }

              const putRes = await githubRequest(installationToken, "PUT", `/repos/${owner}/${repoName}/contents/${encodedPath}`, {
                message: `Sync from lotus.build: ${path}`,
                content,
                ...(sha ? { sha } : {}),
              })

              if (!putRes.ok) {
                const errText = await putRes.text()
                return NextResponse.json(
                  { error: `Failed to sync file ${path}: ${putRes.status} ${errText}` },
                  { status: 500 }
                )
              }
            }

            const repoUrl = `https://github.com/${selectedRepo.full_name}`
            const syncedAt = new Date()

            await adminDb.collection("projects").doc(projectId).set(
              {
                githubRepoUrl: repoUrl,
                githubRepoFullName: selectedRepo.full_name,
                githubInstallationId: installationId,
                githubSyncedAt: syncedAt,
              },
              { merge: true }
            )

            return NextResponse.json({
              repoUrl,
              repoFullName: selectedRepo.full_name,
              syncedAt: syncedAt.toISOString(),
              filesCount: files.length,
            })
          }
        }
      } catch {
        // Fall through to the existing user-facing error below.
      }

      return NextResponse.json(
        {
          error:
            "No installed repositories found for this GitHub App. Install the app on at least one repository, then reconnect GitHub and publish again.",
        },
        { status: 400 }
      )
    }

    let installationId = Number(projectData?.githubInstallationId || 0)
    const preferredRepoFullName = String(projectData?.githubRepoFullName || "")
    let repoFullName = preferredRepoFullName

    for (const installation of installations) {
      const iid = Number(installation.id)
      if (!iid) continue
      const repos = await getUserInstallationRepos(token, iid)
      if (!repos.length) continue

      if (preferredRepoFullName) {
        const found = repos.find((r) => String(r.full_name) === preferredRepoFullName)
        if (found) {
          installationId = iid
          repoFullName = preferredRepoFullName
          break
        }
      }

      // Fallback: if the saved repo is no longer accessible, use first installed repo.
      installationId = iid
      repoFullName = String(repos[0]?.full_name || "")
      if (repoFullName) break
    }

    if (!installationId || !repoFullName) {
      try {
        const fallbackRepos = await getAllAppInstallationRepos()
        const preferredRepo =
          (preferredRepoFullName
            ? fallbackRepos.find((repo) => String(repo.full_name) === preferredRepoFullName)
            : null) || fallbackRepos[0]

        if (preferredRepo?.full_name) {
          installationId = Number(preferredRepo.installationId)
          repoFullName = String(preferredRepo.full_name)
        }
      } catch {
        // Keep the user-facing error below if fallback resolution also fails.
      }
    }

    if (!installationId || !repoFullName) {
      const chosenInstallationId =
        Number(projectData?.githubInstallationId || 0) ||
        Number(installations[0]?.id || 0) ||
        Number(appInstallations[0]?.id || 0)

      const chosenInstallation = appInstallations.find((installation) => Number(installation.id) === chosenInstallationId) || appInstallations[0]
      const ownerLogin = String(chosenInstallation?.account?.login || "")
      const ownerType = String(chosenInstallation?.account?.type || "")

      if (!chosenInstallationId || !ownerLogin) {
        return NextResponse.json(
          {
            error:
              "No accessible repository available for this GitHub App installation, and no install target was available to create a new repository.",
          },
          { status: 400 }
        )
      }

      const created = await createRepositoryForInstallation({
        userToken: token,
        installationId: chosenInstallationId,
        ownerLogin,
        ownerType,
        baseName: slugifyRepoName(String(projectData?.name || `builderstudio-${projectId}`)),
        description: `Generated from BuilderStudio project ${projectId}`,
      })

      installationId = created.installationId
      repoFullName = created.repoFullName
    }

    const [owner, repoName] = repoFullName.split("/")
    if (!owner || !repoName) {
      return NextResponse.json({ error: "Invalid GitHub repository on project." }, { status: 400 })
    }

    const installationToken = await getInstallationToken(installationId)

    for (const file of files) {
      const path = file.path
      const content = Buffer.from(file.content, "utf8").toString("base64")
      const encodedPath = encodeURIComponent(path)

      let sha: string | undefined
      const getRes = await githubRequest(installationToken, "GET", `/repos/${owner}/${repoName}/contents/${encodedPath}`)
      if (getRes.ok) {
        const getJson = await getRes.json()
        sha = getJson?.sha
      }

      const putRes = await githubRequest(installationToken, "PUT", `/repos/${owner}/${repoName}/contents/${encodedPath}`, {
        message: `Sync from lotus.build: ${path}`,
        content,
        ...(sha ? { sha } : {}),
      })

      if (!putRes.ok) {
        const errText = await putRes.text()
        return NextResponse.json(
          { error: `Failed to sync file ${path}: ${putRes.status} ${errText}` },
          { status: 500 }
        )
      }
    }

    const repoUrl = `https://github.com/${repoFullName}`
    const syncedAt = new Date()

    await adminDb.collection("projects").doc(projectId).set(
      {
        githubRepoUrl: repoUrl,
        githubRepoFullName: repoFullName,
        githubInstallationId: installationId,
        githubSyncedAt: syncedAt,
      },
      { merge: true }
    )

    return NextResponse.json({
      repoUrl,
      repoFullName,
      syncedAt: syncedAt.toISOString(),
      filesCount: files.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
