import OpenAI from "openai"
import { AgentClient } from "@21st-sdk/node"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { DEFAULT_PLANS } from "@/lib/firebase"
import { buildkitAgents } from "@/lib/buildkit-agents"
import { getAgentRunLimitForPlan, resolveAgentUsageWindow } from "@/lib/agent-quotas"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
})
const anClient = process.env.API_KEY_21ST
  ? new AgentClient({ apiKey: process.env.API_KEY_21ST })
  : null

const DEFAULT_MODEL = "GPT-4-1 Mini"
const OPENAI_MODEL_MAP: Record<string, string> = {
  "o3-mini": "o3-mini",
  "GPT-4-1 Mini": "gpt-4.1-mini",
  "GPT-4-1": "gpt-4.1",
}
const CLAUDE_MODEL_MAP: Record<string, string> = {
  "Claude Sonnet 4.6": "claude-sonnet-4-6",
  "Claude Sonnet 4": "claude-sonnet-4",
  "Claude Opus 4": "claude-opus-4",
}

const CURATED_NVIDIA_MODELS = [
  "minimaxai/minimax-m2.1",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "deepseek-ai/deepseek-r1",
  "qwen/qwen2.5-coder-32b-instruct",
  "mistralai/mistral-small-3.1-24b-instruct",
  "google/gemma-3-27b-it",
]

const OPEN_SOURCE_MODEL_PATTERNS = [
  "meta/",
  "mistralai/",
  "deepseek-ai/",
  "qwen/",
  "google/gemma",
  "minimaxai/",
  "moonshotai/",
  "nvidia/",
]

let cachedNvidiaModels: { models: string[]; expiresAt: number } | null = null

type ParsedFileBlock = {
  path: string
  content: string
}

type ProjectFileInput = {
  path: string
  content: string
}

type AgentStreamParseResult = {
  content: string
  streamedLength: number
}

type Provider = "openai" | "nvidia"

type RuntimeSelection =
  | { runtime: "builder" }
  | { runtime: "agent"; agentSlug: string; agentModel?: string }

type StreamState = {
  usageInfo: any
  streamedLength: number
}

const FILE_SELECTION_LIMIT = 8
const FILE_CONTENT_SCAN_LIMIT = 1500
const PROMPT_KEYWORD_LIMIT = 12
const OPENAI_TIMEOUT_MS = 25000
const MAX_PROMPT_CHARS = 12000
const PROMPT_KEYWORD_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "build",
  "change",
  "create",
  "file",
  "for",
  "from",
  "in",
  "into",
  "make",
  "page",
  "project",
  "section",
  "site",
  "the",
  "this",
  "to",
  "update",
  "with",
])

function dedupeFilesByPath(files: ProjectFileInput[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    const path = typeof file.path === "string" ? file.path : ""
    if (!path || seen.has(path)) return false
    seen.add(path)
    return true
  })
}

function isCoreContextFile(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase()
  return (
    normalizedPath === "app.tsx" ||
    normalizedPath === "main.tsx" ||
    normalizedPath.endsWith("/app.tsx") ||
    normalizedPath.endsWith("/main.tsx")
  )
}

function extractPromptKeywords(prompt: string) {
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9/_.\-\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !PROMPT_KEYWORD_STOPWORDS.has(token))
    )
  ).slice(0, PROMPT_KEYWORD_LIMIT)
}

function scoreFileForPrompt(file: ProjectFileInput, keywords: string[]) {
  if (isCoreContextFile(file.path)) return Number.MAX_SAFE_INTEGER

  const normalizedPath = file.path.toLowerCase()
  const fileName = normalizedPath.split("/").pop() || normalizedPath
  const contentPreview = file.content.slice(0, FILE_CONTENT_SCAN_LIMIT).toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    if (fileName.includes(keyword)) score += 8
    else if (normalizedPath.includes(keyword)) score += 5
    if (contentPreview.includes(keyword)) score += 2
  }

  return score
}

function extractRelativeImports(content: string): string[] {
  const importRegex = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g
  const imports: string[] = []
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(content)) !== null) {
    const raw = match[1] || match[2]
    if (raw && raw.startsWith(".")) {
      imports.push(raw)
    }
  }

  return imports
}

function resolveImportPath(basePath: string, relativePath: string): string {
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : ""
  const combined = `${baseDir}/${relativePath}`

  const normalizedParts: string[] = []
  for (const part of combined.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      normalizedParts.pop()
      continue
    }
    normalizedParts.push(part)
  }

  return normalizedParts.join("/")
}

