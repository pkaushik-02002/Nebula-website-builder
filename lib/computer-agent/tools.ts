import Anthropic from "@anthropic-ai/sdk"
import { Sandbox } from "@e2b/code-interpreter"
import { FieldValue } from "firebase-admin/firestore"
import JSZip from "jszip"
import { nanoid } from "nanoid"
import { z } from "zod"
import { adminDb } from "@/lib/firebase-admin"
import { loadStagehand } from "@/lib/browserbase/load-stagehand"
import type { ComputerBrowserSession } from "@/lib/computer-agent/browserbase-session"
import { getUserNetlifyToken } from "@/lib/server-auth"
import type { ComputerAction, ComputerBuildScope, ComputerIntent, ComputerResearchSource } from "@/lib/computer-types"

export interface ProjectPlan {
  summary: string
  intent: ComputerIntent
  buildScope: ComputerBuildScope
  domain: string
  tone: string
  pages: string[]
  features: string[]
  techChoices: {
    framework: string
    styling: string
    animations: string
    graphics?: string
  }
  contentPlan: Record<string, unknown>
  assumptions: string[]
  researchHighlights: string[]
  sourceUrls: string[]
  generatedAt: string
}

export interface ProjectFile {
  path: string
  content: string
}

export interface FileGenerationProgress {
  files: ProjectFile[]
  currentFilePath: string | null
}

export interface ToolContext {
  computerId: string
  uid: string
  idToken: string
  browserSession: ComputerBrowserSession
  onFileGenerationProgress?: (progress: FileGenerationProgress) => Promise<void> | void
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Tool definitions ──────────────────────────────────────────────────────────

export const COMPUTER_TOOLS: Anthropic.Tool[] = [
  {
    name: "browserbase_research",
    description:
      "Open each URL in a Browserbase browser session. Extract full content via Stagehand. Return ResearchSource objects for use in generation.",
    input_schema: {
      type: "object" as const,
      properties: {
        urls: { type: "array", items: { type: "string" }, description: "URLs to research" },
      },
      required: ["urls"],
    },
  },
  {
    name: "browserbase_navigate",
    description: "Navigate to a URL in a Browserbase session. Return page title and main content.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "plan_project",
    description:
      "Call Claude to generate a detailed project plan from the prompt and research. Returns JSON: {domain, tone, pages, features, techChoices, contentPlan}.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "User original prompt" },
        research: { type: "string", description: "Aggregated research content from reference URLs" },
      },
      required: ["prompt", "research"],
    },
  },
  {
    name: "generate_files",
    description:
      "Generate complete production-ready project files using the plan and research context. Returns {files: ProjectFile[]}.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan: { type: "object", description: "Project plan from plan_project" },
        research: { type: "string", description: "Research content to use for all copy" },
      },
      required: ["plan", "research"],
    },
  },
  {
    name: "run_sandbox",
    description:
      "Write files to an E2B sandbox, install dependencies, start dev server. Returns {previewUrl, sandboxId, errors}.",
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          items: { type: "object" },
          description: "Project files — node_modules and .next are filtered automatically",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "verify_preview",
    description:
      "Visit the sandbox preview URL with Browserbase. Screenshot pages, check console errors, verify against plan. Returns {passed, issues}.",
    input_schema: {
      type: "object" as const,
      properties: {
        sandboxUrl: { type: "string", description: "Preview URL from run_sandbox" },
        plan: { type: "object", description: "Project plan to verify against" },
      },
      required: ["sandboxUrl", "plan"],
    },
  },
  {
    name: "fix_errors",
    description:
      "Fix issues found during verification. Calls Claude with fix instructions. Returns {files} with updated project files.",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "array", items: { type: "object" }, description: "Current project files" },
        issues: { type: "array", items: { type: "string" }, description: "Issues to fix" },
      },
      required: ["files", "issues"],
    },
  },
  {
    name: "deploy_site",
    description:
      "Build project in E2B, zip dist, deploy to Netlify. Returns {deployUrl, siteUrl, siteId}.",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "array", items: { type: "object" }, description: "Project files to deploy" },
        siteName: { type: "string", description: "Netlify site name" },
      },
      required: ["files", "siteName"],
    },
  },
]

// ─── File helpers ──────────────────────────────────────────────────────────────

