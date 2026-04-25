import Anthropic from "@anthropic-ai/sdk"
import { Sandbox } from "@e2b/code-interpreter"
import { applyPatch, parsePatch } from "diff"
import { FieldValue } from "firebase-admin/firestore"
import crypto from "crypto"
import JSZip from "jszip"
import { nanoid } from "nanoid"
import { z } from "zod"
import { adminDb } from "@/lib/firebase-admin"
import { loadStagehand } from "@/lib/browserbase/load-stagehand"
import type { ComputerBrowserSession } from "@/lib/computer-agent/browserbase-session"
import { encryptEnvVars, decryptEnvVars } from "@/lib/encrypt-env"
import { extractSqlTables, generatePostgresSchema } from "@/lib/integrations/supabase/schema"
import {
  analyzeSupabaseProvisioningNeed,
  generateSupabaseIntegrationUpdates,
  mergeProjectFiles,
} from "@/lib/integrations/supabase/provision"
import { getUserNetlifyToken } from "@/lib/server-auth"
import { getSupabaseConnection, supabaseManagementFetch } from "@/lib/supabase-management"
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
  prompt: string
  browserSession: ComputerBrowserSession
  onFileGenerationProgress?: (progress: FileGenerationProgress) => Promise<void> | void
  shouldCancel?: () => Promise<boolean>
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CANCELLED_MESSAGE = "Agent run cancelled"

async function throwIfCancelled(shouldCancel?: () => Promise<boolean>): Promise<void> {
  if (await shouldCancel?.()) {
    throw new Error(CANCELLED_MESSAGE)
  }
}

function isCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === CANCELLED_MESSAGE
}

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
      "Generate complete production-ready project files using the plan and research context. Dynamically analyzes backend needs and wires Supabase when required. Returns {files: ProjectFile[], backend}.",
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
    name: "modify_files",
    description:
      "Apply a user's follow-up instruction to an existing project. Return the full merged files array and a list of changed paths. Use this for iterative edits instead of regenerating from scratch.",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "array", items: { type: "object" }, description: "Current project files" },
        instruction: { type: "string", description: "User follow-up instruction" },
        plan: { type: "object", description: "Current approved project plan" },
        research: { type: "string", description: "Research and conversation context" },
      },
      required: ["files", "instruction", "plan", "research"],
    },
  },
  {
    name: "run_sandbox",
    description:
      "Write files to an E2B sandbox, install dependencies, start dev server. Returns {ready, previewUrl, sandboxId, errors}. previewUrl is null unless the app is reachable on port 3000.",
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
      "Fix issues found during verification using minimal unified diffs. Applies patches server-side and returns {files, changedPaths, patchApplied}.",
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

function stripPatchFences(text: string): string {
  return text
    .replace(/^```(?:diff|patch)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

function normalizePatchFilePath(path: string | undefined): string | null {
  if (!path || path === "/dev/null") return null
  return path.replace(/^"?[ab]\//, "").replace(/"$/, "").trim() || null
}

function applyUnifiedPatchToFiles(
  files: ProjectFile[],
  patchText: string
): { files: ProjectFile[]; changedPaths: string[] } | null {
  const normalizedPatchText = stripPatchFences(patchText)
  if (!normalizedPatchText) return null

  let patches: ReturnType<typeof parsePatch>
  try {
    patches = parsePatch(normalizedPatchText)
  } catch {
    return null
  }

  if (!patches.length) return null

  const fileMap = new Map(files.map((file) => [file.path, file.content]))
  const changedPaths: string[] = []

  for (const patch of patches) {
    const path =
      normalizePatchFilePath(patch.newFileName) ??
      normalizePatchFilePath(patch.oldFileName)
    if (!path) return null

    const currentContent = fileMap.get(path) ?? ""
    const patchedContent = applyPatch(currentContent, patch, {
      autoConvertLineEndings: true,
      fuzzFactor: 1,
    })

    if (patchedContent === false) return null

    fileMap.set(path, patchedContent)
    changedPaths.push(path)
  }

  return {
    files: Array.from(fileMap.entries()).map(([path, content]) => ({ path, content })),
    changedPaths: Array.from(new Set(changedPaths)),
  }
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
    system: [
      "Senior product architect and design director.",
      "Output valid JSON only. No markdown, no explanation.",
      "Plan for launch-quality, domain-specific websites, not generic AI templates.",
    ].join(" "),
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
    "layoutDirection": "specific visual composition, layout rhythm, and hierarchy",
    "motionDirection": "animation tone and interaction style",
    "designSignature": "one distinctive, domain-specific visual idea that makes this site feel custom",
    "avoidPatterns": ["specific generic patterns to avoid for this brief"]
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
- If the product needs persisted data, auth, accounts, CRUD, uploads, dashboards, bookings, orders, payments, or other server-backed behavior, set buildScope to "full-stack" and describe the real backend data needs in contentPlan.
- Base every content field on the research or the user's brief. Use real details, not generic placeholders.
- Make a decisive design direction. Do not produce vague instructions like "modern clean layout" or "professional design".
- Avoid generic AI-site patterns: centered hero + three feature cards + fake stats + fake testimonials + generic CTA.
- Sections must be chosen for this exact product and audience. Do not include social proof, pricing, testimonials, or metrics unless the brief/research supports them.
- Prefer asymmetry, editorial rhythm, strong typography, purposeful imagery, and domain-specific interaction details over bland card grids.
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

const GENERATE_SYSTEM = `You are an elite full-stack developer and senior visual designer building production-grade React/Vite applications.

QUALITY BAR:
The output must look like a real design studio built it for a paying client. It must not look like an AI-generated template, startup boilerplate, or a default Tailwind demo.

MANDATORY RULES:
- Zero placeholder content. Every word from research or intelligently inferred from domain.
- Real business copy. Sounds like the actual business owner wrote it.
- Domain aesthetics: colors, fonts, layout match the industry exactly.
- Avoid generic AI-looking SaaS sections, filler metrics, fake testimonials, or empty feature grids.
- Never use a generic layout recipe: centered hero, three cards, stats row, testimonial cards, FAQ, CTA. Only include sections the product actually needs.
- Create a distinctive first viewport. Use a memorable composition: editorial split rhythm, overlapping media, product UI, full-bleed imagery, timeline, map, menu board, booking surface, command center, or another domain-specific visual idea.
- Avoid bland cards everywhere. Cards are for real grouped content only; vary section structure with bands, sidebars, inset tools, comparison rows, media-led blocks, tables, timelines, or interactive surfaces.
- No fake metrics, fake logos, fake people, fake reviews, or fabricated awards. If proof is unavailable, use concrete product/process details instead.
- Do not use one-note purple/blue gradients, generic slate dashboards, beige-only pages, or stock-looking bokeh/orb backgrounds.
- Use strong typography: one display font and one body font from Google Fonts, with a clear scale and confident headings. Do not use Inter alone.
- Google Fonts @import - pair display/heading font with body font.
- CSS custom properties for the color palette. Never generic gray-only.
- Framer Motion entrance animations, stagger lists, scroll reveals.
- Every interactive element: hover state, focus state, transition.
- Mobile-first. Works at 320px, 768px, 1280px.
- Images: picsum.photos or source.unsplash.com with descriptive seeds.
- Real navigation with smooth scroll to sections.
- Footer with useful links - not empty nav items.
- lucide-react for icons. framer-motion for animations.
- Component architecture: split real sections/components into separate files. Do not dump a giant single-file App unless the site is tiny.
- Responsive polish is required: no overlapping text, no clipped buttons, no awkward hero at mobile sizes, no horizontal overflow.
- If the plan calls for 3D or WebGL, use a production-safe approach such as three, @react-three/fiber, and @react-three/drei only where it materially improves the site.
- If the plan is full-stack, build the frontend flows and state shape that match the required backend behavior. Supabase provisioning and client wiring may run after generation; keep code cleanly structured for that integration.
- If the plan is a website clone, recreate the frontend information architecture, pacing, and interaction feel from scratch without copying backend behavior.
- If the plan is a default website clone, build the landing page or homepage only unless the user explicitly asked for additional pages or sections.

DESIGN EXECUTION:
- Let the plan's designSignature drive the layout. If designSignature is weak, infer a sharper one from the domain before coding.
- Each section needs a job: sell, explain, compare, let the user act, show inventory/work, or reduce uncertainty. Remove sections that do not have a job.
- Use real UI where useful: booking forms, filters, calculators, menus, comparison tables, onboarding steps, dashboards, galleries, or product mockups. Make them visually credible.
- Write concise, specific copy. Prefer concrete nouns and verbs over "transform", "unlock", "seamless", "innovative", "elevate", or "next-generation".
- Final result should feel custom at 1440px and carefully adapted at 390px.

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
  onProgress?: (progress: FileGenerationProgress) => Promise<void> | void,
  shouldCancel?: () => Promise<boolean>
): Promise<ProjectFile[]> {
  await throwIfCancelled(shouldCancel)
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

Apply the content plan's color palette, typography, section structure, designSignature, avoidPatterns, and motion direction directly.
Before coding, mentally reject the first generic layout idea and choose a more specific composition for this domain.
Every text element must reflect the research or the user's supplied brief.`,
      },
    ],
  })

  let currentText = ""
  let lastProgressSignature = ""
  let progressQueue = Promise.resolve()
  let cancelled = false
  const cancelTimer = setInterval(() => {
    void shouldCancel?.()
      .then((shouldStop) => {
        if (!shouldStop || cancelled) return
        cancelled = true
        stream.abort()
      })
      .catch(() => {})
  }, 1000)

  const queueProgress = (progress: FileGenerationProgress) => {
    if (!onProgress || cancelled) return
    progressQueue = progressQueue
      .then(() => Promise.resolve(onProgress(progress)))
      .catch(() => {})
  }

  const emitProgress = (force = false) => {
    if (!onProgress || cancelled) return

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
    if (cancelled) return
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

  try {
    currentText = await stream.finalText()
  } catch (error) {
    if (!cancelled && !isCancelledError(error)) throw error
  } finally {
    clearInterval(cancelTimer)
  }

  await throwIfCancelled(shouldCancel)
  if (cancelled) {
    await firestoreRef.update({
      currentGeneratingFile: null,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
    throw new Error(CANCELLED_MESSAGE)
  }

  emitProgress(true)
  await progressQueue
  await throwIfCancelled(shouldCancel)

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

async function modifyFiles(
  files: ProjectFile[],
  instruction: string,
  plan: ProjectPlan,
  research: string,
  shouldCancel?: () => Promise<boolean>
): Promise<{ files: ProjectFile[]; changedPaths: string[] }> {
  await throwIfCancelled(shouldCancel)
  const currentFiles = filterFiles(files)
  const fileContext = currentFiles
    .filter((file) => /\.(tsx?|jsx?|css|json|html|mjs|cjs)$/.test(file.path))
    .map((file) => `===FILE: ${file.path}===\n${file.content}\n===END_FILE===`)
    .join("\n\n")

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: [
      "You are editing an existing React/Vite project.",
      "Understand the user's follow-up from the current files, plan, and conversation context.",
      "Output only changed complete files in the strict file-block format.",
      "Do not regenerate untouched files.",
      "Do not remove working functionality unless the user explicitly asks.",
      "Preserve visual quality and responsive behavior.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Follow-up instruction:
${instruction}

Current approved plan:
${JSON.stringify(plan, null, 2)}

Research and conversation context:
${research}

Current project files:
${fileContext}

Return only files that must change:
===FILE: path/to/file.tsx===
[complete updated file content]
===END_FILE===`,
      },
    ],
  })

  await throwIfCancelled(shouldCancel)

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""
  const changedFiles = parseFileBlocks(text)
  const fileMap = new Map(currentFiles.map((file) => [file.path, file]))

  for (const changedFile of changedFiles) {
    fileMap.set(changedFile.path, changedFile)
  }

  return {
    files: Array.from(fileMap.values()),
    changedPaths: changedFiles.map((file) => file.path),
  }
}

function isViteConfigPath(path: string): boolean {
  return /^vite\.config\.(ts|js|mjs|mts|cjs)$/.test(path)
}

function projectUsesVite(files: ProjectFile[]): boolean {
  const packageFile = files.find((file) => file.path === "package.json")
  if (!packageFile) return false

  try {
    const pkg = JSON.parse(packageFile.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return Boolean(deps.vite)
  } catch {
    return false
  }
}

function findMatchingBraceIndex(content: string, openBraceIndex: number): number {
  let depth = 0
  let quote: '"' | "'" | "`" | null = null
  let escaped = false

  for (let index = openBraceIndex; index < content.length; index++) {
    const char = content[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "{") depth += 1
    if (char === "}") depth -= 1
    if (depth === 0) return index
  }

  return -1
}

function replaceExistingViteServerConfig(content: string, serverConfig: string): string | null {
  const serverMatch = /server\s*:\s*\{/.exec(content)
  if (!serverMatch) return null

  const openBraceIndex = content.indexOf("{", serverMatch.index)
  const closeBraceIndex = findMatchingBraceIndex(content, openBraceIndex)
  if (closeBraceIndex === -1) return null

  const prefix = content.slice(0, serverMatch.index)
  const suffix = content.slice(closeBraceIndex + 1)
  return `${prefix}${serverConfig}${suffix}`
}

function withSandboxViteServerConfig(content: string): string {
  const serverConfig = `server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { overlay: false },
  }`

  const replacedServerConfig = replaceExistingViteServerConfig(content, serverConfig)
  if (replacedServerConfig) return replacedServerConfig

  if (/export\s+default\s+defineConfig\s*\(\s*\{/.test(content)) {
    return content.replace(
      /export\s+default\s+defineConfig\s*\(\s*\{/,
      (match) => `${match}\n  ${serverConfig},`
    )
  }

  if (/defineConfig\s*\(\s*\{/.test(content)) {
    return content.replace(
      /defineConfig\s*\(\s*\{/,
      (match) => `${match}\n  ${serverConfig},`
    )
  }

  if (/export\s+default\s*\{/.test(content)) {
    return content.replace(
      /export\s+default\s*\{/,
      (match) => `${match}\n  ${serverConfig},`
    )
  }

  return content
}

function prepareSandboxFiles(files: ProjectFile[]): ProjectFile[] {
  const prepared = files.map((file) => {
    if (!isViteConfigPath(file.path)) return file

    return {
      ...file,
      content: withSandboxViteServerConfig(file.content),
    }
  })

  if (!projectUsesVite(prepared) || prepared.some((file) => isViteConfigPath(file.path))) {
    return prepared
  }

  return [
    ...prepared,
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { overlay: false },
  },
})
`,
    },
  ]
}

type ComputerSupabaseRecord = {
  name?: string
  prompt?: string
  files?: ProjectFile[]
  generatedSchemaSql?: string
  generatedSchemaTables?: string[]
  supabaseProjectRef?: string
  supabaseProjectName?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  schemaPushStatus?: string
  plan?: ProjectPlan | null
  supabaseBackendApproved?: boolean
}

type SupabaseProjectRecord = {
  id?: string
  ref?: string
  name?: string
  region?: string
  organization_id?: string
  api_url?: string
  url?: string
}

type SupabaseCredentials = {
  projectRef: string
  projectName: string
  supabaseUrl: string
  supabaseAnonKey: string
}

type ComputerBackendSetupResult = {
  status: "not-needed" | "approval-required" | "oauth-required" | "success" | "error"
  reason: string
  files: ProjectFile[]
  schemaApplied: boolean
  projectRef?: string
  tables?: string[]
  error?: string
}

function buildComputerProjectName(name: string, prompt: string): string {
  const raw = name.trim() || prompt.split(/\s+/).slice(0, 3).join("-")
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return (normalized || "computer-app").slice(0, 40)
}

function ensureSupabaseSupportFiles(params: {
  files: ProjectFile[]
  schemaSql: string
}): ProjectFile[] {
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

async function resolveSupabaseOrganizationId(uid: string): Promise<string> {
  try {
    const organizations = await supabaseManagementFetch<Array<{ id?: string }>>(uid, "/v1/organizations")
    const organizationId = (organizations[0]?.id ?? "").toString().trim()
    if (organizationId) return organizationId
  } catch {}

  try {
    const projects = await supabaseManagementFetch<Array<{ organization_id?: string }>>(uid, "/v1/projects")
    return (projects.find((project) => !!project.organization_id)?.organization_id ?? "").toString().trim()
  } catch {
    return ""
  }
}

async function fetchSupabaseCredentials(uid: string, projectRef: string): Promise<SupabaseCredentials> {
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

async function ensureComputerSupabaseProject(params: {
  uid: string
  computerId: string
  computer: ComputerSupabaseRecord
}): Promise<SupabaseCredentials> {
  const linkedRef = (params.computer.supabaseProjectRef ?? "").toString().trim()
  if (linkedRef) return fetchSupabaseCredentials(params.uid, linkedRef)

  const organizationId = await resolveSupabaseOrganizationId(params.uid)
  if (!organizationId) {
    throw new Error("No Supabase organization found for this account")
  }

  const created = await supabaseManagementFetch<SupabaseProjectRecord>(params.uid, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: buildComputerProjectName(params.computer.name ?? "", params.computer.prompt ?? ""),
      region: "us-east-1",
      db_pass: crypto.randomBytes(24).toString("base64url"),
      organization_id: organizationId,
    }),
  })

  const projectRef = (created?.ref ?? created?.id ?? "").toString().trim()
  if (!projectRef) {
    throw new Error("Supabase project was created without a project ref")
  }

  return fetchSupabaseCredentials(params.uid, projectRef)
}

async function maybeSetupComputerBackend(params: {
  files: ProjectFile[]
  plan: ProjectPlan
  prompt: string
  context: ToolContext
}): Promise<ComputerBackendSetupResult> {
  const computerRef = adminDb.collection("computers").doc(params.context.computerId)
  const computerSnap = await computerRef.get()
  const computer = (computerSnap.data() ?? {}) as ComputerSupabaseRecord
  const projectName = (computer.name ?? "").toString().trim()

  const provisioningPlan = await analyzeSupabaseProvisioningNeed({
    prompt: params.prompt,
    projectName,
    files: params.files,
    generationMeta: params.plan as unknown as Record<string, unknown>,
  })

  if (!provisioningPlan.shouldProvision) {
    await computerRef.set(
      {
        supabaseProvisioningStatus: "not-needed",
        supabaseProvisioningReason: provisioningPlan.reason,
        supabaseProvisionedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return {
      status: "not-needed",
      reason: provisioningPlan.reason,
      files: params.files,
      schemaApplied: false,
    }
  }

  const backendApproved = computer.supabaseBackendApproved === true || Boolean(computer.supabaseProjectRef)
  if (!backendApproved) {
    await computerRef.set(
      {
        supabaseProvisioningStatus: "approval-required",
        supabaseProvisioningReason: provisioningPlan.reason,
        pendingBackendSetup: {
          provider: "supabase",
          reason: provisioningPlan.reason,
          needsSchema: provisioningPlan.needsSchema,
          needsClientIntegration: provisioningPlan.needsClientIntegration,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return {
      status: "approval-required",
      reason: provisioningPlan.reason,
      files: params.files,
      schemaApplied: false,
    }
  }

  const connection = await getSupabaseConnection(params.context.uid)
  if (!connection) {
    await computerRef.set(
      {
        supabaseProvisioningStatus: "oauth-required",
        supabaseProvisioningReason: provisioningPlan.reason,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return {
      status: "oauth-required",
      reason: "Supabase OAuth connection required before backend setup can run.",
      files: params.files,
      schemaApplied: false,
    }
  }

  const linkedProject = await ensureComputerSupabaseProject({
    uid: params.context.uid,
    computerId: params.context.computerId,
    computer,
  })

  const schemaResult =
    typeof computer.generatedSchemaSql === "string" && computer.generatedSchemaSql.trim()
      ? {
          sql: computer.generatedSchemaSql.trim(),
          tables: Array.isArray(computer.generatedSchemaTables)
            ? computer.generatedSchemaTables
            : extractSqlTables(computer.generatedSchemaSql),
        }
      : provisioningPlan.needsSchema
        ? await generatePostgresSchema({
            appPrompt: params.prompt,
            projectName,
            existingFiles: params.files,
            setupReason: provisioningPlan.reason,
          })
        : { sql: "", tables: [] }

  let schemaPushStatus = "skipped"
  if (schemaResult.sql.trim()) {
    await supabaseManagementFetch(
      params.context.uid,
      `/v1/projects/${encodeURIComponent(linkedProject.projectRef)}/database/query`,
      {
        method: "POST",
        body: JSON.stringify({ query: schemaResult.sql }),
      }
    )
    schemaPushStatus = "success"
  }

  let nextFiles = params.files
  if (provisioningPlan.needsClientIntegration) {
    const updates = await generateSupabaseIntegrationUpdates({
      prompt: params.prompt,
      projectName,
      files: params.files,
      schemaSql: schemaResult.sql,
      supabaseUrl: linkedProject.supabaseUrl,
      anonKeyPresent: Boolean(linkedProject.supabaseAnonKey),
      setupReason: provisioningPlan.reason,
    })

    if (updates.length > 0) {
      nextFiles = mergeProjectFiles(params.files, updates)
    }
  }

  nextFiles = ensureSupabaseSupportFiles({
    files: nextFiles,
    schemaSql: schemaResult.sql,
  })

  const { encrypted } = encryptEnvVars(
    JSON.stringify({
      VITE_SUPABASE_URL: linkedProject.supabaseUrl,
      VITE_SUPABASE_ANON_KEY: linkedProject.supabaseAnonKey,
    })
  )

  await adminDb.collection("supabaseLinks").doc(`computer-${params.context.computerId}`).set(
    {
      id: `computer-${params.context.computerId}`,
      computerId: params.context.computerId,
      userId: params.context.uid,
      supabaseProjectRef: linkedProject.projectRef,
      supabaseProjectName: linkedProject.projectName,
      supabaseUrl: linkedProject.supabaseUrl,
      supabaseAnonKey: linkedProject.supabaseAnonKey,
      oauthTokenId: params.context.uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await computerRef.set(
    {
      files: nextFiles,
      generatedSchemaSql: schemaResult.sql,
      generatedSchemaTables: schemaResult.tables,
      generatedSchemaUpdatedAt: FieldValue.serverTimestamp(),
      schemaPushedAt: schemaResult.sql.trim() ? FieldValue.serverTimestamp() : null,
      schemaPushStatus,
      envVarsEncrypted: encrypted,
      envVarNames: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
      envVarsUpdatedAt: FieldValue.serverTimestamp(),
      supabaseProjectRef: linkedProject.projectRef,
      supabaseProjectName: linkedProject.projectName,
      supabaseUrl: linkedProject.supabaseUrl,
      pendingBackendSetup: null,
      supabaseBackendApproved: true,
      supabaseProvisioningStatus: "success",
      supabaseProvisioningReason: provisioningPlan.reason,
      supabaseProvisionedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return {
    status: "success",
    reason: provisioningPlan.reason,
    files: nextFiles,
    schemaApplied: Boolean(schemaResult.sql.trim()),
    projectRef: linkedProject.projectRef,
    tables: schemaResult.tables,
  }
}

function sanitizeEnvVar(key: string, value: string): { key: string; value: string } | null {
  const trimmedKey = key.trim()
  if (!/^[A-Z0-9_]+$/.test(trimmedKey)) return null

  return {
    key: trimmedKey,
    value: value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n"),
  }
}

async function injectComputerEnvVars(sandbox: Sandbox, computerId?: string): Promise<void> {
  if (!computerId) return

  try {
    const snap = await adminDb.collection("computers").doc(computerId).get()
    const encrypted = snap.exists ? (snap.data() as { envVarsEncrypted?: string })?.envVarsEncrypted : undefined
    if (!encrypted) return

    const plain = decryptEnvVars(encrypted)
    const envVars = JSON.parse(plain) as Record<string, string>
    const sanitizedLines = Object.entries(envVars).flatMap(([key, value]) => {
      const sanitized = sanitizeEnvVar(key, value)
      return sanitized ? [`${sanitized.key}="${sanitized.value}"`] : []
    })

    if (sanitizedLines.length > 0) {
      await sandbox.files.write("/home/user/project/.env", `${sanitizedLines.join("\n")}\n`)
    }
  } catch (error) {
    console.warn("[computer sandbox] Failed to inject env vars:", error)
  }
}

// ─── run_sandbox ───────────────────────────────────────────────────────────────

export async function runSandbox(
  files: ProjectFile[],
  options: { computerId?: string } = {}
): Promise<{ ready: boolean; previewUrl: string | null; sandboxId: string; errors: string[] }> {
  const errors: string[] = []
  const PROJECT_DIR = "/home/user/project"
  const sandboxFiles = prepareSandboxFiles(files)

  const sandbox = await Sandbox.create("base", {
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 30 * 60 * 1000, // 30 min — enough for full session
  })
  const previewUrl = `https://${sandbox.getHost(3000)}`

  const readLogs = async (lines = 100): Promise<string> => {
    const logs = await sandbox.commands
      .run(`tail -${lines} /tmp/dev.log 2>/dev/null || echo ''`, { timeoutMs: 5000 })
      .catch(() => ({ stdout: "" }))
    return logs.stdout ?? ""
  }

  const stopSandbox = async () => {
    await sandbox.kill().catch(() => {})
  }

  try {
    // Create all unique directories in one shot
    const dirs = new Set<string>()
    for (const file of sandboxFiles) {
      const fullPath = `${PROJECT_DIR}/${file.path}`
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
      if (dir !== PROJECT_DIR) dirs.add(dir)
    }
    if (dirs.size > 0) {
      await sandbox.commands.run(`mkdir -p ${[...dirs].map(d => `"${d}"`).join(" ")}`, { timeoutMs: 10000 })
    } else {
      await sandbox.commands.run(`mkdir -p ${PROJECT_DIR}`, { timeoutMs: 5000 })
    }

    // Write all files in parallel
    await Promise.all(
      sandboxFiles.map((file) =>
        sandbox.files.write(`${PROJECT_DIR}/${file.path}`, file.content)
      )
    )

    const hasUserEnvFile = sandboxFiles.some((file) => file.path === ".env" || file.path === ".env.local")
    if (!hasUserEnvFile) {
      await injectComputerEnvVars(sandbox, options.computerId)
    }

    const install = await sandbox.commands.run(
      `cd ${PROJECT_DIR} && npm install --legacy-peer-deps --no-audit --no-fund 2>&1`,
      { timeoutMs: 8 * 60 * 1000 }
    )
    if (install.exitCode !== 0) {
      errors.push(`npm install failed: ${(install.stderr || install.stdout || "").slice(0, 400)}`)
      await stopSandbox()
      return { ready: false, previewUrl: null, sandboxId: sandbox.sandboxId, errors }
    }

    // Detect framework and pick dev command using project's own npm script
    let devCmd = `npm run dev -- --host 0.0.0.0 --port 3000`
    try {
      const pkgFile = sandboxFiles.find((f) => f.path === "package.json")
      if (pkgFile) {
        const pkg = JSON.parse(pkgFile.content) as {
          scripts?: Record<string, string>
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (pkg.scripts?.dev) {
          devCmd = deps?.next
            ? `npm run dev -- -H 0.0.0.0 -p 3000`
            : `npm run dev -- --host 0.0.0.0 --port 3000`
        } else if (deps?.next) {
          devCmd = `npx next dev -H 0.0.0.0 -p 3000`
        } else if (deps?.vite) {
          devCmd = `npx vite --host 0.0.0.0 --port 3000`
        }
      }
    } catch {}

    await sandbox.commands.run("rm -f /tmp/dev.log /tmp/dev.pid", { timeoutMs: 5000 }).catch(() => {})

    // Use setsid + nohup so the process survives shell session teardown
    await sandbox.commands.run(
      `cd ${PROJECT_DIR} && setsid nohup ${devCmd} > /tmp/dev.log 2>&1 < /dev/null & echo $! > /tmp/dev.pid`,
      { timeoutMs: 15000 }
    )

    // Poll for ready — 150 s max (75 × 2 s)
    let ready = false
    for (let i = 0; i < 75; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const processCheck = await sandbox.commands
        .run("test -f /tmp/dev.pid && kill -0 $(cat /tmp/dev.pid) 2>/dev/null && echo running || echo stopped", { timeoutMs: 5000 })
        .catch(() => ({ stdout: "stopped" }))
      if ((processCheck.stdout ?? "").trim() !== "running") {
        const logs = await readLogs()
        errors.push(`Dev server exited before opening port 3000: ${logs.slice(-900)}`)
        break
      }

      try {
        const res = await fetch(previewUrl, { signal: AbortSignal.timeout(4000) })
        const body = await res.text().catch(() => "")
        if (
          res.ok &&
          !body.includes("there's no service running") &&
          !body.includes("closed port error") &&
          !body.includes("is not allowed") &&
          !body.includes("Connection refused")
        ) {
          ready = true
          break
        }
      } catch {}
    }

    if (!ready) {
      const logs = await readLogs()
      if (!errors.length) {
        errors.push(`Dev server did not open port 3000 after 150 s: ${logs.slice(-900)}`)
      }
      await stopSandbox()
      return { ready: false, previewUrl: null, sandboxId: sandbox.sandboxId, errors }
    }

    return { ready: true, previewUrl, sandboxId: sandbox.sandboxId, errors }
  } catch (err: any) {
    const logs = await readLogs()
    if (logs) errors.push(`Sandbox logs: ${logs.slice(-900)}`)
    errors.push(err?.message ?? "Sandbox error")
    await stopSandbox()
    return { ready: false, previewUrl: null, sandboxId: sandbox.sandboxId, errors }
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
  issues: string[],
  shouldCancel?: () => Promise<boolean>
): Promise<{ files: ProjectFile[]; changedPaths: string[]; patchApplied: boolean }> {
  await throwIfCancelled(shouldCancel)
  const issueText = issues.join("\n")
  const referencedPaths = new Set(
    Array.from(issueText.matchAll(/[A-Za-z0-9_.@/-]+\.(?:tsx?|jsx?|css|json|html|mjs|cjs)/g))
      .map((match) => match[0].replace(/^\.?\//, ""))
  )
  const relevantFiles = files
    .filter((f) => /\.(tsx?|jsx?|css|json|html)$/.test(f.path))
    .filter((file) => {
      if (referencedPaths.size === 0) return true
      return (
        referencedPaths.has(file.path) ||
        file.path === "package.json" ||
        file.path.startsWith("src/") && (
          file.path.endsWith("App.tsx") ||
          file.path.endsWith("main.tsx") ||
          file.path.endsWith("index.css")
        )
      )
    })

  const fileContext = relevantFiles
    .map((f) => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`)
    .join("\n\n")

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    system: [
      "You fix bugs in React/Vite projects.",
      "Output a unified git diff patch only. No markdown, no prose.",
      "Use diff --git headers, --- a/path, +++ b/path, and @@ hunks.",
      "Patch only the minimal files and lines needed.",
      "Do not output complete files unless explicitly asked.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Fix these issues with the smallest possible patch:
${issues.map((i) => `- ${i}`).join("\n")}

Available project files:
${files.map((file) => `- ${file.path}`).join("\n")}

Relevant file contents:
${fileContext}

Return only a unified git diff patch like:
diff --git a/src/App.tsx b/src/App.tsx
--- a/src/App.tsx
+++ b/src/App.tsx
@@ ...
-old line
+new line`,
      },
    ],
  })

  await throwIfCancelled(shouldCancel)

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""
  const patched = applyUnifiedPatchToFiles(files, text)
  if (patched) {
    return {
      ...patched,
      patchApplied: true,
    }
  }

  // Compatibility fallback for older model outputs. The primary path above is patch-based.
  const updatedFiles = parseFileBlocks(text)
  const fileMap = new Map(files.map((f) => [f.path, f]))
  for (const updated of updatedFiles) {
    fileMap.set(updated.path, updated)
  }
  return {
    files: Array.from(fileMap.values()),
    changedPaths: updatedFiles.map((file) => file.path),
    patchApplied: false,
  }
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
  await throwIfCancelled(context.shouldCancel)

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
        context.onFileGenerationProgress,
        context.shouldCancel
      )
      await throwIfCancelled(context.shouldCancel)
      const backend = await maybeSetupComputerBackend({
        files,
        plan: input.plan as ProjectPlan,
        prompt: context.prompt,
        context,
      }).catch(async (error: unknown): Promise<ComputerBackendSetupResult> => {
        const message = error instanceof Error ? error.message : "Backend setup failed"
        await adminDb.collection("computers").doc(context.computerId).set(
          {
            supabaseProvisioningStatus: "error",
            supabaseProvisioningReason: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )

        return {
          status: "error",
          reason: message,
          files,
          schemaApplied: false,
          error: message,
        }
      })
      const backendSummary = {
        status: backend.status,
        reason: backend.reason,
        schemaApplied: backend.schemaApplied,
        projectRef: backend.projectRef,
        tables: backend.tables,
        error: backend.error,
      }

      return { files: backend.files, backend: backendSummary }
    }

    case "modify_files": {
      const modified = await modifyFiles(
        input.files as ProjectFile[],
        (input.instruction as string) || "",
        input.plan as ProjectPlan,
        (input.research as string) || "",
        context.shouldCancel
      )
      await throwIfCancelled(context.shouldCancel)
      const backend = await maybeSetupComputerBackend({
        files: modified.files,
        plan: input.plan as ProjectPlan,
        prompt: context.prompt,
        context,
      }).catch(async (error: unknown): Promise<ComputerBackendSetupResult> => {
        const message = error instanceof Error ? error.message : "Backend setup failed"
        await adminDb.collection("computers").doc(context.computerId).set(
          {
            supabaseProvisioningStatus: "error",
            supabaseProvisioningReason: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )

        return {
          status: "error",
          reason: message,
          files: modified.files,
          schemaApplied: false,
          error: message,
        }
      })
      const backendSummary = {
        status: backend.status,
        reason: backend.reason,
        schemaApplied: backend.schemaApplied,
        projectRef: backend.projectRef,
        tables: backend.tables,
        error: backend.error,
      }

      return {
        files: backend.files,
        changedPaths: modified.changedPaths,
        backend: backendSummary,
      }
    }

    case "run_sandbox":
      return runSandbox(filterFiles(input.files as ProjectFile[]), { computerId: context.computerId })

    case "verify_preview":
      return verifyPreview(
        input.sandboxUrl as string,
        input.plan as ProjectPlan,
        context.browserSession
      )

    case "fix_errors": {
      const fixed = await fixErrors(
        filterFiles(input.files as ProjectFile[]),
        (input.issues as string[]) || [],
        context.shouldCancel
      )
      return fixed
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