function collectDependencyFiles(
  files: ProjectFileInput[],
  seedFiles: ProjectFileInput[]
): ProjectFileInput[] {
  const fileMap = new Map(files.map((f) => [f.path, f]))
  const visited = new Set<string>()
  const result: ProjectFileInput[] = []

  const stack = [...seedFiles]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.path)) continue

    visited.add(current.path)
    result.push(current)

    const imports = extractRelativeImports(current.content)

    for (const imp of imports) {
      const resolved = resolveImportPath(current.path, imp)

      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}/index.tsx`,
        `${resolved}/index.ts`,
      ]

      for (const candidate of candidates) {
        const found = fileMap.get(candidate)
        if (found && !visited.has(found.path)) {
          stack.push(found)
        }
      }
    }
  }

  return result
}

function trimPromptFilesToBudget(
  prompt: string,
  files: ProjectFileInput[]
): ProjectFileInput[] {
  let totalLength = prompt.length
  const result: ProjectFileInput[] = []

  for (const file of files) {
    const fileLength = file.path.length + file.content.length + 50

    if (totalLength + fileLength > MAX_PROMPT_CHARS) break

    result.push(file)
    totalLength += fileLength
  }

  return result
}

function buildFollowUpUserMessage(
  prompt: string,
  files: ProjectFileInput[]
) {
  return `The user wants these changes or additions to their existing project:\n\n${prompt}\n\nCurrent project files (only modify or add as needed; do not output unchanged files):\n${files.map((f) => `\n--- FILE: ${f.path} ---\n${f.content}\n--- END ${f.path} ---`).join("")}`
}

function selectRelevantFiles(existingFiles: ProjectFileInput[], prompt: string) {
  const dedupedFiles = dedupeFilesByPath(existingFiles)
  if (dedupedFiles.length <= FILE_SELECTION_LIMIT) return dedupedFiles

  const keywords = extractPromptKeywords(prompt)
  const coreFiles = dedupedFiles.filter((file) => isCoreContextFile(file.path))
  const rankedNonCoreFiles = dedupedFiles
    .filter((file) => !isCoreContextFile(file.path))
    .map((file, index) => ({
      file,
      index,
      score: scoreFileForPrompt(file, keywords),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.file)

  const topKeywordFiles = rankedNonCoreFiles.slice(0, FILE_SELECTION_LIMIT)

  const dependencyExpanded = collectDependencyFiles(
    dedupedFiles,
    [...coreFiles, ...topKeywordFiles]
  )

  return dedupeFilesByPath(dependencyExpanded).slice(0, FILE_SELECTION_LIMIT * 2)
}

function parse21stUiMessageSSE(raw: string): AgentStreamParseResult {
  const lines = raw.split(/\r?\n/)
  let content = ""

  for (const line of lines) {
    if (!line.startsWith("data:")) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === "[DONE]") continue

    try {
      const event = JSON.parse(payload) as Record<string, unknown>
      const type = typeof event.type === "string" ? event.type : ""

      if (type === "text-delta" && typeof event.delta === "string") {
        content += event.delta
        continue
      }

      if (type === "text" && typeof event.text === "string") {
        content += event.text
        continue
      }

      if (type === "message-delta" && typeof event.delta === "string") {
        content += event.delta
        continue
      }

      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        content += event.delta
        continue
      }
    } catch {
      // ignore malformed non-JSON events
    }
  }

  return { content, streamedLength: content.length }
}

async function generateWith21stAgent(params: {
  agentSlug: string
  model?: string
  systemPrompt: string
  userMessageContent: string
}): Promise<AgentStreamParseResult> {
  if (!anClient) {
    throw new Error("21st agent API key is not configured")
  }

  const result = await anClient.threads.run({
    agent: params.agentSlug,
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: params.userMessageContent }],
      },
    ],
    options: {
      ...(params.model ? { model: params.model } : {}),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: params.systemPrompt,
      },
      maxTurns: 6,
    },
  })

  const raw = await result.response.text()
  const parsed = parse21stUiMessageSSE(raw)
  if (!parsed.content.trim()) {
    throw new Error("21st agent returned empty content")
  }
  return parsed
}

function isOpenSourceNvidiaModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase()
  return OPEN_SOURCE_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern))
}

async function getNvidiaModels(): Promise<string[]> {
  const now = Date.now()
  if (cachedNvidiaModels && cachedNvidiaModels.expiresAt > now) {
    return cachedNvidiaModels.models
  }

  const fallbackModels = [...CURATED_NVIDIA_MODELS].sort((a, b) => a.localeCompare(b))
  const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY
  if (!apiKey) {
    cachedNvidiaModels = { models: fallbackModels, expiresAt: now + 5 * 60 * 1000 }
    return fallbackModels
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(`NVIDIA models request failed with ${response.status}`)
    }

    const data = await response.json() as { data?: Array<{ id?: string }> }
    const discoveredModels = (data.data || [])
      .map((entry) => entry.id?.trim())
      .filter((id): id is string => Boolean(id && isOpenSourceNvidiaModel(id)))

    const mergedModels = Array.from(new Set([...CURATED_NVIDIA_MODELS, ...discoveredModels]))
      .sort((a, b) => a.localeCompare(b))

    cachedNvidiaModels = { models: mergedModels, expiresAt: now + 10 * 60 * 1000 }
    return mergedModels
  } catch (error) {
    console.error("Failed to load NVIDIA models:", error)
    cachedNvidiaModels = { models: fallbackModels, expiresAt: now + 5 * 60 * 1000 }
    return fallbackModels
  }
}

async function resolveModel(model: string) {
  if (OPENAI_MODEL_MAP[model]) {
    return {
      client: openai,
      selectedModel: OPENAI_MODEL_MAP[model],
      provider: "openai" as const,
    }
  }

  const nvidiaModels = await getNvidiaModels()
  if (nvidiaModels.includes(model)) {
    return {
      client: nvidia,
      selectedModel: model,
      provider: "nvidia" as const,
    }
  }

  return {
    client: openai,
    selectedModel: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    provider: "openai" as const,
  }
}

function resolveGenerationRuntime(params: {
  creationMode: "build" | "agent"
  agentSlug?: string
  model: string
}): RuntimeSelection {
  if (params.creationMode !== "agent") {
    return { runtime: "builder" }
  }

  const defaultAgentSlug: string = buildkitAgents[0]?.slug || "my-agent"
  const knownAgentSlugs: Set<string> = new Set(buildkitAgents.map((agent) => agent.slug as string))
  const candidateSlug = (params.agentSlug || "").trim()

  let resolvedSlug = defaultAgentSlug
  if (!candidateSlug) {
    console.warn("[generate] Agent runtime selected with missing agentSlug; defaulting to primary agent.", {
      defaultAgentSlug,
    })
  } else if (!knownAgentSlugs.has(candidateSlug)) {
    console.warn("[generate] Agent runtime selected with invalid agentSlug; defaulting to primary agent.", {
      requestedAgentSlug: candidateSlug,
      defaultAgentSlug,
    })
  } else {
    resolvedSlug = candidateSlug
  }

  return {
    runtime: "agent",
    agentSlug: resolvedSlug,
    agentModel: CLAUDE_MODEL_MAP[params.model],
  }
}

function getFirstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function getPeriodEndDate(raw: unknown): Date | null {
  if (!raw) return null
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate()
  }
  const d = new Date(raw as string | number)
  return isNaN(d.getTime()) ? null : d
}

function parseFileBlocks(content: string): ParsedFileBlock[] {
  const files: ParsedFileBlock[] = []
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()

    if (path) {
      files.push({ path, content: fileContent })
    }
  }

  return files
}

function validateGeneratedFiles(generatedContent: string, existingFiles?: { path: string; content: string }[]) {
  const fileBlocks = parseFileBlocks(generatedContent)
  const availablePaths = new Set([
    ...fileBlocks.map((file) => file.path),
    ...(existingFiles || []).map((file) => file.path),
    "src/main.tsx",
    "src/index.css",
    "src/App.tsx",
    "vite.config.ts",
    "package.json",
    "index.html",
  ])
  const issues = new Set<string>()

  for (const file of fileBlocks) {
    const isCodeFile = /\.(tsx|ts|jsx|js)$/.test(file.path)
    if (!isCodeFile) continue

    const importRegex = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(file.content)) !== null) {
      const rawImport = match[1] || match[2]
      if (!rawImport) continue

      const importerDir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""
      const normalizedBase = rawImport
        .replace(/^\.\//, importerDir ? `${importerDir}/` : "")
        .replace(/\.\.\//g, "")
      const candidatePaths = [
        normalizedBase,
        `${normalizedBase}.ts`,
        `${normalizedBase}.tsx`,
        `${normalizedBase}.js`,
        `${normalizedBase}.jsx`,
        `${normalizedBase}.css`,
        `${normalizedBase}/index.ts`,
        `${normalizedBase}/index.tsx`,
      ]

      const hasMatch = candidatePaths.some((candidate) => availablePaths.has(candidate))
      if (!hasMatch) {
        issues.add(`Missing import target "${rawImport}" referenced from ${file.path}`)
      }
    }

    const missingAssetMatches = file.content.match(/["'](?:\/|\.\/)[^"']+\.(svg|png|jpg|jpeg|webp|gif|ico)["']/g) || []
    for (const asset of missingAssetMatches) {
      const assetPath = asset.slice(1, -1)
      const normalizedAssetPath = assetPath.startsWith("/")
        ? `public${assetPath}`
        : `${file.path.slice(0, Math.max(file.path.lastIndexOf("/"), 0))}/${assetPath.replace(/^\.\//, "")}`
      if (!availablePaths.has(normalizedAssetPath) && !availablePaths.has(assetPath)) {
        issues.add(`Missing asset "${assetPath}" referenced from ${file.path}`)
      }
    }
  }

  return {
    fileBlocks,
    issues: Array.from(issues),
  }
}