function parseFileBlocks(text: string): ProjectFile[] {
  const files: ProjectFile[] = []
  const re = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const path = m[1].trim()
    const content = m[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()
    if (path) files.push({ path, content })
  }
  return files
}

function extractAgentMessage(text: string): { agentMessage: string | null; contentWithoutAgent: string } {
  const start = "===AGENT_MESSAGE==="
  const end = "===END_AGENT_MESSAGE==="
  const i = text.indexOf(start)
  const j = text.indexOf(end, i)

  if (i === -1 || j === -1) {
    return { agentMessage: null, contentWithoutAgent: text }
  }

  const agentMessage = text.slice(i + start.length, j).trim()
  const contentWithoutAgent = `${text.slice(0, i).trim()}\n${text.slice(j + end.length).trim()}`.trim()

  return {
    agentMessage: agentMessage || null,
    contentWithoutAgent,
  }
}

function parseStreamingFileBlocks(text: string): ProjectFile[] {
  const files: ProjectFile[] = []
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)(?====END_FILE===|===FILE:\s*|$)/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(text)) !== null) {
    const path = match[1].trim()
    const content = match[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()

    if (path) files.push({ path, content })
  }

  return files
}

function buildFileGenerationProgress(text: string): FileGenerationProgress {
  const { contentWithoutAgent } = extractAgentMessage(text)
  const files = parseStreamingFileBlocks(contentWithoutAgent)

  return {
    files,
    currentFilePath: files.length > 0 ? files[files.length - 1].path : null,
  }
}

function filterFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter(
    (f) =>
      !f.path.startsWith("node_modules/") &&
      !f.path.startsWith(".next/") &&
      !f.path.includes("/node_modules/") &&
      !f.path.includes("/.next/")
  )
}

async function fetchFirecrawlMarkdown(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return ""

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    })

    if (!response.ok) return ""

    const payload = await response.json().catch(() => null)
    const data = payload?.data ?? payload ?? {}
    const markdown = typeof data?.markdown === "string" ? data.markdown : ""
    return markdown.slice(0, 10000)
  } catch {
    return ""
  }
}

// ─── browserbase_research ──────────────────────────────────────────────────────

