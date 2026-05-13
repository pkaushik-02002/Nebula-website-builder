import crypto from "crypto"
import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { z } from "zod"
import type { DocumentReference } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerTimelineEvent } from "@/lib/computer-agent/types"
import { createComputerAgentMessage } from "@/lib/computer-agent/agent-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const runRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  prompt: z.string().trim().max(12000).optional(),
})

const MAX_TIMELINE_FILE_CONTENT_CHARS = 40000
const MAX_TIMELINE_DIFF_CONTENT_CHARS = 120000
const FIRECRAWL_BROWSER_TTL_SECONDS = 60 * 60
const FIRECRAWL_BROWSER_ACTIVITY_TTL_SECONDS = 30 * 60

type FirecrawlSearchResult = {
  title?: unknown
  url?: unknown
  description?: unknown
}

type GenerationDecision = {
  shouldGenerate: boolean
  reason: string
}

type GeneratedFile = {
  path: string
  content: string
}

async function persistGeneratedFilesForSession(
  docRef: DocumentReference,
  files: GeneratedFile[]
) {
  if (!files.length) return

  const snap = await docRef.get()
  const projectId = snap.data()?.projectId
  if (typeof projectId !== "string" || !projectId.trim()) return

  await adminDb.collection("projects").doc(projectId).update({
    files,
    updatedAt: new Date(),
  })
}

function getTimelineFileContent(content: string | undefined, budget: { remaining: number }) {
  if (typeof content !== "string") return undefined
  if (content.length > MAX_TIMELINE_FILE_CONTENT_CHARS) return undefined
  if (content.length > budget.remaining) return undefined
  budget.remaining -= content.length
  return content
}

function buildFileEventMetadata(params: {
  file: GeneratedFile
  existingFile?: GeneratedFile
  isEdit: boolean
  budget: { remaining: number }
}) {
  const newContent = getTimelineFileContent(params.file.content, params.budget)
  const oldContent = params.isEdit
    ? getTimelineFileContent(params.existingFile?.content, params.budget)
    : undefined

  return {
    filePath: params.file.path,
    editVariant: params.isEdit ? "edit" : "write",
    ...(newContent !== undefined ? { newContent } : {}),
    ...(oldContent !== undefined ? { oldContent } : {}),
  }
}

type RemoteBrowserInspection = {
  summary: string
  liveUrl: string
  sessionId: string
  baseUrl: string
  pageTitle: string
  expiresAt: string
  evidence: WebEvidence
}

type AgentWebAction =
  | "search_web"
  | "inspect_page"
  | "collect_dom"
  | "scrape_fallback"
  | "generate_frontend"
  | "skip"

type AgentWebIntent = "inspiration" | "reference" | "research" | "build" | "edit" | "unknown"

type AgentWebPlan = {
  actions: AgentWebAction[]
  targetUrls: string[]
  searchQuery: string
  intent: AgentWebIntent
  reason: string
}

type ComputerRunProfile = {
  hasExistingProject: boolean
  intent: AgentWebIntent
  urls: string[]
  shouldUseWebTools: boolean
  shouldDraftPlan: boolean
  shouldShowDetailedNarration: boolean
  reason: string
}

type WebEvidenceProvider = "firecrawl" | "tinyfish"

type WebEvidence = {
  provider: WebEvidenceProvider
  sourceUrl: string
  intent: AgentWebIntent
  title?: string
  description?: string
  searchResults?: Array<{ title: string; url: string; description?: string }>
  domOutline?: string[]
  sections?: Array<{ tag: string; heading: string; text: string }>
  textContent?: string
  links?: Array<{ text: string; href: string }>
  images?: Array<{ alt: string; src: string }>
  visualBrief?: string[]
  styleHints?: {
    colors?: string[]
    fonts?: string[]
    backgroundColor?: string
    textColor?: string
  }
  screenshotSummary?: string
  fallbackReason?: string
}

const FRONTEND_DESIGN_SKILL = `
CLAUDE FRONTEND DESIGN SKILL — mandatory for new frontend generation:
- Before coding, choose one clear aesthetic direction and commit to it. Examples: brutally minimal, luxury/refined, editorial/magazine, art deco/geometric, organic/natural, industrial/utilitarian, playful/toy-like, retro-futuristic, brutalist/raw. Do not drift into generic SaaS.
- State the design through implementation, not prose: distinctive typography, purposeful palette, spatial composition, imagery, motion, and interaction details must all support the chosen direction.
- Typography must be characterful. Avoid Inter, Roboto, Arial, system-ui, and Space Grotesk as defaults. Pair a distinctive display font with a refined body font using real Google Fonts imports.
- Use CSS custom properties for the palette, surfaces, borders, shadows, type scale, and motion timings.
- Choose one dominant color story and one sharp accent. Purple/violet/indigo gradients are banned unless the user or reference explicitly requires them.
- Avoid predictable templates: no generic "Features / How it Works / Testimonials / Pricing" landing page unless those sections are specifically appropriate and requested.
- Avoid decorative code preview cards, fake dashboards, generic neon AI glows, stock hero compositions, placeholder copy, and repeated card grids.
- Build an actual page for the requested domain. Copy must be specific to the business/audience and should sound like a real brand, not a template.
- Composition must have a memorable idea: asymmetry, editorial rhythm, controlled density, dramatic negative space, layered imagery, geometric systems, or another deliberate visual hook.
- Motion should be restrained but high-impact: page-load reveals, hover states, and key transitions. Use Framer Motion when available.
- Backgrounds should have atmosphere appropriate to the domain: texture, grain, geometric pattern, layered transparencies, lighting, or material depth. Never leave a flat default background unless the aesthetic is intentionally minimal.
- Production-grade means responsive, accessible contrast, real hover/focus states, no overflow bugs, no broken imports, and no dummy placeholders.
`.trim()

async function appendEvent(
  docRef: DocumentReference,
  event: ComputerTimelineEvent,
  runId: string
) {
  const snap = await docRef.get()
  const data = snap.data() || {}
  const timeline = Array.isArray(data.timeline) ? data.timeline : []

  if (data?.currentRunId !== runId) {
    return
  }

  const sanitizedEvent = { ...event, runId, index: timeline.length } as Record<string, unknown>

  if (sanitizedEvent.description === undefined) {
    delete sanitizedEvent.description
  }

  if (sanitizedEvent.metadata && typeof sanitizedEvent.metadata === "object") {
    const cleanedMetadata = Object.entries(sanitizedEvent.metadata as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {})

    if (Object.keys(cleanedMetadata).length > 0) {
      sanitizedEvent.metadata = cleanedMetadata
    } else {
      delete sanitizedEvent.metadata
    }
  }

  timeline.push(sanitizedEvent as unknown as ComputerTimelineEvent)

  await docRef.update({
    timeline,
    updatedAt: new Date(),
  })
}

async function isActiveRun(docRef: DocumentReference, runId: string) {
  const latest = await docRef.get()
  const data = latest.data()
  return data?.currentRunId === runId
}

async function updateTimelineEvent(
  docRef: DocumentReference,
  runId: string,
  eventId: string,
  patch: Partial<ComputerTimelineEvent>
) {
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef)
    const d = snap.data() || {}
    if (d.currentRunId !== runId) return
    const timeline = Array.isArray(d.timeline) ? [...d.timeline] : []
    const idx = timeline.findIndex((e) => e.id === eventId)
    if (idx !== -1) {
      timeline[idx] = { ...timeline[idx], ...patch }
      tx.update(docRef, { timeline, updatedAt: new Date() })
    }
  })
}

function normalizeFirecrawlSearchResults(rawResults: unknown): Array<{ title: string; url: string; description?: string }> {
  const results = Array.isArray(rawResults) ? rawResults : []
  return results
    .map((result) => {
      const record = result as FirecrawlSearchResult
      const url = typeof record.url === "string" ? record.url.trim() : ""
      if (!url.startsWith("http")) return null

      const title = typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : "Untitled result"
      const description = typeof record.description === "string" && record.description.trim()
        ? record.description.trim().slice(0, 500)
        : undefined

      return {
        title,
        url,
        ...(description ? { description } : {}),
      }
    })
    .filter((result): result is { title: string; url: string; description?: string } => Boolean(result))
    .slice(0, 5)
}

function getFirstEvidenceUrl(results: Array<{ url: string }>) {
  return results.find((result) => result.url.startsWith("http"))?.url || null
}

function extractTextFromAnthropicContent(content: unknown) {
  return Array.isArray(content)
    ? content
        .map((contentBlock: any) => (contentBlock.type === "text" ? contentBlock.text : ""))
        .join("")
        .trim()
    : ""
}

function extractJson(text: string): any | null {
  if (!text) return null

  const match = text.match(/\{[\s\S]*\}/)

  if (match) {
    try {
      return JSON.parse(match[0])
    } catch {}
  }

  return null
}

function extractAgentMessage(content: string) {
  return {
    contentWithoutAgent: content.replace(
      /===AGENT_MESSAGE===[\s\S]*?===END_AGENT_MESSAGE===/,
      ""
    ),
  }
}

function parseStreamingFiles(content: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const seenPaths = new Set<string>()
  const parseWithRegex = (fileRegex: RegExp) => {
    let match: RegExpExecArray | null

    while ((match = fileRegex.exec(content)) !== null) {
      const path = match[1]?.trim()
      const fileContent = match[2]
        ?.replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim()

      if (path && fileContent && !seenPaths.has(path)) {
        seenPaths.add(path)
        files.push({ path, content: fileContent })
      }
    }
  }

  parseWithRegex(/===FILE:\s*(.*?)===([\s\S]*?)===END_FILE===/g)
  if (!files.length) {
    parseWithRegex(/===FILE:(.*?)===([\s\S]*?)===END_FILE===/g)
  }

  return files
}

async function parseGenerateResponse(
  res: Response,
  onFileDetected?: (path: string) => Promise<void>
): Promise<{ files: GeneratedFile[]; suggestsBackend: boolean }> {
  const contentType = res.headers.get("content-type") || ""
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  let text = ""
  const decoder = new TextDecoder()
  const discoveredPaths = new Set<string>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    text += chunk

    // Incremental file detection
    const matches = text.matchAll(/===FILE:\s*(.*?)===/g)
    for (const match of matches) {
      const path = match[1]?.trim()
      if (path && !discoveredPaths.has(path)) {
        discoveredPaths.add(path)
        if (onFileDetected) {
          await onFileDetected(path)
        }
      }
    }
  }

  text += decoder.decode()
  console.log("FULL GEN OUTPUT:", text)

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const parsed = extractJson(text)
      const error = typeof parsed?.error === "string" ? parsed.error : null
      throw new Error(error || `Generation failed with ${res.status}`)
    }
    throw new Error(text || `Generation failed with ${res.status}`)
  }

  const suggestsBackend = text.includes("===META: suggestsBackend=true===")
  const { contentWithoutAgent } = extractAgentMessage(text)
  const files = parseStreamingFiles(contentWithoutAgent)
  if (!files.length) {
    console.error("GEN PARSE FAILED:", text.slice(0, 1000))
    throw new Error("No files generated - parser failed")
  }

  return { files, suggestsBackend }
}