async function generateWithNvidiaValidation(params: {
  client: OpenAI
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
}) {
  const initial = await params.client.chat.completions.create({
    model: params.selectedModel,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessageContent },
    ],
    max_tokens: 8000,
  })

  let finalContent = initial.choices[0]?.message?.content || ""
  let usageInfo: any = initial.usage || null
  let validation = validateGeneratedFiles(finalContent, params.existingFiles)

  if (validation.issues.length > 0) {
    const repairPrompt = `Your previous output had build-breaking issues. Repair the project and return the complete corrected response in the exact same streaming file format.

Detected issues:
${validation.issues.map((issue) => `- ${issue}`).join("\n")}

Rules:
- Keep the same app intent and design direction.
- Fix all missing imports, missing components, and missing assets.
- Do not explain the fixes.
- Return exactly one AGENT_MESSAGE and the corrected file blocks only.
- Do not wrap files in JSON or markdown.`

    const repaired = await params.client.chat.completions.create({
      model: params.selectedModel,
      messages: [
        { role: "system", content: `${params.systemPrompt}\n\nYou must repair invalid output when issues are reported.` },
        { role: "user", content: params.userMessageContent },
        { role: "assistant", content: finalContent },
        { role: "user", content: repairPrompt },
      ],
      max_tokens: 8000,
    })

    finalContent = repaired.choices[0]?.message?.content || finalContent
    usageInfo = repaired.usage || usageInfo
    validation = validateGeneratedFiles(finalContent, params.existingFiles)
  }

  return {
    finalContent,
    usageInfo,
    streamedLength: finalContent.length,
    remainingIssues: validation.issues,
  }
}