async function browserbaseResearch(
  urls: string[],
  browserSession: ComputerBrowserSession
): Promise<ComputerResearchSource[]> {
  const extractSchema = z.object({
    title: z.string().optional(),
    content: z.string(),
    keyPoints: z.array(z.string()).optional(),
  })

  const sources: ComputerResearchSource[] = []
  const sh = await browserSession.getStagehand()

  for (const url of urls) {
    try {
      const firecrawlMarkdown = await fetchFirecrawlMarkdown(url)
      await sh.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
      const title: string = await sh.page.title().catch(() => url)

      const extracted = await sh.page.extract({
        instruction:
          "Extract all main content, services, pricing, team info, copy, and any text useful for recreating this site as a new web app",
        schema: extractSchema,
      })

      sources.push({
        url,
        title: extracted.title || title,
        extractedContent: [
          firecrawlMarkdown ? `Firecrawl snapshot:\n${firecrawlMarkdown}` : "",
          extracted.content ? `Browserbase notes:\n${extracted.content}` : "",
          extracted.keyPoints?.length
            ? `Key points: ${extracted.keyPoints.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        extractedAt: new Date().toISOString(),
        addedBy: "agent",
      })
    } catch (err: any) {
      sources.push({
        url,
        title: url,
        extractedContent: `Extraction failed: ${err?.message ?? "unknown error"}`,
        extractedAt: new Date().toISOString(),
        addedBy: "agent",
      })
    }
  }

  return sources
}

// ─── browserbase_navigate ──────────────────────────────────────────────────────

async function browserbaseNavigate(
  url: string,
  browserSession: ComputerBrowserSession
): Promise<{ title: string; content: string; url: string }> {
  const sh = await browserSession.getStagehand()

  await sh.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  const title: string = await sh.page.title().catch(() => url)
  const finalUrl: string = sh.page.url()

  const extracted = await sh.page.extract({
    instruction: "Extract all main content and important information from this page",
    schema: z.object({ content: z.string() }),
  })

  return { title, content: extracted.content, url: finalUrl }
}

// ─── plan_project ──────────────────────────────────────────────────────────────

async function planProject(prompt: string, research: string): Promise<ProjectPlan> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: "Senior product architect. Output valid JSON only. No markdown, no explanation.",
    messages: [
      {
        role: "user",
        content: `Generate a project plan for this web application.

User prompt: ${prompt}

Research context:
${research}

Return a JSON object:
{
  "summary": "succinct description of what will be built",
  "intent": "website-build | website-clone | web-app",
  "buildScope": "frontend-only | full-stack",
  "domain": "business domain (e.g. restaurant, saas, portfolio, agency)",
  "tone": "brand tone and voice",
  "pages": ["page names"],
  "features": ["key features"],
  "techChoices": {
    "framework": "React + Vite",
    "styling": "Tailwind CSS",
    "animations": "Framer Motion",
    "graphics": "optional WebGL / 3D approach only when clearly justified"
  },
  "contentPlan": {
    "hero": "headline and subheadline from research",
    "sections": ["section descriptions with real content from research"],
    "colorPalette": "primary, secondary, accent hex values",
    "typography": "Google Fonts pairing",
    "layoutDirection": "layout rhythm and hierarchy",
    "motionDirection": "animation tone and interaction style"
  },
  "assumptions": ["only assumptions that are still being made"],
  "researchHighlights": ["specific findings from the references or brief"],
  "sourceUrls": ["reference URLs used for the plan"],
  "generatedAt": "ISO timestamp"
}

Rules:
- If the brief implies recreating an existing website, set intent to "website-clone" and buildScope to "frontend-only".
- Never plan backend cloning for website-clone work.
- If the clone request does not name a specific page or section, plan only the public landing page or homepage by default.
- For a default landing-page clone, keep pages focused on ["Home"] unless the brief explicitly asks for more.
- If the brief clearly asks for immersive visuals, 3D, or WebGL, reflect that in techChoices.graphics instead of ignoring it.
- Base every content field on the research or the user's brief. Use real details, not generic placeholders.
- Keep assumptions short and honest.`,
      },
    ],
  })

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Failed to parse project plan JSON")
  return JSON.parse(match[0]) as ProjectPlan
}

// ─── generate_files ────────────────────────────────────────────────────────────

const GENERATE_SYSTEM = `You are an elite full-stack developer building production-grade React/Vite applications.

MANDATORY RULES:
- Zero placeholder content. Every word from research or intelligently inferred from domain.
- Real business copy. Sounds like the actual business owner wrote it.
- Domain aesthetics: colors, fonts, layout match the industry exactly.
- Avoid generic AI-looking SaaS sections, filler metrics, fake testimonials, or empty feature grids.
- Google Fonts @import - pair display/heading font with body font.
- CSS custom properties for the color palette. Never generic gray-only.
- Framer Motion entrance animations, stagger lists, scroll reveals.
- Every interactive element: hover state, focus state, transition.
- Mobile-first. Works at 320px, 768px, 1280px.
- Images: picsum.photos or source.unsplash.com with descriptive seeds.
- Real navigation with smooth scroll to sections.
- Footer with useful links - not empty nav items.
- lucide-react for icons. framer-motion for animations.
- If the plan calls for 3D or WebGL, use a production-safe approach such as three, @react-three/fiber, and @react-three/drei only where it materially improves the site.
- If the plan is a website clone, recreate the frontend information architecture, pacing, and interaction feel from scratch without copying backend behavior.
- If the plan is a default website clone, build the landing page or homepage only unless the user explicitly asked for additional pages or sections.

FILE FORMAT (strict):
===FILE: path/to/file.tsx===
[complete file content]
===END_FILE===

Generate order:
1. package.json
2. vite.config.ts
3. index.html (must include viewport meta)
4. src/main.tsx
5. src/App.tsx
6. src/index.css
7. src/components/*.tsx
8. tailwind.config.ts, postcss.config.js

AGENT MESSAGE first (required):
===AGENT_MESSAGE=== One sentence describing what you're building. ===END_AGENT_MESSAGE===`

async function generateFiles(
  plan: ProjectPlan,
  research: string,
  computerId: string,
  onProgress?: (progress: FileGenerationProgress) => Promise<void> | void
): Promise<ProjectFile[]> {
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: GENERATE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Build a production-ready ${plan.domain} web application.

Project plan:
${JSON.stringify(plan, null, 2)}

Research context (use for ALL copy and content - not generic text):
${research}

Apply the content plan's color palette, typography, section structure, and motion direction directly. Every text element must reflect the research or the user's supplied brief.`,
      },
    ],
  })

  let currentText = ""
  let lastProgressSignature = ""
  let progressQueue = Promise.resolve()

  const queueProgress = (progress: FileGenerationProgress) => {
    if (!onProgress) return
    progressQueue = progressQueue
      .then(() => Promise.resolve(onProgress(progress)))
      .catch(() => {})
  }

  const emitProgress = (force = false) => {
    if (!onProgress) return

    const progress = buildFileGenerationProgress(currentText)
    const lastFile = progress.files.length > 0 ? progress.files[progress.files.length - 1] : null
    const contentBucket = Math.floor((lastFile?.content.length ?? 0) / 400)
    const nextSignature = `${progress.files.length}:${progress.currentFilePath ?? ""}:${contentBucket}`

    if (!force && nextSignature === lastProgressSignature) return
    lastProgressSignature = nextSignature
    queueProgress(progress)
  }

  const persistedPaths = new Set<string>()
  const firestoreRef = adminDb.collection("computers").doc(computerId)

  stream.on("text", (_delta, snapshot) => {
    currentText = snapshot

    // Persist each fully-completed file to Firestore immediately as it arrives
    const completedFiles = parseFileBlocks(currentText)
    for (const file of completedFiles) {
      if (!persistedPaths.has(file.path)) {
        persistedPaths.add(file.path)
        const lines = file.content.split("\n").length
        const fileAction: ComputerAction = {
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "tool_result",
          actor: "agent",
          toolName: "generate_files",
          content: `Wrote ${file.path}`,
          toolOutput: JSON.stringify({ path: file.path, lines }),
        }
        firestoreRef.update({
          files: FieldValue.arrayUnion(file),
          actions: FieldValue.arrayUnion(fileAction),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }
    }

    emitProgress()
  })

  currentText = await stream.finalText()
  emitProgress(true)
  await progressQueue

  const finalFiles = buildFileGenerationProgress(currentText).files
  const summaryAction: ComputerAction = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "decision",
    actor: "agent",
    content: `Generated ${finalFiles.length} file${finalFiles.length === 1 ? "" : "s"}`,
  }
  await firestoreRef.update({
    actions: FieldValue.arrayUnion(summaryAction),
    currentGeneratingFile: null,
    updatedAt: FieldValue.serverTimestamp(),
  }).catch(() => {})

  return finalFiles
}

// ─── run_sandbox ───────────────────────────────────────────────────────────────

async function runSandbox(
  files: ProjectFile[]
): Promise<{ previewUrl: string; sandboxId: string; errors: string[] }> {
  const errors: string[] = []
  const PROJECT_DIR = "/home/user/project"

  const sandbox = await Sandbox.create("base", {
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 10 * 60 * 1000,
  })
  const previewUrl = `https://${sandbox.getHost(3000)}`

  try {
    await sandbox.commands.run(`mkdir -p ${PROJECT_DIR}`, { timeoutMs: 5000 })

    for (const file of files) {
      const fullPath = `${PROJECT_DIR}/${file.path}`
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
      if (dir !== PROJECT_DIR) {
        await sandbox.commands.run(`mkdir -p "${dir}"`, { timeoutMs: 5000 }).catch(() => {})
      }
      await sandbox.files.write(fullPath, file.content)
    }

    const install = await sandbox.commands.run(
      `cd ${PROJECT_DIR} && npm install --legacy-peer-deps --no-audit --no-fund 2>&1`,
      { timeoutMs: 8 * 60 * 1000 }
    )
    if (install.exitCode !== 0) {
      errors.push(`npm install failed: ${(install.stderr || install.stdout || "").slice(0, 400)}`)
    }

    // Detect framework from package.json
    let devCmd = `npx vite --host 0.0.0.0 --port 3000`
    try {
      const pkgFile = files.find((f) => f.path === "package.json")
      if (pkgFile) {
        const pkg = JSON.parse(pkgFile.content)
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (deps?.next) devCmd = `npx next dev -H 0.0.0.0 -p 3000`
      }
    } catch {}

    await sandbox.commands.run(
      `cd ${PROJECT_DIR} && nohup ${devCmd} > /tmp/dev.log 2>&1 &`,
      { timeoutMs: 10000 }
    )

    // Poll for ready - 90 s max
    let ready = false
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const res = await fetch(previewUrl, { signal: AbortSignal.timeout(4000) })
        const body = await res.text().catch(() => "")
        if (
          res.ok &&
          !body.includes("there's no service running") &&
          !body.includes("closed port error")
        ) {
          ready = true
          break
        }
      } catch {}
    }

    if (!ready) {
      const logs = await sandbox.commands
        .run("tail -60 /tmp/dev.log 2>/dev/null || echo ''", { timeoutMs: 5000 })
        .catch(() => ({ stdout: "" }))
      errors.push(`Dev server not ready: ${(logs.stdout ?? "").slice(-400)}`)
    }

    return { previewUrl, sandboxId: sandbox.sandboxId, errors }
  } catch (err: any) {
    const logs = await sandbox.commands
      .run("tail -60 /tmp/dev.log 2>/dev/null || echo ''", { timeoutMs: 5000 })
      .catch(() => ({ stdout: "" }))
    if (logs.stdout) {
      errors.push(`Sandbox logs: ${(logs.stdout ?? "").slice(-400)}`)
    }
    errors.push(err?.message ?? "Sandbox error")
    return { previewUrl, sandboxId: sandbox.sandboxId, errors }
  }
}

// ─── verify_preview ────────────────────────────────────────────────────────────

async function verifyPreview(
  sandboxUrl: string,
  plan: ProjectPlan,
  browserSession: ComputerBrowserSession
): Promise<{ passed: boolean; issues: string[] }> {
  const sh = await browserSession.getStagehand()

  const consoleErrors: string[] = []
  const issues: string[] = []

  try {
    sh.page.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })
    sh.page.on("pageerror", (err: Error) => {
      consoleErrors.push(err?.message ?? String(err))
    })

    const response = await sh.page.goto(sandboxUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    })

    if (!response?.ok()) {
      issues.push(`Page returned status ${response?.status() ?? "unknown"}`)
    }

    await new Promise((r) => setTimeout(r, 2000))

    for (const e of consoleErrors.slice(0, 5)) {
      issues.push(`Console error: ${e}`)
    }

    const verifySchema = z.object({
      hasNavigation: z.boolean(),
      hasFooter: z.boolean(),
      hasMainContent: z.boolean(),
      missingFeatures: z.array(z.string()).optional(),
      visualIssues: z.array(z.string()).optional(),
    })

    const verification = await sh.page.extract({
      instruction: `Verify this ${plan.domain} site has: navigation bar, at least one main content section, footer. Check for these features: ${plan.features.slice(0, 5).join(", ")}. Note any obvious visual issues like blank sections or broken layouts.`,
      schema: verifySchema,
    })

    if (!verification.hasNavigation) issues.push("Missing navigation")
    if (!verification.hasFooter) issues.push("Missing footer")
    if (!verification.hasMainContent) issues.push("Missing main content")
    if (verification.missingFeatures?.length) {
      issues.push(...verification.missingFeatures.map((f: string) => `Missing: ${f}`))
    }
    if (verification.visualIssues?.length) {
      issues.push(...verification.visualIssues.map((v: string) => `Visual issue: ${v}`))
    }

    return { passed: issues.length === 0, issues }
  } catch (err: any) {
    return {
      passed: false,
      issues: [`Verification failed: ${err?.message ?? "unknown error"}`],
    }
  }
}

// ─── fix_errors ────────────────────────────────────────────────────────────────

async function fixErrors(
  files: ProjectFile[],
  issues: string[]
): Promise<ProjectFile[]> {
  const fileContext = files
    .filter((f) => /\.(tsx?|jsx?|css|json|html)$/.test(f.path))
    .map((f) => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`)
    .join("\n\n")

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: `You fix bugs in React/Vite projects. Output only changed files in ===FILE: path=== ... ===END_FILE=== format. Fix exactly the issues listed. Do not touch files that don't need changes.`,
    messages: [
      {
        role: "user",
        content: `Fix these issues:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nProject files:\n${fileContext}`,
      },
    ],
  })

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""
  const updatedFiles = parseFileBlocks(text)

  const fileMap = new Map(files.map((f) => [f.path, f]))
  for (const updated of updatedFiles) {
    fileMap.set(updated.path, updated)
  }
  return Array.from(fileMap.values())
}

// ─── deploy_site ───────────────────────────────────────────────────────────────

async function deploySite(
  files: ProjectFile[],
  siteName: string,
  context: ToolContext
): Promise<{ deployUrl: string; siteUrl: string; siteId: string }> {
  const token = await getUserNetlifyToken(context.uid)
  if (!token) throw new Error("Netlify not connected - connect in settings first")

  const PROJECT_DIR = "/home/user/project"
  const sandbox = await Sandbox.create("base", {
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 10 * 60 * 1000,
  })

  try {
    await sandbox.commands.run(`mkdir -p ${PROJECT_DIR}`, { timeoutMs: 5000 })

    for (const file of files) {
      const fullPath = `${PROJECT_DIR}/${file.path}`
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
      if (dir !== PROJECT_DIR) {
        await sandbox.commands.run(`mkdir -p "${dir}"`, { timeoutMs: 5000 }).catch(() => {})
      }
      await sandbox.files.write(fullPath, file.content)
    }

    const install = await sandbox.commands.run(
      `cd ${PROJECT_DIR} && npm install --legacy-peer-deps --no-audit --no-fund 2>&1`,
      { timeoutMs: 3 * 60 * 1000 }
    )
    if (install.exitCode !== 0)
      throw new Error(`Install failed: ${(install.stderr || "").slice(0, 300)}`)

    const build = await sandbox.commands.run(
      `cd ${PROJECT_DIR} && npm run build 2>&1`,
      { timeoutMs: 3 * 60 * 1000 }
    )
    if (build.exitCode !== 0)
      throw new Error(`Build failed: ${(build.stderr || build.stdout || "").slice(0, 400)}`)

    await sandbox.files
      .write(`${PROJECT_DIR}/dist/_redirects`, "/* /index.html 200\n")
      .catch(() => {})

    const list = await sandbox.commands.run(
      `cd ${PROJECT_DIR} && find dist -type f -print`,
      { timeoutMs: 15000 }
    )
    const paths = (list.stdout || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)

    const zip = new JSZip()
    for (const p of paths) {
      const rel = p.replace(/^dist\//, "")
      const b64res = await sandbox.commands.run(
        `cd ${PROJECT_DIR} && base64 -w 0 '${p.replace(/'/g, "'\\''")}'`,
        { timeoutMs: 15000 }
      )
      if (b64res.exitCode === 0) {
        zip.file(rel, (b64res.stdout || "").trim(), { base64: true })
      }
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" })
    const zipBody = Buffer.from(zipBytes)

    const slugify = (n: string) =>
      n
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60)

    const safeName = slugify(siteName) || `computer-${Date.now()}`

    const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: safeName }),
    })
    if (!createRes.ok) {
      const t = await createRes.text().catch(() => "")
      throw new Error(`Failed to create Netlify site: ${createRes.status} ${t}`)
    }
    const site = (await createRes.json()) as {
      id: string
      url: string
      ssl_url: string
    }

    const deployRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${site.id}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/zip",
        },
        body: zipBody,
      }
    )
    if (!deployRes.ok) {
      const t = await deployRes.text().catch(() => "")
      throw new Error(`Deploy failed: ${deployRes.status} ${t}`)
    }

    const deploy = (await deployRes.json()) as {
      deploy_ssl_url?: string
      ssl_url?: string
      deploy_url?: string
    }

    return {
      siteId: site.id,
      siteUrl: site.ssl_url || site.url,
      deployUrl:
        deploy.deploy_ssl_url || deploy.ssl_url || deploy.deploy_url || site.url,
    }
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

// ─── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  switch (name) {
    case "browserbase_research":
      return browserbaseResearch((input.urls as string[]) || [], context.browserSession)

    case "browserbase_navigate":
      return browserbaseNavigate(input.url as string, context.browserSession)

    case "plan_project":
      return planProject(input.prompt as string, input.research as string)

    case "generate_files": {
      const files = await generateFiles(
        input.plan as ProjectPlan,
        (input.research as string) || "",
        context.computerId,
        context.onFileGenerationProgress
      )
      return { files }
    }

    case "run_sandbox":
      return runSandbox(filterFiles(input.files as ProjectFile[]))

    case "verify_preview":
      return verifyPreview(
        input.sandboxUrl as string,
        input.plan as ProjectPlan,
        context.browserSession
      )

    case "fix_errors": {
      const fixed = await fixErrors(
        filterFiles(input.files as ProjectFile[]),
        (input.issues as string[]) || []
      )
      return { files: fixed }
    }

    case "deploy_site":
      return deploySite(
        filterFiles(input.files as ProjectFile[]),
        input.siteName as string,
        context
      )

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
