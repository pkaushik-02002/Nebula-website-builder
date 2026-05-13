import OpenAI from "openai"
import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type ProjectFile = { path: string; content: string }

type FixAttemptResult = {
  explanation: string
  files: ProjectFile[]
  issues: string[]
}

function extractAgentMessage(content: string): { agentMessage: string | null; contentWithoutAgent: string } {
  const match = content.match(/===AGENT_MESSAGE===\s*([\s\S]*?)\s*===END_AGENT_MESSAGE===/)
  if (!match) return { agentMessage: null, contentWithoutAgent: content }
  return {
    agentMessage: match[1].trim(),
    contentWithoutAgent: content.replace(match[0], "").trim(),
  }
}

function parseFileMentions(input: string): string[] {
  if (!input) return []
  const matches = input.match(/[A-Za-z0-9_./\\-]+\.(tsx?|jsx?|css|scss|json|mjs|cjs|js|svg|png|jpg|jpeg|webp|gif|ico)/g) || []
  return [...new Set(matches.map((match) => match.replace(/\\/g, "/")))]
}

function pickContextFiles(files: ProjectFile[], errorText: string, expanded: boolean): ProjectFile[] {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const picked = new Set<string>()

  for (const mentionedPath of parseFileMentions(errorText)) {
    if (byPath.has(mentionedPath)) picked.add(mentionedPath)
  }

  for (const important of [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
  ]) {
    if (byPath.has(important)) picked.add(important)
  }

  const limit = expanded ? 24 : 12
  for (const file of files) {
    if (picked.size >= limit) break
    if (/\.(tsx?|jsx?|css|scss|json|svg)$/.test(file.path)) picked.add(file.path)
  }

  return [...picked]
    .map((path) => byPath.get(path))
    .filter((file): file is ProjectFile => Boolean(file))
}

function parseStreamingFiles(content: string): ProjectFile[] {
  const files: ProjectFile[] = []
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()

    if (path) files.push({ path, content: fileContent })
  }

  return files
}

function mergeFiles(originalFiles: ProjectFile[], updatedFiles: ProjectFile[]): ProjectFile[] {
  const merged = originalFiles.map((file) => ({ ...file }))
  const indexByPath = new Map(merged.map((file, index) => [file.path, index]))

  for (const file of updatedFiles) {
    const existingIndex = indexByPath.get(file.path)
    if (existingIndex == null) {
      merged.push({ ...file })
      indexByPath.set(file.path, merged.length - 1)
    } else {
      merged[existingIndex] = { ...file }
    }
  }

  return merged
}

function validateFiles(files: ProjectFile[]) {
  const issues = new Set<string>()
  const availablePaths = new Set(files.map((file) => file.path))

  for (const file of files) {
    if (!/\.(tsx?|jsx?|js)$/.test(file.path)) continue

    const importerDir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""
    const importRegex = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g
    let importMatch: RegExpExecArray | null

    while ((importMatch = importRegex.exec(file.content)) !== null) {
      const rawImport = importMatch[1] || importMatch[2]
      if (!rawImport) continue

      const normalizedBase = rawImport
        .split("/")
        .reduce<string[]>((parts, segment) => {
          if (!segment || segment === ".") return parts
          if (segment === "..") {
            parts.pop()
            return parts
          }
          parts.push(segment)
          return parts
        }, importerDir ? importerDir.split("/") : [])
        .join("/")

      const candidatePaths = [
        normalizedBase,
        `${normalizedBase}.ts`,
        `${normalizedBase}.tsx`,
        `${normalizedBase}.js`,
        `${normalizedBase}.jsx`,
        `${normalizedBase}.css`,
        `${normalizedBase}/index.ts`,
        `${normalizedBase}/index.tsx`,
        `${normalizedBase}/index.js`,
      ]

      if (!candidatePaths.some((candidate) => availablePaths.has(candidate))) {
        issues.add(`Missing import target "${rawImport}" referenced from ${file.path}`)
      }
    }

    const assetMatches = file.content.match(/["'](?:\/|\.\/)[^"']+\.(svg|png|jpg|jpeg|webp|gif|ico)["']/g) || []
    for (const assetLiteral of assetMatches) {
      const assetPath = assetLiteral.slice(1, -1)
      const normalizedAssetPath = assetPath.startsWith("/")
        ? `public${assetPath}`
        : `${importerDir}/${assetPath.replace(/^\.\//, "")}`
      if (!availablePaths.has(assetPath) && !availablePaths.has(normalizedAssetPath)) {
        issues.add(`Missing asset "${assetPath}" referenced from ${file.path}`)
      }
    }
  }

  return [...issues]
}