async function salvageWithOpenAI(params: {
  systemPrompt: string
  userMessageContent: string
  brokenContent: string
  issues: string[]
}) {
  const salvagePrompt = `Repair the broken project output below and return a fully corrected response in the exact required file streaming format.

Detected issues:
${params.issues.map((issue) => `- ${issue}`).join("\n")}

Broken output:
${params.brokenContent}

Rules:
- Keep the same product request and overall intent.
- Return exactly one AGENT_MESSAGE and then only ===FILE=== blocks.
- Ensure every import resolves and every referenced component exists.
- Do not leave placeholders or missing files.`

  const repaired = await openai.chat.completions.create({
    model: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    messages: [
      { role: "system", content: `${params.systemPrompt}\n\nYou are repairing an invalid project output into a buildable final result.` },
      { role: "user", content: params.userMessageContent },
      { role: "user", content: salvagePrompt },
    ],
    max_tokens: 8000,
  })

  return {
    content: repaired.choices[0]?.message?.content || params.brokenContent,
    usage: repaired.usage || null,
  }
}

async function streamWithResolvedProvider(params: {
  client: OpenAI
  provider: Provider
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  state: StreamState
}) {
  if (params.provider === "nvidia") {
    const validated = await generateWithNvidiaValidation({
      client: params.client,
      selectedModel: params.selectedModel,
      systemPrompt: params.systemPrompt,
      userMessageContent: params.userMessageContent,
      existingFiles: params.existingFiles,
    })
    params.state.usageInfo = validated.usageInfo
    params.state.streamedLength = validated.streamedLength
    if (validated.remainingIssues.length > 0) {
      console.warn("NVIDIA generation still has unresolved validation issues:", validated.remainingIssues)
      const salvaged = await salvageWithOpenAI({
        systemPrompt: params.systemPrompt,
        userMessageContent: params.userMessageContent,
        brokenContent: validated.finalContent,
        issues: validated.remainingIssues,
      })
      params.state.usageInfo = salvaged.usage || params.state.usageInfo
      params.state.streamedLength = salvaged.content.length
      params.controller.enqueue(params.encoder.encode(salvaged.content))
    } else {
      params.controller.enqueue(params.encoder.encode(validated.finalContent))
    }
    return
  }

  const createOpenAICompletion = async (userMessage: string) => {
    const controllerAbort = new AbortController()
    const timeoutId = setTimeout(() => {
      controllerAbort.abort()
    }, OPENAI_TIMEOUT_MS)

    try {
      const completion = await params.client.chat.completions.create({
        model: params.selectedModel,
        stream: true,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 8000,
        stream_options: { include_usage: true } as any,
      }, { signal: controllerAbort.signal })
      clearTimeout(timeoutId)
      return completion
    } catch (err: any) {
      clearTimeout(timeoutId)

      if (err?.name === "AbortError") {
        console.error("OpenAI request aborted due to timeout")
        throw new Error("MODEL_TIMEOUT")
      }

      throw err
    }
  }

  let completion
  let basePrompt = params.userMessageContent

  if (params.userMessageContent.includes("\n\nCurrent project files")) {
    basePrompt = params.userMessageContent.split("\n\nCurrent project files")[0]
  }

  try {
    completion = await createOpenAICompletion(params.userMessageContent)
  } catch (err: any) {
    if (err?.message === "MODEL_TIMEOUT" && params.existingFiles?.length) {
      const retrySeedFiles = selectRelevantFiles(params.existingFiles, params.userMessageContent)
      const reducedCount = Math.max(2, Math.ceil(retrySeedFiles.length / 2))
      const reducedFiles = trimPromptFilesToBudget(
        params.userMessageContent,
        retrySeedFiles.slice(0, reducedCount)
      )
      const retryUserMessage = buildFollowUpUserMessage(
        basePrompt,
        reducedFiles
      )
      completion = await createOpenAICompletion(retryUserMessage)
    } else {
      throw err
    }
  }

  for await (const chunk of completion) {
    if ((chunk as any).usage) params.state.usageInfo = (chunk as any).usage
    if ((chunk as any).choices && (chunk as any).choices[0]?.usage) {
      params.state.usageInfo = (chunk as any).choices[0].usage
    }
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      params.state.streamedLength += content.length
      params.controller.enqueue(params.encoder.encode(content))
    }
  }
}

async function runBuilderRuntime(params: {
  client: OpenAI
  provider: Provider
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  state: StreamState
}) {
  await streamWithResolvedProvider(params)
}

async function runAgentRuntime(params: {
  agentSlug: string
  agentModel?: string
  client: OpenAI
  provider: Provider
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  state: StreamState
}) {
  // TODO(agent-runtime): introduce explicit clarification and setup-checkpoint stages
  // once corresponding persisted state + UI wiring are in place.
  try {
    const agentResult = await generateWith21stAgent({
      agentSlug: params.agentSlug,
      model: params.agentModel,
      systemPrompt: params.systemPrompt,
      userMessageContent: params.userMessageContent,
    })
    params.state.streamedLength = agentResult.streamedLength
    params.controller.enqueue(params.encoder.encode(agentResult.content))
  } catch (agentError) {
    console.error("21st agent generation failed, falling back to default provider:", agentError)
    await streamWithResolvedProvider({
      client: params.client,
      provider: params.provider,
      selectedModel: params.selectedModel,
      systemPrompt: params.systemPrompt,
      userMessageContent: params.userMessageContent,
      existingFiles: params.existingFiles,
      controller: params.controller,
      encoder: params.encoder,
      state: params.state,
    })
  }
}