type ClarificationQuestionOption = { id: string; label: string; description?: string }
type ClarificationQuestion = {
  kind: "single" | "multi" | "text"
  title: string
  description?: string
  options?: ClarificationQuestionOption[]
  allowCustom?: boolean
  customPlaceholder?: string
  placeholder?: string
}
type ClarificationDecision = {
  needsClarification: boolean
  questions: ClarificationQuestion[] | null
}

function parseClarificationDecision(text: string): ClarificationDecision {
  const parsed = extractJson(text) as Partial<ClarificationDecision> | null
  if (parsed && typeof parsed.needsClarification === "boolean") {
    return {
      needsClarification: parsed.needsClarification,
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : null,
    }
  }
  return { needsClarification: false, questions: null }
}

async function waitForClarification(
  docRef: DocumentReference,
  runId: string,
  timeoutMs = 5 * 60 * 1000
): Promise<{ answer: string } | "skipped" | "inactive"> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = await docRef.get()
    const data = snap.data()
    if (data?.currentRunId !== runId) return "inactive"
    const answer = data?.clarificationAnswer
    if (typeof answer === "string" && answer.trim() && answer !== "skip") return { answer: answer.trim() }
    if (answer === "skip") return "skipped"
    await new Promise((r) => setTimeout(r, 2000))
  }
  return "skipped"
}

function promptNeedsBackend(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  const keywords = [
    "sell", "shop", "store", "cart", "checkout", "order", "payment",
    "ecommerce", "e-commerce", "booking", "reservation", "subscription",
    "inventory", "product catalog", "add to cart", "buy", "purchase",
    "user account", "sign up", "register", "login", "auth",
    "database", "backend", "api", "crud",
    "dashboard", "admin panel", "analytics", "restaurant", "menu order",
  ]
  return keywords.some((k) => lower.includes(k))
}

async function waitForSupabaseAnswer(
  docRef: DocumentReference,
  runId: string,
  timeoutMs = 3 * 60 * 1000
): Promise<"yes" | "no" | "inactive"> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = await docRef.get()
    const data = snap.data()
    if (data?.currentRunId !== runId) return "inactive"
    const answer = data?.supabaseAnswer
    if (answer === "yes" || answer === "no") return answer
    await new Promise((r) => setTimeout(r, 2000))
  }
  return "no"
}

type FailureClassification = {
  category: "syntax_error" | "missing_dependency" | "invalid_request" | "unknown"
  reason: string
}

function parseFailureClassification(text: string): FailureClassification {
  const parsed = extractJson(text) as Partial<FailureClassification> | null
  if (parsed) {
    const validCategories = ["syntax_error", "missing_dependency", "invalid_request", "unknown"]
    return {
      category: validCategories.includes(parsed.category as string)
        ? (parsed.category as FailureClassification["category"])
        : "unknown",
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 500)
        : "parse_failed",
    }
  }

  return { category: "unknown", reason: "parse_failed" }
}

function parseGenerationDecision(text: string): GenerationDecision {
  const parsed = extractJson(text) as Partial<GenerationDecision> | null
  if (
    parsed &&
    typeof parsed.shouldGenerate === "boolean" &&
    typeof parsed.reason === "string"
  ) {
    return {
      shouldGenerate: parsed.shouldGenerate,
      reason: parsed.reason.trim() ? parsed.reason.trim().slice(0, 500) : "default",
    }
  }

  return { shouldGenerate: true, reason: "parse_failed" }
}

function normalizeTinyFishEvent(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const nested = record.event
  return nested && typeof nested === "object"
    ? { ...record, ...(nested as Record<string, unknown>) }
    : record
}

function readStringField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

function summarizeTinyFishResult(result: unknown) {
  if (typeof result === "string") return result.trim()
  if (!result || typeof result !== "object") return ""

  const record = result as Record<string, unknown>
  const directSummary = readStringField(record, ["summary", "answer", "text", "markdown"])
  if (directSummary) return directSummary

  return JSON.stringify(result)
}

function getOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

function summarizeWebEvidence(evidence: WebEvidence) {
  const lines = [
    `Provider: ${evidence.provider}`,
    `URL: ${evidence.sourceUrl}`,
    evidence.title ? `Title: ${evidence.title}` : "",
    evidence.description ? `Description: ${evidence.description}` : "",
    evidence.fallbackReason ? `Fallback: ${evidence.fallbackReason}` : "",
    evidence.searchResults?.length
      ? `Search results:\n${evidence.searchResults.map((result, index) => `${index + 1}. ${result.title}\n${result.url}${result.description ? `\n${result.description}` : ""}`).join("\n\n")}`
      : "",
    evidence.domOutline?.length ? `DOM outline:\n${evidence.domOutline.slice(0, 30).join("\n")}` : "",
    evidence.sections?.length
      ? `Sections:\n${evidence.sections.slice(0, 12).map((section) => `- ${section.heading || section.tag}: ${section.text}`).join("\n")}`
      : "",
    evidence.visualBrief?.length ? `Visual brief:\n${evidence.visualBrief.slice(0, 30).map((item) => `- ${item}`).join("\n")}` : "",
    evidence.styleHints
      ? `Style hints: ${[
          evidence.styleHints.colors?.length ? `colors ${evidence.styleHints.colors.join(", ")}` : "",
          evidence.styleHints.fonts?.length ? `fonts ${evidence.styleHints.fonts.join(", ")}` : "",
          evidence.styleHints.backgroundColor ? `background ${evidence.styleHints.backgroundColor}` : "",
          evidence.styleHints.textColor ? `text ${evidence.styleHints.textColor}` : "",
        ].filter(Boolean).join("; ")}`
      : "",
    evidence.links?.length ? `Key links: ${evidence.links.slice(0, 10).map((link) => `${link.text || "Link"} (${link.href})`).join(", ")}` : "",
    evidence.images?.length ? `Images: ${evidence.images.slice(0, 8).map((image) => `${image.alt || "Image"} (${image.src})`).join(", ")}` : "",
    evidence.textContent ? `Visible copy:\n${evidence.textContent.slice(0, 1800)}` : "",
  ].filter(Boolean)

  return lines.join("\n\n").slice(0, 5000)
}

function formatWebEvidenceList(evidenceList: WebEvidence[]) {
  if (!evidenceList.length) return ""

  return evidenceList
    .map((evidence, index) => `Evidence ${index + 1} (${evidence.intent}, ${evidence.provider})\n${summarizeWebEvidence(evidence)}`)
    .join("\n\n---\n\n")
    .slice(0, 9000)
}

function extractUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"'`]+/g) || []
  return Array.from(
    new Set(matches.map((url) => url.replace(/[),.;!?]+$/, "")))
  ).slice(0, 3)
}

function isInspectableExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.toLowerCase()
    return !(
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      url.pathname.startsWith("/computer/")
    )
  } catch {
    return false
  }
}

function extractInspectableUrls(text: string) {
  return extractUrls(text).filter(isInspectableExternalUrl)
}

function inferWebIntent(prompt: string): AgentWebIntent {
  const normalized = prompt.toLowerCase()
  if (/\b(clone|copy|recreate|replicate|remake|duplicate|inspiration|inspire|inspired by|like this|similar to)\b/.test(normalized)) return "inspiration"
  if (/\b(reference|use this site)\b/.test(normalized)) return "reference"
  if (/\b(research|competitor|latest|current|today|market|examples?)\b/.test(normalized)) return "research"
  if (/\b(update|change|edit|modify|improve)\b/.test(normalized)) return "edit"
  if (/\b(build|create|make|generate)\b/.test(normalized)) return "build"
  return "unknown"
}

function shouldResearchDesignInspiration(prompt: string, intent: AgentWebIntent) {
  if (intent === "edit") return false
  const normalized = prompt.toLowerCase()
  return (
    intent === "build" ||
    /\b(website|site|landing page|homepage|web app|saas|startup|brand|portfolio|agency|restaurant|shop|store)\b/.test(normalized)
  )
}

function getComputerRunProfile(prompt: string, hasExistingProject: boolean): ComputerRunProfile {
  const urls = extractInspectableUrls(prompt)
  const inferredIntent = inferWebIntent(prompt)
  const intent = hasExistingProject && inferredIntent === "unknown" ? "edit" : inferredIntent
  const needsExternalContext =
    urls.length > 0 ||
    intent === "inspiration" ||
    intent === "reference" ||
    intent === "research"
  const shouldUseWebTools =
    needsExternalContext ||
    (!hasExistingProject && shouldResearchDesignInspiration(prompt, intent))
  const shouldDraftPlan =
    !hasExistingProject ||
    intent === "build" ||
    needsExternalContext

  return {
    hasExistingProject,
    intent,
    urls,
    shouldUseWebTools,
    shouldDraftPlan,
    shouldShowDetailedNarration: !hasExistingProject || shouldUseWebTools || shouldDraftPlan,
    reason: hasExistingProject
      ? shouldUseWebTools
        ? "Existing project edit with explicit outside context."
        : "Existing project follow-up can be handled as a targeted edit."
      : "Fresh project run should gather enough context before generation.",
  }
}

function buildDesignInspirationQuery(prompt: string) {
  const compactPrompt = prompt.replace(/\s+/g, " ").trim().slice(0, 180)
  return `premium modern website design inspiration ${compactPrompt}`
}

function normalizeAgentWebAction(value: unknown): AgentWebAction | null {
  const action = typeof value === "string" ? value.trim() : ""
  const actions: AgentWebAction[] = [
    "search_web",
    "inspect_page",
    "collect_dom",
    "scrape_fallback",
    "generate_frontend",
    "skip",
  ]
  return actions.includes(action as AgentWebAction) ? action as AgentWebAction : null
}

function normalizeAgentWebIntent(value: unknown): AgentWebIntent {
  const intent = typeof value === "string" ? value.trim() : ""
  const intents: AgentWebIntent[] = ["inspiration", "reference", "research", "build", "edit", "unknown"]
  return intents.includes(intent as AgentWebIntent) ? intent as AgentWebIntent : "unknown"
}

function hasUsableEvidence(evidence: WebEvidence) {
  return Boolean(
    evidence.textContent?.trim() ||
    evidence.domOutline?.length ||
    evidence.sections?.length ||
    evidence.searchResults?.length ||
    evidence.links?.length ||
    evidence.images?.length
  )
}