async function runFixAttempt(params: {
  projectFiles: ProjectFile[]
  errorMessage: string
  logsTail?: string
  failureCategory?: string
  failureReason?: string
  previousAttemptFeedback?: string | null
  expanded: boolean
}): Promise<FixAttemptResult> {
  const contextFiles = pickContextFiles(
    params.projectFiles,
    `${params.errorMessage}\n${params.logsTail || ""}\n${params.previousAttemptFeedback || ""}`,
    params.expanded
  )

  const fileContext = contextFiles
    .map((file) => `--- FILE: ${file.path} ---\n${file.content.slice(0, 18000)}\n--- END FILE ---`)
    .join("\n\n")

  const prompt = [
    "You are a build-repair agent fixing a failing React/Vite website project.",
    "Your job is to make the project build successfully with the smallest reliable set of file changes.",
    "Return output in this exact format only:",
    "===AGENT_MESSAGE=== short explanation ===END_AGENT_MESSAGE===",
    "===FILE: relative/path=== full corrected file content ===END_FILE===",
    "Rules:",
    "- Output only files you changed or created.",
    "- Prefer full corrected file contents over diffs.",
    "- Every import must resolve.",
    "- Every referenced component must exist.",
    "- Do not reference icons or assets unless they already exist or you create them now.",
    "- Do not return JSON.",
    "",
    `Error: ${params.errorMessage}`,
    params.failureCategory ? `Failure category: ${params.failureCategory}` : "",
    params.failureReason ? `Failure reason: ${params.failureReason}` : "",
    params.logsTail ? `Logs:\n${params.logsTail.slice(-16000)}` : "",
    params.previousAttemptFeedback ? `Previous attempt feedback:\n${params.previousAttemptFeedback}` : "",
    "",
    "Project context:",
    fileContext,
  ]
    .filter(Boolean)
    .join("\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-5.5",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are an expert code repair agent. Fix build errors reliably and return only the required AGENT_MESSAGE plus FILE blocks.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 9000,
  })

  const raw = completion.choices[0]?.message?.content || ""
  const { agentMessage, contentWithoutAgent } = extractAgentMessage(raw)
  const updatedFiles = parseStreamingFiles(contentWithoutAgent)
  if (!updatedFiles.length) {
    throw new Error("Repair agent returned no file updates.")
  }

  const mergedFiles = mergeFiles(params.projectFiles, updatedFiles)
  const issues = validateFiles(mergedFiles)

  return {
    explanation: agentMessage || "Applied a build repair.",
    files: mergedFiles,
    issues,
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string
      files?: ProjectFile[]
      error?: string
      logsTail?: string
      failureCategory?: string
      failureReason?: string
    }

    const projectId = String(body.projectId || "")
    if (!body.error) return NextResponse.json({ error: "Missing error context" }, { status: 400 })

    let originalFiles: ProjectFile[] = []
    if (Array.isArray(body.files) && body.files.length > 0) {
      originalFiles = body.files
    } else {
      if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
      const { snap } = await assertProjectCanEdit(projectId, uid)
      const projectData = snap.data() as { files?: ProjectFile[] }
      originalFiles = Array.isArray(projectData?.files) ? projectData.files : []
    }

    if (!originalFiles.length) {
      return NextResponse.json({ error: "Project has no files to repair" }, { status: 400 })
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
    const origin = new URL(req.url).origin

    let latestFiles = originalFiles
    let previousAttemptFeedback: string | null = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await runFixAttempt({
        projectFiles: latestFiles,
        errorMessage: String(body.error),
        logsTail: body.logsTail || "",
        failureCategory: body.failureCategory,
        failureReason: body.failureReason,
        previousAttemptFeedback,
        expanded: attempt > 1,
      })

      if (result.issues.length > 0) {
        previousAttemptFeedback = `Validation issues after attempt ${attempt}:\n${result.issues.map((issue) => `- ${issue}`).join("\n")}`
        latestFiles = result.files
        continue
      }

      if (projectId) {
        await adminDb.collection("projects").doc(projectId).set(
          {
            files: result.files,
            lastAutoFix: {
              appliedAt: new Date(),
              attempt,
              explanation: result.explanation,
              sourceError: String(body.error),
            },
          },
          { merge: true }
        )
      }

      if (!projectId) {
        return NextResponse.json({
          success: true,
          attempt,
          explanation: result.explanation,
          files: result.files,
        })
      }

      const verifyRes = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}/ensure-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ force: true }),
      })
      const verifyJson = await verifyRes.json().catch(() => ({}))

      if (verifyRes.ok && verifyJson?.previewUrl) {
        return NextResponse.json({
          success: true,
          attempt,
          explanation: result.explanation,
          previewUrl: verifyJson.previewUrl,
          files: result.files,
        })
      }

      previousAttemptFeedback = `Preview verification failed after attempt ${attempt}: ${String(
        verifyJson?.error || `status ${verifyRes.status}`
      )}`
      latestFiles = result.files
    }

    return NextResponse.json(
      {
        success: false,
        error: "Automatic fix could not produce a buildable result after three attempts.",
        recommendation: "Try Fix Error again after narrowing the request or inspect the first failing file in the build logs.",
      },
      { status: 422 }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to run automatic fix" }, { status: 500 })
  }
}