export async function GET() {
  const nvidiaModels = await getNvidiaModels()
  return Response.json({
    defaultModel: DEFAULT_MODEL,
    models: [...Object.keys(OPENAI_MODEL_MAP), ...Object.keys(CLAUDE_MODEL_MAP), ...nvidiaModels],
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    prompt: string
    model?: string
    idToken?: string
    existingFiles?: { path: string; content: string }[]
    creationMode?: "build" | "agent"
    agentSlug?: string
    cloneContext?: { title: string; description: string; markdown: string; sourceUrl: string }
  } | null
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const {
    prompt,
    model = DEFAULT_MODEL,
    idToken,
    existingFiles,
    creationMode = "build",
    agentSlug,
  } = body
  const runtimeSelection = resolveGenerationRuntime({
    creationMode,
    agentSlug,
    model,
  })

  // authenticate user via Firebase ID token (body) or Authorization Bearer token (header)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
  const authToken = (idToken && idToken.trim()) || bearerToken
  if (!authToken) {
    return new Response(JSON.stringify({ error: 'Missing idToken' }), { status: 401 })
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(authToken)
    uid = decoded.uid
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid idToken' }), { status: 401 })
  }

  let planIdForUsage = "free"
  // Check if token period has ended → reset monthly, then check remaining tokens
  try {
    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }
    const userData = userSnap.data() as any

    const planId = userData?.planId || 'free'
    planIdForUsage = planId
    const planTokensPerMonth = userData?.tokensLimit != null ? Number(userData.tokensLimit) : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth)
    const agentRunLimit = getAgentRunLimitForPlan(planId, userData?.agentRunLimit)

    const periodEnd = getPeriodEndDate(userData?.tokenUsage?.periodEnd)
    const now = new Date()
    const shouldReset = !periodEnd || isNaN(periodEnd.getTime()) || now >= periodEnd

    if (shouldReset) {
      const nextPeriodEnd = getFirstDayOfNextMonth(now)
      await userRef.update({
        tokenUsage: {
          used: 0,
          remaining: planTokensPerMonth,
          periodStart: Timestamp.fromDate(now),
          periodEnd: Timestamp.fromDate(nextPeriodEnd),
        },
        agentRunLimit,
        agentUsage: {
          used: 0,
          remaining: agentRunLimit,
          periodStart: Timestamp.fromDate(now),
          periodEnd: Timestamp.fromDate(nextPeriodEnd),
        },
      })
      console.log('Token period reset - User:', uid, 'Next periodEnd:', nextPeriodEnd.toISOString())
    }

    let remaining = shouldReset ? planTokensPerMonth : userData?.tokenUsage?.remaining

    if (remaining === undefined || remaining === null) {
      if (userData?.tokensLimit != null && userData?.tokensUsed !== undefined) {
        remaining = userData.tokensLimit - userData.tokensUsed
      } else {
        remaining = planTokensPerMonth
      }
    }
    remaining = Math.max(0, Number(remaining))

    console.log('Token check - User:', uid, 'Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Remaining:', remaining, 'TokenUsage:', userData?.tokenUsage)
    if (runtimeSelection.runtime !== "agent" && remaining <= 0) {
      return new Response(JSON.stringify({ error: 'Insufficient tokens' }), { status: 402 })
    }

    const fallbackPeriodEnd = shouldReset ? getFirstDayOfNextMonth(now) : (periodEnd || getFirstDayOfNextMonth(now))
    const agentUsageWindow = resolveAgentUsageWindow({
      rawUsage: shouldReset ? { used: 0, remaining: agentRunLimit, periodStart: now, periodEnd: fallbackPeriodEnd } : userData?.agentUsage,
      limit: agentRunLimit,
      fallbackPeriodStart: now,
      fallbackPeriodEnd,
    })
    if (runtimeSelection.runtime === "agent" && agentUsageWindow.remaining <= 0) {
      return new Response(
        JSON.stringify({
          error: "Agents limit reached",
          code: "AGENT_LIMIT_REACHED",
          fallbackMode: "build",
          agent: {
            remaining: 0,
            limit: agentRunLimit,
            planId,
            periodEnd: agentUsageWindow.periodEnd.toISOString(),
          },
        }),
        { status: 429 }
      )
    }
  } catch (e) {
    console.error('Token check failed', e)
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
  }

  const { client, selectedModel, provider } = await resolveModel(model)
  const isFollowUp = Array.isArray(existingFiles) && existingFiles.length > 0
  let promptFiles = isFollowUp ? selectRelevantFiles(existingFiles || [], prompt) : []

  if (isFollowUp) {
    promptFiles = trimPromptFilesToBudget(prompt, promptFiles)
  }

  const systemPromptFollowUp = `You are an expert React developer. The user is asking for CHANGES or ADDITIONS to an existing project. You will receive the current project files.

INTENT CLASSIFICATION (do this first, silently):
Classify the user request into one of:
- STYLE: color, font, spacing, animation, visual tweak → max 1-2 files
- CONTENT: text, copy, labels, images → max 1-2 files
- COMPONENT: add/remove/modify a single UI section → max 3 files
- FEATURE: new functionality, state, logic → touch only affected files
- PAGE: new route/page → only new files + App.tsx routing
- REFACTOR: restructure existing code → affected files only

SCOPE RULES based on classification:
- STYLE/CONTENT: return ONLY the single file containing that element. Never touch package.json, vite.config.ts, or unrelated components.
- COMPONENT: return only the component file + its direct parent if wiring is needed.
- FEATURE: return only files that need new imports, state, or logic. Do not rewrite files that only need 1-2 line changes — use diffs instead.
- PAGE/REFACTOR: still do not rewrite unchanged files.

HARD RULES:
- Never rewrite a file just to "clean it up"
- Never return package.json unless a new dependency is genuinely needed
- If a file needs fewer than 5 line changes, use unified diff format not full file
- If you are about to return more than 4 files for a STYLE or CONTENT request, stop and reconsider

PRODUCTION STANDARD (FOLLOW-UP):
- Maintain or elevate the existing design quality.
- Never downgrade visual polish when making changes.
- Match the domain aesthetic already established.
- Keep all existing content — only change what was asked.
- If adding new sections, they must match the visual language of existing sections exactly.
- Never introduce placeholder content in follow-up edits.

UI STANDARD: When adding or changing UI, keep it modern and polished—distinctive typography, intentional colors, generous spacing, subtle motion (Framer Motion). Avoid generic "AI slop" aesthetics. Match or elevate the existing design language.

RESPONSIVE: Preserve or improve responsiveness on all devices. Use Tailwind breakpoints (sm:, md:, lg:) for layout and typography; avoid fixed widths that break on small screens; ensure touch targets are at least 44px on mobile; prevent horizontal overflow (max-w-full, min-w-0, overflow-hidden where needed). Generated UI must work on phone, tablet, and desktop.

DEPENDENCIES (CRITICAL):
- Before using ANY new import/package in your code, you MUST add it to package.json dependencies or devDependencies.
- NEVER import from react-icons subpackages like react-icons/hi2, react-icons/hi, react-icons/md etc unless "react-icons" is already in package.json.
- If you use react-icons, add "react-icons": "^5.0.0" to package.json dependencies AND import only from react-icons/fa or react-icons/fa6 — these are the most stable subpackages.
- NEVER use HiOutlineMenu, HiOutlineBars3 or any Hi* icon — they are unreliable across versions.
- PREFER lucide-react for ALL icons. It is always available and has zero subpackage issues. Only use react-icons when lucide-react does not have what you need.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use framer-motion, add "framer-motion": "^11.0.0" to dependencies.
- Check the existing package.json first. Only add packages that are truly needed and don't already exist.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui).

CRITICAL: Do NOT regenerate the entire project. Output ONLY:
1. One AGENT_MESSAGE (see below).
2. For each file that you MODIFY: output that file in ===FILE: path=== ... ===END_FILE===. Inside the block you may use EITHER:
   - Unified diff format (so only the change is applied). You MUST include the --- and +++ file header lines first; never output only @@ hunk lines:
     --- a/path/to/file.tsx
     +++ b/path/to/file.tsx
     @@ -start,count +start,count @@
     -old line
     +new line
   - OR the COMPLETE new file content (full replacement).
3. For each NEW file (file that does not exist yet): output ===FILE: path=== complete file content ===END_FILE===.
Do NOT output any file that is unchanged. Do NOT output the full project; only changed or new files.

Use this exact streaming format for every file you output:
===FILE: path/to/file.tsx===
[unified diff OR full file content]
===END_FILE===

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply, e.g. "I'll add a dark mode toggle to the header." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. No other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data, output at the very end (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Only when the app would clearly benefit from a database or backend.`

  const systemPromptNew = `You are an expert React developer. Generate a complete, working Vite + React + TypeScript application based on the user's request.

PRODUCTION-GRADE OUTPUT (MANDATORY — NO EXCEPTIONS):
- You are building real websites for real businesses. Every output must be production-ready, not a demo.
- ZERO placeholder content. If you don't know the actual content, infer it intelligently from context. A bakery prompt means you write real bakery copy, real menu items, real opening hours format, real address format.
- ZERO generic AI layouts. No default hero-features-cta-footer cookie cutter. Design for the specific domain.
- Typography: always pair a display/heading font with a body font using Google Fonts @import. Build a real type scale.
- Colors: build a CSS custom property palette. Never default to Tailwind gray alone. Pick colors that match the domain.
- Every interactive element has a hover state, focus state, and transition.
- Framer Motion for entrance animations, stagger effects on lists, and scroll-triggered reveals.
- Components split logically — one responsibility per file.
- Mobile-first responsive, tested mentally at 320px/768px/1280px.
- Copy must sound human and domain-appropriate, not marketing slop. Write like the actual business owner would.
- Images: use picsum.photos or unsplash.it with relevant dimensions and descriptive seeds — never broken image paths.
- Real navigation with smooth scroll to sections.
- Footer with actual useful links, not empty nav items.

DOMAIN INTELLIGENCE (CRITICAL):
Before writing a single line of code, identify the domain and apply appropriate design language:
- Food/hospitality: warm colors, serif headings, appetite-triggering copy, menu/hours/location sections
- SaaS/Tech: clean density, data-forward, professional blues or neutrals, feature comparison tables, pricing tiers
- Creative/Agency: bold typography, asymmetric layouts, portfolio-style presentation
- Health/Wellness: calming palette, trust signals, clean minimal layout
- Finance/Legal: authoritative, trust-first, conservative palette, clear CTAs
- E-commerce: product-first, conversion-optimized, clear pricing, social proof prominent

RESPONSIVE — ALL DEVICES (MANDATORY):
- Every generated site MUST work on mobile, tablet, and desktop. No exceptions.
- index.html MUST include: <meta name="viewport" content="width=device-width, initial-scale=1" />.
- Use a mobile-first approach: base styles for small screens, then Tailwind breakpoints (sm:, md:, lg:, xl:) to enhance for larger screens.
- Avoid fixed pixel widths for main containers; use max-w-*, w-full, and flex/grid that adapts. Use min-w-0 and overflow-hidden where needed to prevent horizontal scroll.
- Buttons and interactive elements MUST be at least 44x44px on touch targets (e.g. min-h-[44px] min-w-[44px] or p-3) on mobile.
- Typography: use responsive text sizes (e.g. text-base sm:text-lg), and ensure line-length stays readable on narrow viewports.
- Test mentally for: 320px (phone), 768px (tablet), 1024px+ (desktop). The layout must not break or overflow at any width.

You must respond with a STREAMING file format. Output each file in this exact format:

===FILE: path/to/file.tsx===
[file content here]
===END_FILE===

Generate files in this order:
1. package.json - Dependencies first
2. vite.config.ts
3. index.html
4. src/main.tsx
5. src/App.tsx
6. src/index.css
7. src/components/*.tsx - Any necessary components
8. src/lib/*.ts - Utility functions if needed
9. tailwind.config.ts and postcss.config.js if Tailwind is used

Use these technologies:
- TypeScript
- Vite + React
- Tailwind CSS (only if requested or if it clearly improves the UI)
- Framer Motion for animations when appropriate

Dependencies requirements (MUST follow):
- package.json MUST include react and react-dom in dependencies.
- package.json MUST include vite and @vitejs/plugin-react in devDependencies.
- If TypeScript is used (it is), include typescript, @types/react, and @types/react-dom in devDependencies.
- CRITICAL: Before using ANY import in your code, you MUST add that package to package.json dependencies first.
- Common packages you might use:
  * react-icons (for icons like FaIcon, AiIcon, MdIcon, etc.)
  * framer-motion (for animations)
  * lucide-react (for icons)
  * clsx or classnames (for conditional classes)
  * date-fns (for date utilities)
- NEVER import from react-icons subpackages like react-icons/hi2, react-icons/hi, react-icons/md etc unless "react-icons" is already in package.json.
- If you use react-icons, add "react-icons": "^5.0.0" to package.json dependencies AND import only from react-icons/fa or react-icons/fa6 — these are the most stable subpackages.
- NEVER use HiOutlineMenu, HiOutlineBars3 or any Hi* icon — they are unreliable across versions.
- PREFER lucide-react for ALL icons. It is always available and has zero subpackage issues. Only use react-icons when lucide-react does not have what you need.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use Tailwind CSS, include tailwindcss, postcss, and autoprefixer in devDependencies.
- Do not reference any package in code unless it exists in package.json.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui is not a real package).

Ensure the dev server binds to 0.0.0.0 and uses a known port (prefer port 3000). If you use Vite, configure it accordingly.

Make the code production-ready with proper error handling, accessibility, and responsive design.
Create organized folder structures with components in /src/components, utilities in /src/lib, etc.

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply to the user, e.g. "I'll help you build Cookie Clicker - a mobile app where the user can press on a cookie and a score will increment. When incremented, the new score should be displayed for users on any device. I'll add animations when the cookie is pressed." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. Do not include any other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

QUALITY BAR: Before finalising output, ask yourself: "Would a real business owner pay a design agency for this?" If no — redesign it. The output must be distinctive, professional, and domain-appropriate. Never ship AI slop.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data (e.g. user accounts, login/signup, saving data, todos, forms that persist, dashboards with data, CRUD, API, auth), then at the very end of your response output exactly this line on its own line (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Do NOT output this for purely static sites, landing pages, or UI-only apps with no data persistence. Only when the app would clearly benefit from a database or backend.`

  const nvidiaReliabilityPrompt = `
OPEN-SOURCE MODEL RELIABILITY RULES (MANDATORY):
- Output a COMPLETE, internally consistent project update. Do not reference files, components, images, icons, fonts, or utilities that you do not also include or that do not already exist.
- Before finishing, mentally verify that every import path you reference exists with the exact same filename and casing.
- If App.tsx imports "./components/Footer", you MUST also output src/components/Footer.tsx unless it already exists in the provided files.
- Do not invent asset paths like /icon.svg, /icon-light-32x32.png, ./assets/foo.png, or font files unless you also create them.
- Prefer fewer files with complete implementations over many partially implemented files.
- Avoid placeholder imports, TODO stubs, and references to components you did not define.
- Keep the output buildable in Vite on the first run.
- Perform a final self-check before finishing:
  1. Every import resolves.
  2. Every component used is defined.
  3. Every asset referenced exists.
  4. package.json includes every dependency used.
  5. No file is omitted if another file depends on it.`

  const systemPrompt = isFollowUp ? systemPromptFollowUp : systemPromptNew
  const finalSystemPrompt = provider === "nvidia"
    ? `${systemPrompt}\n\n${nvidiaReliabilityPrompt}`
    : systemPrompt

  // Build user message: for follow-up include current files so the model can edit them
  const clonePrefix = body.cloneContext
    ? `REFERENCE SITE TO CLONE:\nURL: ${body.cloneContext.sourceUrl}\nTitle: ${body.cloneContext.title}\nDescription: ${body.cloneContext.description}\n\nSite content:\n${body.cloneContext.markdown}\n\nUse the above as the content and structural reference. Recreate it as a modern React app matching the layout, sections, copy, and visual hierarchy. Do not copy CSS — rebuild with Tailwind.\n\n`
    : ""

  const userMessageContent = isFollowUp
    ? buildFollowUpUserMessage(clonePrefix + prompt, promptFiles)
    : `Create a Vite + React + TypeScript application: ${clonePrefix}${prompt}`

  const encoder = new TextEncoder()
  const streamState: StreamState = {
    usageInfo: null,
    streamedLength: 0,
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (runtimeSelection.runtime === "agent") {
          await runAgentRuntime({
            agentSlug: runtimeSelection.agentSlug,
            agentModel: runtimeSelection.agentModel,
            client,
            provider,
            selectedModel,
            systemPrompt: finalSystemPrompt,
            userMessageContent,
            existingFiles,
            controller,
            encoder,
            state: streamState,
          })
        } else {
          await runBuilderRuntime({
            client,
            provider,
            selectedModel,
            systemPrompt: finalSystemPrompt,
            userMessageContent,
            existingFiles,
            controller,
            encoder,
            state: streamState,
          })
        }

        // Realistic token count: API usage when present, else ~4 chars per token (OpenAI-style)
        const promptLength = userMessageContent.length
        const completionLength = streamState.streamedLength
        const fallbackTokens = Math.ceil((promptLength + completionLength) / 4)
        const tokensToCharge = streamState.usageInfo
          ? (streamState.usageInfo.total_tokens ?? (streamState.usageInfo.prompt_tokens || 0) + (streamState.usageInfo.completion_tokens || 0))
          : (fallbackTokens > 0 ? fallbackTokens : 0)

        // when stream finishes, attempt to deduct tokens in a transaction
        try {
          if ((runtimeSelection.runtime !== "agent" && tokensToCharge > 0) || runtimeSelection.runtime === "agent") {
              const userRef = adminDb.collection('users').doc(uid)
              await adminDb.runTransaction(async (tx) => {
                const snap = await tx.get(userRef)
                if (!snap.exists) throw new Error('user-not-found')
                const data = snap.data() as any
                
                // Get user's plan token limit
                const planId = data?.planId || 'free'
                const planTokensPerMonth = data?.tokensLimit != null ? Number(data.tokensLimit) : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth)
                
                let remaining = data?.tokenUsage?.remaining
                
                // Migration: if tokenUsage doesn't exist but tokensLimit/tokensUsed does, use those
                if (remaining === undefined || remaining === null) {
                  if (data?.tokensLimit && data?.tokensUsed !== undefined) {
                    remaining = data.tokensLimit - data.tokensUsed
                  } else {
                    remaining = planTokensPerMonth
                  }
                }
                // Never use negative remaining (robust against bad data)
                remaining = Math.max(0, Number(remaining))
                
                console.log('Transaction - User Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Charging tokens:', tokensToCharge, 'Remaining before:', remaining)
                
                // Always deduct available credits for a completed generation.
                // If actual usage is higher than remaining, consume remaining and clamp to 0.
                if (tokensToCharge > planTokensPerMonth) {
                  console.warn(`Generation used ${tokensToCharge} tokens while ${planId} plan monthly allowance is ${planTokensPerMonth}.`)
                }
                if (remaining < tokensToCharge) {
                  console.warn(`User ${uid} has ${remaining} tokens but generation used ${tokensToCharge}; consuming remaining balance.`)
                }
                const actualCharge = Math.min(tokensToCharge, remaining)
                const currentUsed = data?.tokenUsage?.used || data?.tokensUsed || 0
                const newUsed = currentUsed + Math.max(0, actualCharge)
                const newRemaining = Math.max(0, remaining - Math.max(0, actualCharge))
                console.log('Transaction - New tokens - Used:', newUsed, 'Remaining:', newRemaining)
                const updatePayload: Record<string, unknown> = {}
                if (runtimeSelection.runtime !== "agent" && tokensToCharge > 0) {
                  updatePayload['tokenUsage.used'] = newUsed
                  updatePayload['tokenUsage.remaining'] = newRemaining
                }
                if (runtimeSelection.runtime === "agent") {
                  const agentRunLimit = getAgentRunLimitForPlan(planIdForUsage, data?.agentRunLimit)
                  const currentAgentUsed = Math.max(0, Number(data?.agentUsage?.used ?? 0))
                  const currentAgentRemaining = Math.max(0, Number(data?.agentUsage?.remaining ?? agentRunLimit))
                  updatePayload["agentRunLimit"] = agentRunLimit
                  updatePayload["agentUsage.used"] = currentAgentUsed + 1
                  updatePayload["agentUsage.remaining"] = Math.max(0, currentAgentRemaining - 1)
                }
                tx.update(userRef, updatePayload)
              })
          }
        } catch (e) {
          console.error('Failed to charge tokens after generation:', e)
          // note: stream already delivered; cannot retract, but we surface server log
          // The generation already succeeded, so we log the error but don't crash
        }

        controller.close()
      } catch (err: any) {
        console.error('Stream error', err)

        if (err?.message === "MODEL_TIMEOUT") {
          controller.enqueue(
            encoder.encode(
              "===AGENT_MESSAGE=== The request took too long. Try simplifying your request or retrying. ===END_AGENT_MESSAGE==="
            )
          )
          controller.close()
          return
        }

        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