async function runTinyFishScrapeFallback(params: {
  targetUrl: string
  prompt: string
  apiKey: string
  signal: AbortSignal
  intent: AgentWebIntent
  fallbackReason: string
}): Promise<WebEvidence> {
  const browserRes = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": params.apiKey,
    },
    body: JSON.stringify({
      url: params.targetUrl,
      goal: `Scrape this page for the website builder task below. Extract useful visible content, headings, links, images, page structure, and style notes. Do not browse interactively.\n\nBuilder task:\n${params.prompt}`,
      browser_profile: "lite",
      api_integration: "lotus-build",
      agent_config: {
        mode: "strict",
        max_steps: 20,
      },
      capture_config: {
        elements: true,
        snapshots: true,
        screenshots: true,
        recording: false,
      },
      output_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          pageTitle: { type: "string" },
          headings: {
            type: "array",
            items: { type: "string" },
          },
          designPatterns: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["summary"],
      },
    }),
    signal: params.signal,
  })

  if (!browserRes.ok) {
    const text = await browserRes.text().catch(() => "")
    throw new Error(`TinyFish request failed: ${browserRes.status} ${text}`)
  }

  const reader = browserRes.body?.getReader()
  if (!reader) throw new Error("TinyFish stream unavailable")

  const decoder = new TextDecoder()
  let buffer = ""
  let summary = ""

  const handleData = async (dataStr: string) => {
    if (!dataStr || dataStr === "[DONE]") return

    const parsed = JSON.parse(dataStr)
    const event = normalizeTinyFishEvent(parsed)
    if (!event) return

    const type = readStringField(event, ["type"]).toUpperCase()

    if (type === "COMPLETE") {
      summary = summarizeTinyFishResult(event.result).trim()
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      const dataLines = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""))

      if (!dataLines.length) continue
      try {
        await handleData(dataLines.join("\n"))
      } catch {
        // Ignore malformed partial SSE payloads.
      }
    }
  }

  buffer += decoder.decode()
  const remainingDataLines = buffer
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
  if (remainingDataLines.length) {
    try {
      await handleData(remainingDataLines.join("\n"))
    } catch {}
  }

  if (!summary) {
    throw new Error("TinyFish stream did not contain a completion result")
  }

  return {
    provider: "tinyfish",
    sourceUrl: params.targetUrl,
    intent: params.intent,
    title: params.targetUrl,
    textContent: summary.slice(0, 6000),
    fallbackReason: params.fallbackReason,
  }
}

function toStringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit)
    : []
}

function toRecordArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).slice(0, limit)
    : []
}

function parseFirecrawlExecuteResult(payload: Record<string, unknown>, sourceUrl: string, intent: AgentWebIntent): WebEvidence {
  const raw =
    typeof payload.result === "string" && payload.result.trim()
      ? payload.result.trim()
      : typeof payload.stdout === "string"
        ? payload.stdout.trim()
        : ""

  if (!raw) {
    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      title?: unknown
      description?: unknown
      headings?: unknown
      domOutline?: unknown
      sections?: unknown
      textContent?: unknown
      links?: unknown
      images?: unknown
      visualBrief?: unknown
      styleHints?: unknown
    }
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : ""
    const domOutline = toStringArray(parsed.domOutline, 80)
    const headingSections = toStringArray(parsed.headings, 24).map((heading) => ({
      tag: "heading",
      heading,
      text: "",
    }))
    const sections = toRecordArray(parsed.sections, 24).map((section) => ({
      tag: typeof section.tag === "string" ? section.tag.slice(0, 20) : "section",
      heading: typeof section.heading === "string" ? section.heading.slice(0, 160) : "",
      text: typeof section.text === "string" ? section.text.slice(0, 700) : "",
    }))
    const textContent = typeof parsed.textContent === "string" ? parsed.textContent.trim().slice(0, 6000) : ""
    const links = toRecordArray(parsed.links, 30).map((link) => ({
      text: typeof link.text === "string" ? link.text.slice(0, 120) : "",
      href: typeof link.href === "string" ? link.href.slice(0, 500) : "",
    })).filter((link) => link.href)
    const images = toRecordArray(parsed.images, 24).map((image) => ({
      alt: typeof image.alt === "string" ? image.alt.slice(0, 160) : "",
      src: typeof image.src === "string" ? image.src.slice(0, 500) : "",
    })).filter((image) => image.src)
    const visualBrief = toStringArray(parsed.visualBrief, 40)
    const rawStyleHints = parsed.styleHints && typeof parsed.styleHints === "object"
      ? parsed.styleHints as Record<string, unknown>
      : {}
    const colors = toStringArray(rawStyleHints.colors, 12)
    const fonts = toStringArray(rawStyleHints.fonts, 8)
    const backgroundColor = typeof rawStyleHints.backgroundColor === "string" ? rawStyleHints.backgroundColor : undefined
    const textColor = typeof rawStyleHints.textColor === "string" ? rawStyleHints.textColor : undefined

    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(domOutline.length ? { domOutline } : {}),
      ...(sections.length || headingSections.length ? { sections: sections.length ? sections : headingSections } : {}),
      ...(textContent ? { textContent } : {}),
      ...(links.length ? { links } : {}),
      ...(images.length ? { images } : {}),
      ...(visualBrief.length ? { visualBrief } : {}),
      ...(colors.length || fonts.length || backgroundColor || textColor
        ? { styleHints: { ...(colors.length ? { colors } : {}), ...(fonts.length ? { fonts } : {}), ...(backgroundColor ? { backgroundColor } : {}), ...(textColor ? { textColor } : {}) } }
        : {}),
    }
  } catch {
    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
      textContent: raw.slice(0, 6000),
    }
  }
}

async function runFirecrawlBrowserInspection(params: {
  targetUrl: string
  apiKey: string
  signal: AbortSignal
  intent: AgentWebIntent
}): Promise<RemoteBrowserInspection> {
  const createRes = await fetch("https://api.firecrawl.dev/v2/browser", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      ttl: FIRECRAWL_BROWSER_TTL_SECONDS,
      activityTtl: FIRECRAWL_BROWSER_ACTIVITY_TTL_SECONDS,
      streamWebView: true,
    }),
    signal: params.signal,
  })

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "")
    throw new Error(`Firecrawl browser session failed: ${createRes.status} ${text}`)
  }

  const session = await createRes.json().catch(() => null) as Record<string, unknown> | null
  const sessionId = typeof session?.id === "string" ? session.id : ""
  const liveUrl =
    typeof session?.interactiveLiveViewUrl === "string" && session.interactiveLiveViewUrl.startsWith("http")
      ? session.interactiveLiveViewUrl
      : typeof session?.liveViewUrl === "string" && session.liveViewUrl.startsWith("http")
        ? session.liveViewUrl
        : ""

  if (!sessionId || !liveUrl) {
    throw new Error("Firecrawl browser response did not include a live view URL")
  }

  const executeCode = `
await page.goto(${JSON.stringify(params.targetUrl)}, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1500);
const title = await page.title();
const description = await page.locator('meta[name="description"]').getAttribute("content").catch(() => "");
const textContent = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
const domOutline = await page.$$eval("body *", nodes => {
  const interesting = ["HEADER", "NAV", "MAIN", "SECTION", "ARTICLE", "ASIDE", "FOOTER", "H1", "H2", "H3", "BUTTON", "A", "FORM"];
  return nodes
    .filter(node => interesting.includes(node.tagName))
    .slice(0, 90)
    .map(node => {
      const text = (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120);
      const id = node.id ? "#" + node.id : "";
      const cls = typeof node.className === "string" && node.className ? "." + node.className.trim().split(/\\s+/).slice(0, 3).join(".") : "";
      return \`\${node.tagName.toLowerCase()}\${id}\${cls}\${text ? " - " + text : ""}\`;
    });
});
const sections = await page.$$eval("header, nav, main, section, article, footer", nodes => nodes.slice(0, 24).map(node => {
  const heading = node.querySelector("h1,h2,h3")?.textContent || "";
  const text = (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 700);
  return { tag: node.tagName.toLowerCase(), heading: heading.trim().slice(0, 160), text };
}));
const links = await page.$$eval("a[href]", nodes => nodes.slice(0, 40).map(node => ({ text: (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120), href: node.href })));
const images = await page.$$eval("img[src]", nodes => nodes.slice(0, 30).map(node => ({ alt: node.alt || "", src: node.currentSrc || node.src })));
const visualBrief = await page.evaluate(() => {
  const fmt = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const describeNode = (node, label) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    const text = fmt(node.textContent).slice(0, 220);
    return [
      label + ": " + node.tagName.toLowerCase(),
      text ? "text=" + JSON.stringify(text) : "",
      "x=" + Math.round(rect.x) + " y=" + Math.round(rect.y) + " w=" + Math.round(rect.width) + " h=" + Math.round(rect.height),
      "display=" + styles.display,
      "position=" + styles.position,
      "font=" + styles.fontFamily + " " + styles.fontSize + "/" + styles.lineHeight + " weight " + styles.fontWeight,
      "color=" + styles.color,
      "bg=" + styles.backgroundColor,
      "radius=" + styles.borderRadius,
      "shadow=" + styles.boxShadow,
    ].filter(Boolean).join(" | ");
  };
  const selectors = [
    ["nav", "navigation"],
    ["header", "header"],
    ["main", "main"],
    ["h1", "primary headline"],
    ["h2", "secondary headline"],
    ["button, a[role='button'], .button", "primary action"],
    ["img, picture, video, canvas, svg", "visual asset"],
    ["section", "section"],
    [".card, [class*='card'], article", "card/panel"],
  ];
  const details = [
    "viewport: " + viewport.width + "x" + viewport.height,
    "body background: " + window.getComputedStyle(document.body).background,
  ];
  selectors.forEach(([selector, label]) => {
    Array.from(document.querySelectorAll(selector)).slice(0, label === "section" ? 8 : 4).forEach((node, index) => {
      const item = describeNode(node, label + " " + (index + 1));
      if (item) details.push(item);
    });
  });
  return details.slice(0, 40);
});
const styleHints = await page.evaluate(() => {
  const body = window.getComputedStyle(document.body);
  const colorCounts = new Map();
  const fontCounts = new Map();
  Array.from(document.querySelectorAll("body *")).slice(0, 300).forEach((node) => {
    const styles = window.getComputedStyle(node);
    [styles.color, styles.backgroundColor, styles.borderColor].forEach((value) => {
      if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        colorCounts.set(value, (colorCounts.get(value) || 0) + 1);
      }
    });
    if (styles.fontFamily) fontCounts.set(styles.fontFamily, (fontCounts.get(styles.fontFamily) || 0) + 1);
  });
  const ranked = (map) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([value]) => value);
  return {
    colors: ranked(colorCounts).slice(0, 10),
    fonts: ranked(fontCounts).slice(0, 6),
    backgroundColor: body.backgroundColor,
    textColor: body.color,
  };
});
JSON.stringify({ title, description, domOutline, sections, textContent: textContent.replace(/\\s+/g, " ").slice(0, 6000), links, images, visualBrief, styleHints });
`.trim()

  const executeRes = await fetch(`https://api.firecrawl.dev/v2/browser/${encodeURIComponent(sessionId)}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      code: executeCode,
      language: "node",
      timeout: 60,
    }),
    signal: params.signal,
  })

  if (!executeRes.ok) {
    const text = await executeRes.text().catch(() => "")
    throw new Error(`Firecrawl browser execute failed: ${executeRes.status} ${text}`)
  }

  const executePayload = await executeRes.json().catch(() => ({})) as Record<string, unknown>
  if (typeof executePayload.error === "string" && executePayload.error.trim()) {
    throw new Error(executePayload.error.trim())
  }

  const evidence = parseFirecrawlExecuteResult(executePayload, params.targetUrl, params.intent)
  const summary = summarizeWebEvidence(evidence)
  return {
    summary,
    liveUrl,
    sessionId,
    baseUrl: getOrigin(liveUrl),
    pageTitle: evidence.title || params.targetUrl,
    expiresAt: new Date(Date.now() + FIRECRAWL_BROWSER_TTL_SECONDS * 1000).toISOString(),
    evidence,
  }
}

async function runFirecrawlSearch(params: {
  query: string
  apiKey: string
  signal?: AbortSignal
}) {
  const searchRes = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      query: params.query,
      limit: 5,
    }),
    signal: params.signal,
  })

  if (!searchRes.ok) {
    throw new Error(`Firecrawl search failed with ${searchRes.status}`)
  }

  const searchData = await searchRes.json().catch(() => null)
  const rawResults = Array.isArray(searchData?.data?.web)
    ? searchData.data.web
    : Array.isArray(searchData?.data)
      ? searchData.data
      : []

  return normalizeFirecrawlSearchResults(rawResults)
}

async function runFirecrawlScrapeFallback(params: {
  targetUrl: string
  apiKey: string
  intent: AgentWebIntent
  signal?: AbortSignal
  fallbackReason: string
}): Promise<WebEvidence> {
  const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      url: params.targetUrl,
      formats: ["markdown", "html", "screenshot"],
      onlyMainContent: false,
    }),
    signal: params.signal,
  })

  if (!scrapeRes.ok) {
    const text = await scrapeRes.text().catch(() => "")
    throw new Error(`Firecrawl scrape failed: ${scrapeRes.status} ${text}`)
  }

  const data = await scrapeRes.json().catch(() => null)
  const payload = data?.data ?? data ?? {}
  const metadata = payload?.metadata && typeof payload.metadata === "object"
    ? payload.metadata as Record<string, unknown>
    : {}
  const title = typeof metadata.title === "string" ? metadata.title.trim() : ""
  const description = typeof metadata.description === "string" ? metadata.description.trim() : ""
  const markdown = typeof payload?.markdown === "string" ? payload.markdown.trim() : ""
  const html = typeof payload?.html === "string" ? payload.html.trim() : ""
  const screenshot = typeof payload?.screenshot === "string" ? payload.screenshot.trim() : ""

  return {
    provider: "firecrawl",
    sourceUrl: params.targetUrl,
    intent: params.intent,
    ...(title ? { title } : {}),
    ...(description ? { description: description.slice(0, 500) } : {}),
    textContent: (markdown || html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 6000),
    ...(screenshot ? { screenshotSummary: `Screenshot captured: ${screenshot}` } : {}),
    fallbackReason: params.fallbackReason,
  }
}

function buildHeuristicWebPlan(prompt: string, profile?: ComputerRunProfile): AgentWebPlan {
  const urls = extractInspectableUrls(prompt)
  const intent = profile?.intent || inferWebIntent(prompt)
  const needsDesignInspiration =
    !profile?.hasExistingProject &&
    urls.length === 0 &&
    shouldResearchDesignInspiration(prompt, intent)
  const needsSearch = urls.length === 0 && (intent === "research" || needsDesignInspiration)
  const shouldInspect = urls.length > 0
  const actions: AgentWebAction[] = []

  if (needsSearch) actions.push("search_web")
  if (shouldInspect || needsDesignInspiration) actions.push("inspect_page", "collect_dom")
  if (!actions.length) actions.push("skip")
  actions.push("generate_frontend")

  return {
    actions,
    targetUrls: urls,
    searchQuery: needsDesignInspiration ? buildDesignInspirationQuery(prompt) : needsSearch ? prompt : "",
    intent,
    reason: urls.length
      ? "The prompt includes a URL, so Firecrawl should inspect it before generation."
      : needsSearch
        ? needsDesignInspiration
          ? "The prompt would benefit from design inspiration before generation."
          : "The prompt asks for external research."
        : profile?.hasExistingProject
          ? "This is a targeted edit to an existing project, so web tools are not required."
          : "No specific web context is required.",
  }
}

function parseAgentWebPlan(text: string, prompt: string, profile?: ComputerRunProfile): AgentWebPlan {
  const fallback = buildHeuristicWebPlan(prompt, profile)
  const parsed = extractJson(text) as Partial<AgentWebPlan> | null
  if (!parsed) return fallback

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map(normalizeAgentWebAction).filter((action): action is AgentWebAction => Boolean(action))
    : []
  const targetUrls = Array.isArray(parsed.targetUrls)
    ? parsed.targetUrls.filter((url): url is string => typeof url === "string" && isInspectableExternalUrl(url)).slice(0, 3)
    : []
  const promptUrls = extractInspectableUrls(prompt)
  const mergedTargetUrls = Array.from(new Set([...promptUrls, ...targetUrls])).slice(0, 3)
  const intent = normalizeAgentWebIntent(parsed.intent) || fallback.intent
  const searchQuery = typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()
    ? parsed.searchQuery.trim().slice(0, 500)
    : fallback.searchQuery
  const reason = typeof parsed.reason === "string" && parsed.reason.trim()
    ? parsed.reason.trim().slice(0, 500)
    : fallback.reason

  const nextActions = actions.length ? actions : fallback.actions
  if (mergedTargetUrls.length && !nextActions.includes("inspect_page")) {
    nextActions.unshift("inspect_page", "collect_dom")
  }
  if (searchQuery && shouldResearchDesignInspiration(prompt, intent)) {
    if (!nextActions.includes("search_web")) nextActions.unshift("search_web")
    if (!nextActions.includes("inspect_page")) nextActions.push("inspect_page")
    if (!nextActions.includes("collect_dom")) nextActions.push("collect_dom")
  }
  if (!nextActions.includes("generate_frontend")) nextActions.push("generate_frontend")

  return {
    actions: Array.from(new Set(nextActions)),
    targetUrls: mergedTargetUrls,
    searchQuery,
    intent,
    reason,
  }
}

async function createAgentWebPlan(prompt: string, planText: string, profile?: ComputerRunProfile): Promise<AgentWebPlan> {
  const heuristic = buildHeuristicWebPlan(prompt, profile)
  if (profile && !profile.shouldUseWebTools) {
    return heuristic
  }

  try {
    const response = await createComputerAgentMessage(anthropic, {
      max_tokens: 250,
      temperature: 0,
      system: `You are directing web research for an AI website builder. Your job is to maximise the quality of design evidence gathered before code generation.

Available actions: search_web, inspect_page, collect_dom, scrape_fallback, generate_frontend, skip

Decision rules:
- User provides a URL → always inspect_page + collect_dom on that URL. This is a reference or clone request.
- User says "like X" or "similar to X" or "inspired by X" (no URL) → search_web to find X, then inspect_page + collect_dom on the top result.
- New website build with no URL and no reference → search_web for "[domain] website design [year]" to collect real design patterns and competitor layouts before generating.
- Simple edit to existing project (color, text, single component) → skip.
- Never inspect localhost, 127.0.0.1, .local, or /computer/ URLs — these are internal runtime URLs.
- TinyFish is not a browser tool and must not appear in actions.

Search query rules:
- Be specific. For a bakery: "artisan bakery website design 2024" not "bakery website".
- Target design-forward sources: Awwwards, Behance, actual business websites — not template galleries.
- For competitor research: "[industry] [location] [business type]" to find real competitors.

Return ONLY valid JSON:
{
  "actions": ["search_web"|"inspect_page"|"collect_dom"|"skip"],
  "targetUrls": ["https://..."],
  "searchQuery": "specific search query or empty string",
  "intent": "inspiration|reference|research|build|edit|unknown",
  "reason": "one sentence explaining the research strategy"
}`,
      messages: [
        {
          role: "user",
          content: `User request:\n${prompt}\n\nPlanning context:\n${planText || "none"}\n\nRun profile:\n${profile ? JSON.stringify(profile) : "none"}\n\nHeuristic default:\n${JSON.stringify(heuristic)}`,
        },
      ],
    }, { enableMcp: false })

    return parseAgentWebPlan(extractTextFromAnthropicContent(response.content), prompt, profile)
  } catch (err) {
    console.error("Computer web plan failed:", err)
    return heuristic
  }
}

function buildAgentGenerationPrompt(params: {
  prompt: string
  planText: string
  webEvidence: WebEvidence[]
  intent?: AgentWebIntent
  isEdit?: boolean
}) {
  const hasWebEvidence = params.webEvidence.length > 0
  const isInspiration = params.intent === "inspiration"
  const contextSections = [
    params.planText.trim()
      ? `Agent plan:\n${params.planText.trim()}`
      : "",
    hasWebEvidence
      ? `Agent web context:\n${formatWebEvidenceList(params.webEvidence)}`
      : "",
    params.isEdit
      ? "IMPORTANT: This is an edit to an existing project. ONLY output the files that need to change. Do NOT output unchanged files. Your changes will be merged surgically."
      : "",
  ].filter(Boolean)

  if (params.isEdit && !contextSections.length) return params.prompt

  const taskVerb = params.isEdit ? "Edit the existing app" : "Build the app"
  const evidenceDirective = hasWebEvidence
    ? isInspiration
      ? `
INSPIRATION RULES (draw from — do not copy verbatim):
- Use the captured DOM outline, sections, style hints, and text content as creative inspiration, not a strict spec.
- Match the general visual direction (color palette, typography feel, layout density) but adapt it into a fresh, original React/Tailwind implementation.
- Preserve the structure of key sections (hero, features, pricing, footer) but you may improve the copy, spacing, and visual execution.
- Reuse real image URLs from the evidence where suitable. Do not invent broken image paths.
- Do not add generic placeholder sections that were not present in the reference.
`.trim()
      : `
REFERENCE / DOM RECONSTRUCTION RULES:
- Treat Agent web context as a strict visual design brief.
- Use the captured DOM outline, sections, visual brief, style hints, image list, and text content to reconstruct the reference's real structure and density.
- Preserve the reference's spatial rhythm: hero proportions, navigation placement, content density, card/panel treatment, image usage, whitespace, border radius, shadows, and button geometry.
- If visualBrief includes element dimensions or positions, use them to guide responsive layout ratios and hierarchy.
- Reuse real image URLs from the evidence when suitable and safe. Do not replace a product/place/person reference with vague dark atmospheric imagery.
- Do not add generic sections that were not present in the reference unless the user explicitly requested them.
`.trim()
    : `
NO REFERENCE CONTEXT:
- Invent a distinctive concept from the user's domain. Do not produce a generic startup template.
- Choose one memorable visual hook before coding and make the implementation express it through layout, typography, color, imagery/texture, and motion.
`.trim()

  return `${taskVerb} requested by the user using the agent context below.

User request:
${params.prompt}

${contextSections.length ? `${contextSections.join("\n\n")}\n\n` : ""}${FRONTEND_DESIGN_SKILL}

${evidenceDirective}

DESIGN SPECIFICATION — treat the web context above as a hard design brief, not optional context:
- Extract the exact color palette, fonts, spacing density, and layout structure from the inspected pages. Reproduce them via CSS custom properties. Do not substitute generic Tailwind defaults.
- If style hints include specific hex colors or font names, use them directly.
- Match the structural density of the reference exactly. If it is dense, do not produce a sparse page. If it is minimal, do not add sections the reference does not have.
- Copy must be domain-specific and written for the actual business. Zero placeholder text, zero "Lorem ipsum", zero "Your tagline here".
- If multiple pages were inspected, use the strongest consistent signals across all of them.

DESIGN IDENTITY — decide before writing any component:
1. Visual personality (editorial, bold typographic, warm artisanal, sleek tech, dramatic, playful — pick one)
2. Color system: brand color + accent + atmospheric background — not plain white or black
3. Typography pair from Google Fonts suited to the domain
4. One standout layout decision that makes this site distinctive

TYPOGRAPHY — mandatory Google Fonts (load via @import in index.css):
- NEVER use system-ui or Inter alone. Always pair a display font with a body font.
- Domain pairings:
    food/hospitality/luxury → Cormorant Garamond + DM Sans OR Marcellus + Lato
    agency/creative/bold → Syne + Inter OR Bebas Neue + Work Sans
    SaaS/tech/product → Plus Jakarta Sans + Inter
    health/wellness → Fraunces + Nunito
    e-commerce/retail → Outfit + Manrope
    finance/legal/trust → Libre Baskerville + Source Sans 3
    editorial/content → Playfair Display + Source Serif 4
- Display font on h1–h3. Body font on p, nav, buttons.

COLOR AND ATMOSPHERE:
- Define --color-brand, --color-accent, --color-bg, --color-surface, --color-text in :root.
- Background must have character: warm cream (#faf7f2), cool off-white (#f4f4f0), deep charcoal (#111110), rich dark (#1a1917).
- Every design needs atmosphere: CSS grain texture, gradient mesh, alternating section tints, or full-bleed photography.
- BANNED: purple/violet gradient defaults, neon glow, rainbow gradients, flat white with no texture.

COPY — non-negotiable:
- ZERO lorem ipsum. ZERO placeholder text. ZERO generic taglines.
- ALL copy must be domain-specific, opinionated, written for a real audience.
- Headlines: strong and specific. "London's most obsessive sourdough" not "Welcome to our bakery".
- CTAs: action-specific. "Reserve a table" not "Contact us".

LAYOUT — domain-driven, not template-driven:
- Restaurant/food: full-bleed hero image → menu highlights with real prices → story/atmosphere → hours/location
- Agency/creative: bold typographic hero → work samples → process → team → contact form
- SaaS/tech: product screenshot hero → 2–3 key differentiators → social proof → pricing → CTA
- E-commerce: product-forward hero → category grid → featured items with prices → trust signals
- Health/wellness: calm trust-building hero → philosophy → services with descriptions → testimonials → booking
- Section backgrounds must alternate for visual flow. Vertical padding: 80–128px on major sections.

IMAGES:
- Use real Unsplash URLs: https://images.unsplash.com/photo-[ID]?w=1200&q=80&auto=format&fit=crop
- Match photo IDs to actual content. Every img must have a working URL.

ABSOLUTE BANS:
- Generic AI template: dark page + purple gradient + Features/Pricing/Docs nav + "Build smarter" hero.
- Flat backgrounds with no atmosphere.
- Placeholder copy anywhere.
- system-ui as the only font.
- Decorative code/preview card as a hero element unless the product IS a code tool.

If the request is to recreate or draw inspiration from a website, build a frontend-only React/Tailwind implementation with responsive layout and local-only interactions. Do not reproduce backend behavior, authentication, payments, private data, or third-party scripts unless explicitly asked.`
}

export async function POST(req: Request) {
  let activeDocRef: DocumentReference | null = null
  let activeRunId: string | null = null

  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => null)
    const parsed = runRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const docRef = adminDb.collection("computerSessions").doc(parsed.data.sessionId)
    activeDocRef = docRef
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const data = docSnap.data() as { ownerId?: string; prompt?: unknown; model?: unknown; timeline?: unknown; projectId?: string }
    if (data.ownerId !== uid) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    let projectFiles: GeneratedFile[] = []
    if (data.projectId) {
      const projectSnap = await adminDb.collection("projects").doc(data.projectId).get()
      if (projectSnap.exists) {
        projectFiles = projectSnap.data()?.files || []
      }
    }

    const storedPrompt = typeof data.prompt === "string" ? data.prompt.trim() : ""
    let prompt = parsed.data.prompt?.trim() || storedPrompt || "No prompt provided"
    const runProfile = getComputerRunProfile(prompt, projectFiles.length > 0)
    const builderModel = typeof data.model === "string" && data.model.trim()
      ? data.model.trim()
      : "GPT-5.5"
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization") || ""
    const now = new Date()
    const runId = crypto.randomUUID()
    activeRunId = runId

    const runStartedEvent: ComputerTimelineEvent = {
      id: crypto.randomUUID(),
      title: "Run started",
      description: "User initiated a computer run.",
      status: "complete",
      kind: "user",
      createdAt: now.toISOString(),
    }

    await adminDb.runTransaction(async (transaction) => {
      const transactionSnap = await transaction.get(docRef)
      const transactionData = transactionSnap.data() as Record<string, unknown> | undefined

      if (transactionData?.status === "running") {
        throw new Error("RUN_ALREADY_IN_PROGRESS")
      }

      const timeline = Array.isArray(transactionData?.timeline)
        ? (transactionData?.timeline as ComputerTimelineEvent[])
        : []

      transaction.update(docRef, {
        currentRunId: runId,
        status: "running",
        previewUrl: null,
        timeline: [...timeline, { ...runStartedEvent, runId, index: timeline.length }],
        updatedAt: now,
      })
    })

    const appendRunEvent = async (event: ComputerTimelineEvent) =>
      appendEvent(docRef, event, runId)

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run already superseded" })
    }

    await appendRunEvent({
      id: crypto.randomUUID(),
      title: runProfile.hasExistingProject ? "Reading request" : "Understanding request",
      description: runProfile.hasExistingProject ? runProfile.reason : undefined,
      status: "complete",
      kind: "understanding",
      createdAt: new Date().toISOString(),
    })

    if (runProfile.shouldShowDetailedNarration) {
      const understandingNarration = await createComputerAgentMessage(anthropic, {
        max_tokens: 200,
        temperature: 0.3,
        system: "You are an autonomous website builder agent. Write 2-3 sentences in first person, plain text, no markdown. State: (1) what you understand the user wants built and the specific domain or business type, (2) your immediate instinct for the visual direction or key design challenge this presents, (3) one specific thing you will do to make this feel authentic to the domain rather than generic.",
        messages: [{
          role: "user",
          content: `User request: ${prompt}`
        }]
      }).catch(() => null)

      const understandingText = understandingNarration
        ? extractTextFromAnthropicContent(understandingNarration.content)
        : null

      if (understandingText) {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Understanding insight",
          description: understandingText,
          status: "complete",
          kind: "understanding",
          createdAt: new Date().toISOString(),
        })
      }
    }

    // — Clarification check: ask if prompt is too vague (skip for edits) —
    if (!runProfile.hasExistingProject) {
      try {
        const clarificationRes = await createComputerAgentMessage(anthropic, {
          max_tokens: 500,
          temperature: 0,
          system: `You are a design consultant for an AI website builder. Your job is to decide whether the user's request has enough detail to produce a great, domain-specific website — and if not, ask the one or two questions that would make the biggest difference to design quality.

Ask for clarification ONLY when the request is genuinely too vague to make good design decisions. Trigger conditions:
- Bare domain with no context: "a bakery", "a gym", "a portfolio" — need to know what makes it distinctive
- No indication of tone, audience, or business personality
- Missing critical content: a restaurant with no name, a portfolio with no profession

Do NOT ask when:
- The request names a specific business, product, or person
- The request mentions style, colors, or references ("like Apple's site", "dark and minimal")
- A URL is provided
- The request is specific enough: "a landing page for a London sushi restaurant" is fine

When asking, ask the questions that MOST affect visual design quality:
- Business name / tagline (for copy and identity)
- Visual style preference (bold/editorial vs minimal/clean vs warm/artisanal vs bold/dark)
- Target audience or key differentiator (one sentence)
- Specific color or feel preferences

Generate 1–3 QuestionConfig objects max. Options must be concrete and visually distinct (not "modern" and "classic" — those are meaningless). At least one question must have kind "single" or "multi" with options.

Return ONLY valid JSON, no markdown:
{
  "needsClarification": boolean,
  "questions": [
    {
      "kind": "single" | "multi" | "text",
      "title": string,
      "description"?: string,
      "options"?: [{ "id": string, "label": string, "description"?: string }],
      "allowCustom"?: boolean,
      "customPlaceholder"?: string
    }
  ] | null
}`,
          messages: [{
            role: "user",
            content: `User request: "${prompt.slice(0, 400)}"`,
          }],
        }, { enableMcp: false })

        const clarificationDecision = parseClarificationDecision(
          extractTextFromAnthropicContent(clarificationRes.content)
        )

        if (clarificationDecision.needsClarification && clarificationDecision.questions?.length) {
          const questionEventId = crypto.randomUUID()
          await appendRunEvent({
            id: questionEventId,
            title: "Clarification needed",
            description: "A few quick questions before I start building.",
            status: "complete",
            kind: "question",
            createdAt: new Date().toISOString(),
            metadata: {
              questionType: "clarification",
              questions: JSON.stringify(clarificationDecision.questions),
            },
          })

          await docRef.update({ clarificationAnswer: null })

          const clarificationResult = await waitForClarification(docRef, runId)

          if (clarificationResult === "inactive") {
            return NextResponse.json({ ok: false, message: "Run superseded during clarification" })
          }

          if (clarificationResult !== "skipped") {
            prompt = `${prompt}\n\nUser clarification: ${clarificationResult.answer}`
          }

          await docRef.update({ clarificationAnswer: null })
        }
      } catch (err) {
        console.error("Clarification check failed:", err)
      }
    }

    let planText = ""

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    if (!runProfile.shouldDraftPlan) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Planning execution",
        description: "Targeted edit, skipped plan drafting.",
        status: "skipped",
        kind: "planning",
        createdAt: new Date().toISOString(),
      })
    } else try {
      const response = await createComputerAgentMessage(anthropic, {
        max_tokens: 700,
        temperature: 0.2,
        system: `You are a senior product designer and frontend architect creating a build brief for a website or web application.

For simple edits (text change, color tweak, single component fix, minor layout adjustment): output exactly SKIP_PLAN.

For all other requests, produce a precise BUILD BRIEF using this structure:

**Purpose & Audience**
One sentence: what this site does and who it is for.

**Domain & Tone**
Identify the domain (restaurant, SaaS, portfolio, e-commerce, agency, health, finance, etc.) and the correct visual tone for that domain. Be specific — "warm artisanal bakery" beats "food website".

**Visual Identity**
- Color: primary brand color + accent + background tone (with specific hex values)
- Typography: Google Fonts display/heading font + body font pair appropriate for the domain
- Mood: 3 adjectives that define the visual character

**Section Architecture**
List exactly which sections to build, in order, with one sentence on what each must accomplish. No filler sections. Minimum 4, maximum 7 sections for a landing page.

**Standout Element**
One specific design decision that makes this site distinctive and not generic. Be concrete: "full-bleed hero image with parallax text overlay" or "large editorial headline spanning full viewport width" or "asymmetric two-column feature layout with floating stat cards".

**Copy Strategy**
Key headline (write the actual hero headline), primary CTA text, and tone of voice guide for the rest of the copy.

Rules:
- No code. No assumptions about implementation details.
- Every decision must be justified by the domain. A bakery and a SaaS product must look completely different.
- Be opinionated. Vague plans produce generic output.`,
        messages: [
          {
            role: "user",
            content: `User request: ${prompt}\n\nRun profile:\n${JSON.stringify(runProfile)}`,
          },
        ],
      })

      planText =
        extractTextFromAnthropicContent(response.content) || "No plan generated."

      if (planText.trim() === "SKIP_PLAN") {
        planText = ""
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Planning execution",
          description: "Simple task, skipped plan drafting.",
          status: "skipped",
          kind: "planning",
          createdAt: new Date().toISOString(),
        })
      } else {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Planning execution",
          description: planText,
          status: "complete",
          kind: "planning",
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error("Computer planning failed:", err)
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Planning failed",
        description: "Failed to generate plan.",
        status: "error",
        kind: "planning",
        createdAt: new Date().toISOString(),
      })
    }

    const webPlan = await createAgentWebPlan(prompt, planText, runProfile)

    if (runProfile.shouldUseWebTools) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Web plan",
        description: `${webPlan.reason}\nActions: ${webPlan.actions.join(", ")}`,
        status: "complete",
        kind: "planning",
        createdAt: new Date().toISOString(),
      })
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY
    const tinyFishApiKey = process.env.TINYFISH_API_KEY
    const webEvidence: WebEvidence[] = []
    let searchResults: Array<{ title: string; url: string; description?: string }> = []

    if (runProfile.shouldUseWebTools && webPlan.actions.includes("skip")) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Web skipped",
        description: webPlan.reason,
        status: "complete",
        kind: "research",
        createdAt: new Date().toISOString(),
      })
    }

    if (webPlan.actions.includes("search_web")) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Researching web",
        description: webPlan.searchQuery || prompt,
        status: "running",
        kind: "research",
        createdAt: new Date().toISOString(),
      })

      try {
        if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
        searchResults = await runFirecrawlSearch({
          query: webPlan.searchQuery || prompt,
          apiKey: firecrawlApiKey,
        })

        const searchEvidence: WebEvidence = {
          provider: "firecrawl",
          sourceUrl: "firecrawl:search",
          intent: webPlan.intent,
          searchResults,
        }
        webEvidence.push(searchEvidence)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Research complete",
          description: summarizeWebEvidence(searchEvidence),
          status: "complete",
          kind: "research",
          createdAt: new Date().toISOString(),
        })

        const researchNarration = await createComputerAgentMessage(anthropic, {
          max_tokens: 200,
          temperature: 0.3,
          system: "You are an autonomous website builder agent narrating a research phase. First person, plain text, no markdown, 2-3 sentences. Extract design-relevant signals: what color palettes, layout patterns, typography styles, or content structures appeared across the results that are worth applying to this build. Be specific — name colors, describe layouts, mention font styles.",
          messages: [{
            role: "user",
            content: `User request: ${prompt}\n\nSearch results:\n${summarizeWebEvidence(searchEvidence)}`
          }]
        }).catch(() => null)

        const researchText = researchNarration
          ? extractTextFromAnthropicContent(researchNarration.content)
          : null

        if (researchText) {
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Research insight",
            description: researchText,
            status: "complete",
            kind: "research",
            createdAt: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error("Computer Firecrawl search failed:", err)
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Research failed",
          description: err instanceof Error ? err.message : "Unable to fetch web results.",
          status: "error",
          kind: "research",
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const targetUrls = Array.from(
      new Set([
        ...webPlan.targetUrls,
        ...(webPlan.actions.includes("inspect_page") || webPlan.actions.includes("collect_dom")
          ? [getFirstEvidenceUrl(searchResults)].filter((url): url is string => Boolean(url))
          : []),
      ])
    ).slice(0, 2)

    if ((webPlan.actions.includes("inspect_page") || webPlan.actions.includes("collect_dom")) && targetUrls.length === 0) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Browser skipped",
        description: "No target URL was available for Firecrawl inspection.",
        status: "complete",
        kind: "browser",
        createdAt: new Date().toISOString(),
      })
    }

    for (const targetUrl of targetUrls) {
      if (!(await isActiveRun(docRef, runId))) {
        return NextResponse.json({ ok: false, message: "Run no longer active" })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 75000)
      try {
        if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
        const inspection = await runFirecrawlBrowserInspection({
          targetUrl,
          apiKey: firecrawlApiKey,
          signal: controller.signal,
          intent: webPlan.intent,
        })

        webEvidence.push(inspection.evidence)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Page inspected",
          description: inspection.summary || "Firecrawl collected page context.",
          status: "complete",
          kind: "browser",
          createdAt: new Date().toISOString(),
          metadata: {
            targetUrl,
            browserLiveUrl: inspection.liveUrl,
            browserSessionId: inspection.sessionId || null,
            browserBaseUrl: inspection.baseUrl || null,
            browserProvider: "firecrawl",
            browserExpiresAt: inspection.expiresAt,
            pageTitle: inspection.pageTitle || targetUrl,
          },
        })

        const browserNarration = await createComputerAgentMessage(anthropic, {
          max_tokens: 220,
          temperature: 0.3,
          system: "You are an autonomous website builder agent narrating a page inspection. First person, plain text, no markdown, 2-3 sentences. Extract and name specific design decisions you observed: exact color palette, heading font style, layout structure, hero treatment, spacing density, button style, background treatment. State concretely what you will carry into the build.",
          messages: [{
            role: "user",
            content: `User request: ${prompt}\n\nPage: ${targetUrl}\nTitle: ${inspection.pageTitle}\n\nInspection data:\n${inspection.summary.slice(0, 1000)}`
          }]
        }).catch(() => null)

        const browserText = browserNarration
          ? extractTextFromAnthropicContent(browserNarration.content)
          : null

        if (browserText) {
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Browser insight",
            description: browserText,
            status: "complete",
            kind: "browser",
            createdAt: new Date().toISOString(),
          })
        }
      } catch (browserErr) {
        console.error("Firecrawl browser failed:", browserErr)
        const browserFailure = browserErr instanceof Error ? browserErr.message : "Firecrawl browser failed"

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Browser fallback",
          description: "Firecrawl browser was unavailable, collecting scrape context.",
          status: "complete",
          kind: "browser",
          createdAt: new Date().toISOString(),
        })

        try {
          if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
          const scrapeEvidence = await runFirecrawlScrapeFallback({
            targetUrl,
            apiKey: firecrawlApiKey,
            intent: webPlan.intent,
            signal: controller.signal,
            fallbackReason: browserFailure,
          })
          webEvidence.push(scrapeEvidence)

          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Scrape context collected",
            description: summarizeWebEvidence(scrapeEvidence),
            status: "complete",
            kind: "research",
            createdAt: new Date().toISOString(),
          })
        } catch (firecrawlScrapeErr) {
          const firecrawlScrapeFailure = firecrawlScrapeErr instanceof Error
            ? firecrawlScrapeErr.message
            : "Firecrawl scrape failed"

          if (!tinyFishApiKey) {
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Scrape failed",
              description: firecrawlScrapeFailure,
              status: "error",
              kind: "research",
              createdAt: new Date().toISOString(),
            })
          } else {
            try {
              const tinyFishEvidence = await runTinyFishScrapeFallback({
                targetUrl,
                prompt,
                apiKey: tinyFishApiKey,
                signal: controller.signal,
                intent: webPlan.intent,
                fallbackReason: firecrawlScrapeFailure,
              })
              webEvidence.push(tinyFishEvidence)

              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Fallback scrape collected",
                description: summarizeWebEvidence(tinyFishEvidence),
                status: "complete",
                kind: "research",
                createdAt: new Date().toISOString(),
                metadata: {
                  targetUrl,
                  browserProvider: "tinyfish",
                },
              })
            } catch (tinyFishErr) {
              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Scrape failed",
                description: tinyFishErr instanceof Error ? tinyFishErr.message : "TinyFish fallback failed",
                status: "error",
                kind: "research",
                createdAt: new Date().toISOString(),
              })
            }
          }
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    const usableWebEvidence = webEvidence.filter(hasUsableEvidence)

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    // — Generation decision phase —
    let generationDecision: GenerationDecision = { shouldGenerate: true, reason: "builder_run" }

    if (runProfile.hasExistingProject && !runProfile.shouldUseWebTools) {
      generationDecision = { shouldGenerate: true, reason: "targeted_edit" }
    } else try {
      const generationDecisionRes = await createComputerAgentMessage(anthropic, {
        temperature: 0,
        max_tokens: 120,
        system: `
You are deciding whether code generation is required.

Rules:
- Return ONLY JSON
- No markdown
- Be conservative
- Only generate code if necessary

Format:
{
  "shouldGenerate": boolean,
  "reason": string
}
`,
        messages: [
          {
            role: "user",
            content: `User request: ${prompt}

Planning:
${planText || "none"}

Research:
${formatWebEvidenceList(usableWebEvidence) || "none"}

Browser:
${formatWebEvidenceList(usableWebEvidence.filter((evidence) => evidence.sourceUrl.startsWith("http"))) || "none"}`,
          },
        ],
      }, { enableMcp: false })

      generationDecision = parseGenerationDecision(
        extractTextFromAnthropicContent(generationDecisionRes.content)
      )
    } catch (err) {
      console.error("Computer generation decision failed:", err)
      generationDecision = { shouldGenerate: true, reason: "decision_failed" }
    }

    if (!generationDecision.shouldGenerate) {
      generationDecision = { shouldGenerate: true, reason: generationDecision.reason || "builder_run" }
    }

    await appendRunEvent({
      id: crypto.randomUUID(),
      title: "Generation decision",
      description: generationDecision.shouldGenerate
        ? `Generation required: ${generationDecision.reason}`
        : `Generation skipped: ${generationDecision.reason}`,
      status: "complete",
      kind: "code",
      createdAt: new Date().toISOString(),
    })

    if (runProfile.shouldShowDetailedNarration) {
    const buildNarration = await createComputerAgentMessage(anthropic, {
      max_tokens: 220,
      temperature: 0.3,
      system: "You are an autonomous design and engineering agent. Write a commit statement in first person — 3-4 sentences, no markdown. State: (1) the specific visual identity you are committing to, naming the font pair and color direction, (2) the standout layout decision for the hero or most important section, (3) what makes this site feel handcrafted for this domain rather than generic.",
      messages: [{
        role: "user",
        content: `User request: ${prompt}\n\nBuild plan:\n${planText.slice(0, 800)}\n\nResearch gathered:\n${formatWebEvidenceList(usableWebEvidence).slice(0, 500)}`
      }]
    }).catch(() => null)

    const buildText = buildNarration
      ? extractTextFromAnthropicContent(buildNarration.content)
      : null

    if (buildText) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Build approach",
        description: buildText,
        status: "complete",
        kind: "code",
        createdAt: new Date().toISOString(),
      })
    }
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const requestOrigin = new URL(req.url).origin
    const baseUrl = process.env.BASE_URL || process.env.NEXTAUTH_URL || requestOrigin

    // Fire-and-forget: pre-create a sandbox and warm its npm cache while generation runs.
    // By the time generation finishes (~15-30s), most packages are cached → sandbox install
    // takes 2-5s instead of 25s.
    let prewarmSandboxId: string | null = null
    fetch(`${baseUrl}/api/sandbox/prewarm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.sandboxId) prewarmSandboxId = d.sandboxId })
      .catch(() => {})

    const generationPrompt = buildAgentGenerationPrompt({
      prompt,
      planText,
      webEvidence: usableWebEvidence,
      intent: webPlan.intent,
      isEdit: projectFiles.length > 0,
    })
    let generatedFiles: GeneratedFile[] = []

    if (generationDecision.shouldGenerate) {
      let genData: unknown = null
      let generationFailed = false
      let generationError = ""

      const generatingEventId = crypto.randomUUID()
      await appendRunEvent({
        id: generatingEventId,
        title: "Generating code",
        description: "Starting build process...",
        status: "running",
        kind: "code",
        createdAt: new Date().toISOString(),
      })

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 300000)
        let genRes: Response

        try {
          genRes = await fetch(`${baseUrl}/api/generate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              prompt: generationPrompt,
              model: builderModel,
              existingFiles: projectFiles,
              intent: webPlan.intent,
            }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeout)
        }

        let lastEventId: string | null = null

        const { files: generatedPatchFiles, suggestsBackend: genSuggestsBackend } = await parseGenerateResponse(genRes, async (path) => {
          const newEventId = crypto.randomUUID()
          lastEventId = newEventId

          await appendRunEvent({
            id: newEventId,
            title: `Generating ${path}`,
            description: undefined,
            status: "running",
            kind: "code",
            createdAt: new Date().toISOString(),
            metadata: {
              filePath: path,
              editVariant: projectFiles.length > 0 ? "edit" : "write",
            },
          })
        })
        generatedFiles = generatedPatchFiles

        // Surgical merge: Combine newly generated/edited files with existing project files
        if (projectFiles.length > 0 && generatedFiles.length > 0) {
          const fileMap = new Map<string, string>()
          projectFiles.forEach(f => fileMap.set(f.path, f.content))
          generatedFiles.forEach(f => fileMap.set(f.path, f.content))
          generatedFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }))
        }

        if (data.projectId && generatedFiles.length > 0) {
          await adminDb.collection("projects").doc(data.projectId).update({
            files: generatedFiles,
            updatedAt: new Date()
          })
        }

        genData = { files: generatedFiles }

        // Mark all dynamic file generation events as complete
        try {
          await adminDb.runTransaction(async (tx) => {
            const s = await tx.get(docRef)
            const d = s.data() || {}
            if (d.currentRunId !== runId) return
            const t = Array.isArray(d.timeline) ? [...d.timeline] : []
            const existingByPath = new Map(projectFiles.map((file) => [file.path, file]))
            const patchByPath = new Map(generatedPatchFiles.map((file) => [file.path, file]))
            const metadataBudget = { remaining: MAX_TIMELINE_DIFF_CONTENT_CHARS }
            let changed = false
            for (let i = 0; i < t.length; i++) {
              if (
                t[i].status === "running" &&
                (t[i].id === generatingEventId || t[i].title.startsWith("Generating "))
              ) {
                const filePath = typeof t[i].metadata?.filePath === "string" ? t[i].metadata.filePath : ""
                const patchFile = filePath ? patchByPath.get(filePath) : undefined
                t[i] = {
                  ...t[i],
                  status: "complete",
                  ...(patchFile
                    ? {
                        metadata: {
                          ...(t[i].metadata || {}),
                          ...buildFileEventMetadata({
                            file: patchFile,
                            existingFile: existingByPath.get(patchFile.path),
                            isEdit: projectFiles.length > 0,
                            budget: metadataBudget,
                          }),
                        },
                      }
                    : t[i].id === generatingEventId
                      ? {}
                      : {
                          metadata: {
                            ...(t[i].metadata || {}),
                            diffContentOmitted: true,
                          },
                        }),
                }
                changed = true
              }
            }
            if (changed) {
              tx.update(docRef, { timeline: t, updatedAt: new Date() })
            }
          })
        } catch (e) {
          console.error("Failed to cleanup file events:", e)
        }

        if (!genRes.ok || generatedFiles.length === 0) {
          generationFailed = true
        } else {
          // Build a comma-separated list of file paths for the UI to display
          const filePaths = generatedFiles.map((f) => f.path).join(",")
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Code generated",
            description: `${generatedFiles.length} files generated`,
            status: "complete",
            kind: "code",
            createdAt: new Date().toISOString(),
            metadata: {
              fileCount: generatedFiles.length,
              filePaths,
            },
          })

          // Persist generated project for reuse (only if session not already linked)
          try {
            const sessionSnap = await docRef.get()
            const sessionData = sessionSnap.data() || {}
            if (!sessionData?.projectId) {
              const projectRef = adminDb.collection("projects").doc()
              await projectRef.set({
                files: generatedFiles,
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerId: uid,
                name: `Computer project ${runId.slice(0, 8)}`,
                prompt,
                messages: [
                  {
                    role: "user",
                    content: prompt,
                    timestamp: new Date().toISOString(),
                  },
                ],
                source: "computer",
                status: "complete",
              })

              await docRef.update({ projectId: projectRef.id })

              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Project created",
                description: projectRef.id,
                status: "complete",
                kind: "user",
                createdAt: new Date().toISOString(),
                metadata: { projectId: projectRef.id },
              })
            }
          } catch (err) {
            console.error("Persisting generated project failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Project persist failed",
              description: err instanceof Error ? err.message : String(err),
              status: "error",
              kind: "user",
              createdAt: new Date().toISOString(),
            })
          }

          // — Backend detection: suggest Supabase if the generated app needs a database —
          if (genSuggestsBackend || promptNeedsBackend(prompt)) {
            try {
              const currentSessionSnap = await docRef.get()
              const currentSessionData = currentSessionSnap.data() || {}
              const currentProjectId = currentSessionData?.projectId
              let alreadyHasSupabase = false
              if (currentProjectId) {
                const projectSnap = await adminDb.collection("projects").doc(currentProjectId).get()
                alreadyHasSupabase = Boolean(projectSnap.data()?.supabaseProjectRef)
              }
              if (!alreadyHasSupabase) {
                await appendRunEvent({
                  id: crypto.randomUUID(),
                  title: "Backend detected",
                  description: "This app needs a database. Would you like to set up Supabase?",
                  status: "complete",
                  kind: "question",
                  createdAt: new Date().toISOString(),
                  metadata: { questionType: "supabase" },
                })
                await docRef.update({ supabaseAnswer: null })

                const supabaseRes = await waitForSupabaseAnswer(docRef, runId)
                if (supabaseRes === "inactive") {
                  return NextResponse.json({ ok: false, error: "Session superseded during Supabase prompt" }, { status: 409 })
                }

                if (supabaseRes === "yes" && currentProjectId) {
                  const supabaseSetupEventId = crypto.randomUUID()
                  await appendRunEvent({
                    id: supabaseSetupEventId,
                    title: "Connecting Supabase",
                    description: "Setting up your database and wiring it into the code...",
                    status: "running",
                    kind: "code",
                    createdAt: new Date().toISOString(),
                    metadata: { supabaseSetup: true },
                  })
                  try {
                    const autoSetupRes = await fetch(`${baseUrl}/api/integrations/supabase/auto-setup`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: authHeader },
                      body: JSON.stringify({ projectId: currentProjectId, createProject: true }),
                    })
                    const autoSetup = await autoSetupRes.json().catch(() => ({})) as { projectRef?: string; error?: string; supabaseUrl?: string; supabaseAnonKey?: string }

                    if (!autoSetupRes.ok || !autoSetup.projectRef) {
                      const errMsg = autoSetup.error || "Supabase setup failed"
                      if (errMsg.includes("OAuth") || errMsg.includes("connection required") || autoSetupRes.status === 401) {
                        await updateTimelineEvent(docRef, runId, supabaseSetupEventId, {
                          title: "Supabase not connected",
                          description: "Connect your Supabase account from the settings panel, then run again to wire in the backend.",
                          status: "error",
                        })
                      } else {
                        throw new Error(errMsg)
                      }
                    } else {
                      const provisionRes = await fetch(`${baseUrl}/api/integrations/supabase/provision`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: authHeader },
                        body: JSON.stringify({ projectId: currentProjectId }),
                      })
                      const provision = await provisionRes.json().catch(() => ({})) as { provisioned?: boolean; error?: string }

                      if (provision.provisioned) {
                        // Re-read updated files from Firestore (provision saves them there)
                        const updatedProjectSnap = await adminDb.collection("projects").doc(currentProjectId).get()
                        const updatedFiles = updatedProjectSnap.data()?.files
                        if (Array.isArray(updatedFiles) && updatedFiles.length > 0) {
                          generatedFiles = updatedFiles
                          genData = { files: generatedFiles }
                        }
                      }

                      await updateTimelineEvent(docRef, runId, supabaseSetupEventId, {
                        title: "Supabase connected",
                        description: `Database schema created and backend wired into your code${autoSetup.projectRef ? ` (${autoSetup.projectRef})` : ""}.`,
                        status: "complete",
                        metadata: { supabaseProjectRef: autoSetup.projectRef, supabaseSetup: true },
                      })
                    }
                  } catch (setupErr) {
                    console.error("Server-side Supabase setup failed:", setupErr)
                    await updateTimelineEvent(docRef, runId, supabaseSetupEventId, {
                      title: "Supabase setup failed",
                      description: setupErr instanceof Error ? setupErr.message : "Could not set up Supabase",
                      status: "error",
                    }).catch(() => {})
                  }
                }

                await docRef.update({ supabaseAnswer: null }).catch(() => {})
              }
            } catch (err) {
              console.error("Backend detection check failed:", err)
            }
          }
        }
      } catch (err) {
        console.error("Computer generation failed:", err)
        generationError = err instanceof Error ? err.message : "Generation failed"
        generationFailed = true
      }

      if (generationFailed) {
        try {
          await adminDb.runTransaction(async (tx) => {
            const s = await tx.get(docRef)
            const d = s.data() || {}
            if (d.currentRunId !== runId) return
            const t = Array.isArray(d.timeline) ? [...d.timeline] : []
            const index = t.findIndex((event) => event.id === generatingEventId)
            if (index !== -1 && t[index].status === "running") {
              t[index] = { ...t[index], status: "error" }
              tx.update(docRef, { timeline: t, updatedAt: new Date() })
            }
          })
        } catch (err) {
          console.error("Failed to mark generation event failed:", err)
        }

        // — Classify failure —
        let classification: FailureClassification = { category: "unknown", reason: "default" }

        try {
          const failureRes = await createComputerAgentMessage(anthropic, {
            temperature: 0,
            max_tokens: 120,
            system: `
You classify code generation failures.

Rules:
- Return ONLY JSON
- No markdown

Categories:
- syntax_error
- missing_dependency
- invalid_request
- unknown

Format:
{
  "category": "...",
  "reason": "..."
}
`,
            messages: [
              {
                role: "user",
                content: `Prompt: ${prompt}
Generation result: ${JSON.stringify(genData)}`,
              },
            ],
          }, { enableMcp: false })

          classification = parseFailureClassification(
            extractTextFromAnthropicContent(failureRes.content)
          )
        } catch (err) {
          console.error("Computer failure classification failed:", err)
          classification = { category: "unknown", reason: "classification_failed" }
        }

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Generation failed",
          description: generationError || `${classification.category}: ${classification.reason}`,
          status: "error",
          kind: "code",
          createdAt: new Date().toISOString(),
        })

        // — Single fix attempt (never for invalid_request) —
        if (classification.category !== "invalid_request" && generatedFiles.length > 0) {
          const fixPrompt = `You are fixing an existing codebase.

Original user request:
${prompt}

Failure:
${classification.category} - ${classification.reason}

Instructions:
- Modify ONLY the necessary parts of the code
- Do NOT rewrite the entire project
- Keep existing structure intact
- Fix only the root cause`

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 90000)
            let fixRes: Response

            try {
              fixRes = await fetch(`${baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                },
              body: JSON.stringify({
                prompt: fixPrompt,
                  model: builderModel,
                  existingFiles: generatedFiles,
                  creationMode: "build",
                }),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timeout)
            }

            const { files: fixedFiles } = await parseGenerateResponse(fixRes)

            if (fixedFiles.length > 0) {
              generatedFiles = fixedFiles
              await persistGeneratedFilesForSession(docRef, generatedFiles)
            }

            await appendRunEvent({
              id: crypto.randomUUID(),
              title: fixRes.ok ? "Fix applied" : "Fix failed",
              description: fixRes.ok
                ? fixedFiles.length
                  ? `${fixedFiles.length} files updated`
                  : "Fix applied with no file changes"
                : "Fix attempt did not succeed.",
              status: fixRes.ok ? "complete" : "error",
              kind: "code",
              createdAt: new Date().toISOString(),
            })
          } catch (err) {
            console.error("Computer fix attempt failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Fix failed",
              description: err instanceof Error ? err.message : "Unable to apply fix.",
              status: "error",
              kind: "code",
              createdAt: new Date().toISOString(),
            })
          }
          // STOP — no further retries
        }
      }
    }

    // — Sandbox validation phase —
    if (!generatedFiles.length) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Preview skipped",
        description: "No files generated",
        status: "complete",
        kind: "sandbox",
        createdAt: new Date().toISOString(),
      })
    }

    const hasEntry =
      generatedFiles.some((f) => typeof f?.path === "string" && f.path === "package.json") &&
      generatedFiles.some((f) => typeof f?.path === "string" && f.path.includes("main.tsx"))

    if (generatedFiles.length > 0 && !hasEntry) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Preview skipped",
        description: "Missing required project files",
        status: "complete",
        kind: "sandbox",
        createdAt: new Date().toISOString(),
      })
    }

    if (generatedFiles.length > 0 && hasEntry) {
      let sandboxSuccess = false
      let sandboxUrl: string | null = null
      let sandboxErrors = ""
      let sandboxLogs = ""
      let postPreviewCheckFailed = false
      let postPreviewCheckOutput = ""

      try {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Starting sandbox",
          description: "Running the generated app in a preview environment.",
          status: "running",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })

        const sessionForSandbox = await docRef.get()
        const sandboxProjectId = typeof sessionForSandbox.data()?.projectId === "string"
          ? sessionForSandbox.data()?.projectId
          : undefined

        const sandboxRes = await fetch(`${baseUrl}/api/sandbox`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            files: generatedFiles,
            projectId: sandboxProjectId,
            ...(prewarmSandboxId ? { sandboxId: prewarmSandboxId } : {}),
          }),
        })

        // Sandbox route streams NDJSON — consume all lines to find success/error events
        const sandboxText = await sandboxRes.text().catch(() => "")
        if (!sandboxRes.ok) {
          const parsed = extractJson(sandboxText)
          sandboxErrors =
            typeof parsed?.error === "string"
              ? parsed.error
              : sandboxText || `Sandbox failed with ${sandboxRes.status}`
        }
        for (const line of sandboxText.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const event = JSON.parse(trimmed)
            if (event?.type === "success") {
              sandboxSuccess = true
              const nextSandboxUrl =
                typeof event?.url === "string"
                  ? event.url
                  : typeof event?.previewUrl === "string"
                  ? event.previewUrl
                  : typeof event?.data?.url === "string"
                  ? event.data.url
                  : null

              if (!sandboxUrl && nextSandboxUrl) {
                sandboxUrl = nextSandboxUrl

                if (await isActiveRun(docRef, runId)) {
                  await docRef.update({
                    previewUrl: sandboxUrl,
                    updatedAt: new Date(),
                  })

                  await appendRunEvent({
                    id: crypto.randomUUID(),
                    title: "Preview ready",
                    description: sandboxUrl || undefined,
                    status: "complete",
                    kind: "sandbox",
                    createdAt: new Date().toISOString(),
                  })
                }
              }
            } else if (event?.type === "error") {
              sandboxErrors = typeof event.error === "string"
                ? event.error.slice(0, 1000)
                : "Unknown runtime error"
              const devLog = typeof event.logs?.dev === "string"
                ? event.logs.dev.slice(0, 1000)
                : ""
              if (devLog) sandboxLogs = devLog
            } else if (event?.type === "quality_check") {
              if (event.status === "error") {
                postPreviewCheckFailed = true
                const label = typeof event.label === "string" ? event.label : "Application check"
                const command = typeof event.command === "string" ? event.command : ""
                const output = typeof event.output === "string" ? event.output : ""
                postPreviewCheckOutput = [
                  label,
                  command ? `Command: ${command}` : "",
                  output,
                ].filter(Boolean).join("\n").slice(0, 4000)
                sandboxErrors = postPreviewCheckOutput
              }
            } else if (event?.type === "log") {
              const chunk = typeof event.data === "string" ? event.data.trim() : ""
              if (chunk) sandboxLogs = (sandboxLogs + "\n" + chunk).slice(-2000)
            } else if (event?.type === "step" && typeof event.command === "string") {
              const command = event.command
              const commandOutput = typeof event.output === "string" ? event.output.slice(-2000) : undefined
              const stepName = typeof event.step === "string" ? event.step : "command"
              const status = event.status === "success" ? "complete" : event.status === "error" ? "error" : "running"

              await appendRunEvent({
                id: crypto.randomUUID(),
                title: status === "running" ? "Running command" : status === "error" ? "Command failed" : "Command completed",
                description: typeof event.message === "string" ? event.message : undefined,
                status,
                kind: "sandbox",
                createdAt: new Date().toISOString(),
                metadata: {
                  command,
                  commandOutput: commandOutput || null,
                  commandStep: stepName,
                },
              })
            }
          } catch {}
        }
      } catch (err) {
        console.error("Computer sandbox call failed:", err)
        sandboxErrors = err instanceof Error ? err.message : "Sandbox call failed"
      }

      if (sandboxSuccess && !postPreviewCheckFailed) {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Sandbox run successful",
          description: "Application started without runtime errors.",
          status: "complete",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })
      } else {
        const errorDescription = (
          postPreviewCheckOutput ||
          sandboxErrors ||
          sandboxLogs ||
          "Unknown runtime error"
        ).slice(0, 800)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: postPreviewCheckFailed ? "Application check failed" : "Sandbox error",
          description: errorDescription,
          status: "error",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })

        // — Runtime fix decision —
        let shouldFix = false

        try {
          const runtimeDecisionRes = await createComputerAgentMessage(anthropic, {
            temperature: 0,
            max_tokens: 120,
            system: `
Decide if generated application errors should be fixed.

Return ONLY JSON.

Format:
{
  "shouldFix": boolean,
  "reason": string
}
`,
            messages: [
              {
                role: "user",
                content: `Application error:\n${postPreviewCheckOutput || sandboxErrors || sandboxLogs}\n\nOriginal prompt:\n${prompt}`,
              },
            ],
          }, { enableMcp: false })

          const runtimeDecisionText = extractTextFromAnthropicContent(runtimeDecisionRes.content)
          const parsed = extractJson(runtimeDecisionText)
          shouldFix = Boolean(
            parsed &&
            typeof parsed.shouldFix === "boolean" &&
            parsed.shouldFix
          )
        } catch (err) {
          console.error("Computer runtime fix decision failed:", err)
          shouldFix = false
        }

        if (shouldFix && generatedFiles.length > 0) {
          const runtimeFixPrompt = `Fix the generated application in this codebase.

Error:
${postPreviewCheckOutput || sandboxErrors || sandboxLogs}

Rules:
- Fix only the root issue
- Resolve the failing runtime, lint, type, or build check
- Do NOT rewrite entire project
- Keep changes minimal`

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 90000)
            let runtimeFixRes: Response

            try {
              runtimeFixRes = await fetch(`${baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                },
                body: JSON.stringify({
                  prompt: runtimeFixPrompt,
                  model: builderModel,
                  existingFiles: generatedFiles,
                  creationMode: "build",
                }),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timeout)
            }

            const { files: runtimeFixedFiles } = await parseGenerateResponse(runtimeFixRes)

            if (runtimeFixedFiles.length > 0) {
              generatedFiles = runtimeFixedFiles
              await persistGeneratedFilesForSession(docRef, generatedFiles)
            }

            await appendRunEvent({
              id: crypto.randomUUID(),
              title: runtimeFixRes.ok ? "Runtime fix applied" : "Runtime fix failed",
              description: runtimeFixRes.ok
                ? runtimeFixedFiles.length
                  ? `${runtimeFixedFiles.length} files updated`
                  : "Fix applied with no file changes"
                : "Runtime fix attempt did not succeed.",
              status: runtimeFixRes.ok ? "complete" : "error",
              kind: "sandbox",
              createdAt: new Date().toISOString(),
            })
          } catch (err) {
            console.error("Computer runtime fix failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Runtime fix failed",
              description: err instanceof Error ? err.message : "Unable to apply runtime fix.",
              status: "error",
              kind: "sandbox",
              createdAt: new Date().toISOString(),
            })
          }
          // STOP — no further retries
        }
      }
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    await docRef.update({
      status: "complete",
      currentRunId: null,
      updatedAt: new Date(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed"
    const status = message === "RUN_ALREADY_IN_PROGRESS"
      ? 409
      : message.includes("Authorization")
      ? 401
      : 500

    if (activeDocRef && activeRunId && status !== 409) {
      try {
        await appendEvent(
          activeDocRef,
          {
            id: crypto.randomUUID(),
            title: "Run failed",
            description: message,
            status: "error",
            kind: "planning",
            createdAt: new Date().toISOString(),
          },
          activeRunId
        )
        await activeDocRef.update({
          status: "error",
          currentRunId: null,
          updatedAt: new Date(),
        })
      } catch {}
    }

    return NextResponse.json({ error: message }, { status })
  }
}
