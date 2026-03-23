import OpenAI from "openai"
import { AgentClient } from "@21st-sdk/node"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { DEFAULT_PLANS } from "@/lib/firebase"

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

type AgentStreamParseResult = {
  content: string
  streamedLength: number
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

export async function GET() {
  const nvidiaModels = await getNvidiaModels()
  return Response.json({
    defaultModel: DEFAULT_MODEL,
    models: [...Object.keys(OPENAI_MODEL_MAP), ...Object.keys(CLAUDE_MODEL_MAP), ...nvidiaModels],
  })
}

export async function POST(req: Request) {
  const body = await req.json() as {
    prompt: string
    model?: string
    idToken?: string
    existingFiles?: { path: string; content: string }[]
    creationMode?: "build" | "agent"
    agentSlug?: string
  }
  const {
    prompt,
    model = DEFAULT_MODEL,
    idToken,
    existingFiles,
    creationMode = "build",
    agentSlug,
  } = body

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

  // Check if token period has ended → reset monthly, then check remaining tokens
  try {
    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }
    const userData = userSnap.data() as any

    const planId = userData?.planId || 'free'
    const planTokensPerMonth = userData?.tokensLimit != null ? Number(userData.tokensLimit) : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth)

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
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: 'Insufficient tokens' }), { status: 402 })
    }
  } catch (e) {
    console.error('Token check failed', e)
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
  }

  const { client, selectedModel, provider } = await resolveModel(model)
  const isFollowUp = Array.isArray(existingFiles) && existingFiles.length > 0
  const shouldUse21stAgent = creationMode === "agent" && Boolean(agentSlug)
  const selectedClaudeModel = CLAUDE_MODEL_MAP[model]
  const shouldUse21stProvider = shouldUse21stAgent || Boolean(selectedClaudeModel)

  const systemPromptFollowUp = `You are an expert React developer. The user is asking for CHANGES or ADDITIONS to an existing project. You will receive the current project files.

UI STANDARD: When adding or changing UI, keep it modern and polished—distinctive typography, intentional colors, generous spacing, subtle motion (Framer Motion). Avoid generic "AI slop" aesthetics. Match or elevate the existing design language.

RESPONSIVE: Preserve or improve responsiveness on all devices. Use Tailwind breakpoints (sm:, md:, lg:) for layout and typography; avoid fixed widths that break on small screens; ensure touch targets are at least 44px on mobile; prevent horizontal overflow (max-w-full, min-w-0, overflow-hidden where needed). Generated UI must work on phone, tablet, and desktop.

DEPENDENCIES (CRITICAL):
- Before using ANY new import/package in your code, you MUST add it to package.json dependencies or devDependencies.
- If you use react-icons (e.g., import { FaStar } from 'react-icons/fa'), add "react-icons": "^5.0.0" to dependencies.
- If you use framer-motion, add "framer-motion": "^11.0.0" to dependencies.
- If you use lucide-react, add "lucide-react": "^0.400.0" to dependencies.
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

MODERN UI — BEAT THE COMPETITION (MANDATORY):
- Create UIs that look premium and modern, not generic. Avoid "AI slop": no default purple gradients on white, no Inter-only typography, no cookie-cutter layouts.
- Typography: Use distinctive, readable fonts. Prefer Google Fonts like DM Sans, Outfit, Plus Jakarta Sans, Syne, or similar for headings; pair with a clean body font. Strong hierarchy: clear heading sizes, line-height, and letter-spacing.
- Color: Choose an intentional palette (e.g. deep neutrals with one accent, or a bold brand color with contrast). Use semantic contrast (WCAG AA). Prefer custom palettes over default Tailwind grays alone.
- Layout: Generous whitespace, clear sections, and a clear visual hierarchy. Use grid/flex intentionally; avoid cramped or monotonous layouts. Consider asymmetry or bold hero sections where it fits.
- Motion: Add subtle, purposeful animations using framer motion (hover states, scroll-in, staggered reveals). Keep animations fast and smooth (200–400ms). No gratuitous motion.
- Polish: Rounded corners, subtle shadows, borders where they add clarity. Touch-friendly targets on mobile.
- Overall: The result should feel like a product from a top design team—memorable, cohesive, and professional.

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
- If you use an icon from react-icons (e.g., import { FaStar } from 'react-icons/fa'), you MUST include "react-icons": "^5.0.0" in dependencies.
- If you use Tailwind CSS, include tailwindcss, postcss, and autoprefixer in devDependencies.
- Do not reference any package in code unless it exists in package.json.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui is not a real package).

Ensure the dev server binds to 0.0.0.0 and uses a known port (prefer port 3000). If you use Vite, configure it accordingly.

Make the code production-ready with proper error handling, accessibility, and responsive design.
Create organized folder structures with components in /src/components, utilities in /src/lib, etc.

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply to the user, e.g. "I'll help you build Cookie Clicker - a mobile app where the user can press on a cookie and a score will increment. When incremented, the new score should be displayed for users on any device. I'll add animations when the cookie is pressed." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. Do not include any other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

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
  const userMessageContent = isFollowUp
    ? `The user wants these changes or additions to their existing project:\n\n${prompt}\n\nCurrent project files (only modify or add as needed; do not output unchanged files):\n${existingFiles.map((f: { path: string; content: string }) => `\n--- FILE: ${f.path} ---\n${f.content}\n--- END ${f.path} ---`).join("")}`
    : `Create a Vite + React + TypeScript application: ${prompt}`

  const encoder = new TextEncoder()
  let usageInfo: any = null
  let streamedLength = 0

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (shouldUse21stProvider) {
          try {
            const agentResult = await generateWith21stAgent({
              agentSlug: agentSlug || "my-agent",
              model: selectedClaudeModel,
              systemPrompt: finalSystemPrompt,
              userMessageContent,
            })
            streamedLength = agentResult.streamedLength
            controller.enqueue(encoder.encode(agentResult.content))
          } catch (agentError) {
            console.error("21st agent generation failed, falling back to default provider:", agentError)
            if (provider === "nvidia") {
              const validated = await generateWithNvidiaValidation({
                client,
                selectedModel,
                systemPrompt: finalSystemPrompt,
                userMessageContent,
                existingFiles,
              })
              usageInfo = validated.usageInfo
              streamedLength = validated.streamedLength
              if (validated.remainingIssues.length > 0) {
                console.warn("NVIDIA generation still has unresolved validation issues:", validated.remainingIssues)
                const salvaged = await salvageWithOpenAI({
                  systemPrompt: finalSystemPrompt,
                  userMessageContent,
                  brokenContent: validated.finalContent,
                  issues: validated.remainingIssues,
                })
                usageInfo = salvaged.usage || usageInfo
                streamedLength = salvaged.content.length
                controller.enqueue(encoder.encode(salvaged.content))
              } else {
                controller.enqueue(encoder.encode(validated.finalContent))
              }
            } else {
              const completion = await client.chat.completions.create({
                model: selectedModel,
                stream: true,
                messages: [
                  { role: "system", content: finalSystemPrompt },
                  { role: "user", content: userMessageContent },
                ],
                max_tokens: 8000,
                stream_options: { include_usage: true } as any,
              })

              for await (const chunk of completion) {
                if ((chunk as any).usage) usageInfo = (chunk as any).usage
                if ((chunk as any).choices && (chunk as any).choices[0]?.usage) {
                  usageInfo = (chunk as any).choices[0].usage
                }
                const content = chunk.choices[0]?.delta?.content
                if (content) {
                  streamedLength += content.length
                  controller.enqueue(encoder.encode(content))
                }
              }
            }
          }
        } else if (provider === "nvidia") {
          const validated = await generateWithNvidiaValidation({
            client,
            selectedModel,
            systemPrompt: finalSystemPrompt,
            userMessageContent,
            existingFiles,
          })
          usageInfo = validated.usageInfo
          streamedLength = validated.streamedLength
          if (validated.remainingIssues.length > 0) {
            console.warn("NVIDIA generation still has unresolved validation issues:", validated.remainingIssues)
            const salvaged = await salvageWithOpenAI({
              systemPrompt: finalSystemPrompt,
              userMessageContent,
              brokenContent: validated.finalContent,
              issues: validated.remainingIssues,
            })
            usageInfo = salvaged.usage || usageInfo
            streamedLength = salvaged.content.length
            controller.enqueue(encoder.encode(salvaged.content))
          } else {
            controller.enqueue(encoder.encode(validated.finalContent))
          }
        } else {
          const completion = await client.chat.completions.create({
            model: selectedModel,
            stream: true,
            messages: [
              { role: "system", content: finalSystemPrompt },
              { role: "user", content: userMessageContent },
            ],
            max_tokens: 8000,
            stream_options: { include_usage: true } as any,
          })

          for await (const chunk of completion) {
            if ((chunk as any).usage) {
              usageInfo = (chunk as any).usage
            }
            if ((chunk as any).choices && (chunk as any).choices[0]?.usage) {
              usageInfo = (chunk as any).choices[0].usage
            }

            const content = chunk.choices[0]?.delta?.content
            if (content) {
              streamedLength += content.length
              controller.enqueue(encoder.encode(content))
            }
          }
        }

        // Realistic token count: API usage when present, else ~4 chars per token (OpenAI-style)
        const promptLength = userMessageContent.length
        const completionLength = streamedLength
        const fallbackTokens = Math.ceil((promptLength + completionLength) / 4)
        const tokensToCharge = usageInfo
          ? (usageInfo.total_tokens ?? (usageInfo.prompt_tokens || 0) + (usageInfo.completion_tokens || 0))
          : (fallbackTokens > 0 ? fallbackTokens : 0)

        // when stream finishes, attempt to deduct tokens in a transaction
        try {
          if (tokensToCharge > 0) {
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
                if (actualCharge <= 0) return
                const currentUsed = data?.tokenUsage?.used || data?.tokensUsed || 0
                const newUsed = currentUsed + actualCharge
                const newRemaining = Math.max(0, remaining - actualCharge)
                console.log('Transaction - New tokens - Used:', newUsed, 'Remaining:', newRemaining)
                tx.update(userRef, {
                  'tokenUsage.used': newUsed,
                  'tokenUsage.remaining': newRemaining,
                })
              })
          }
        } catch (e) {
          console.error('Failed to charge tokens after generation:', e)
          // note: stream already delivered; cannot retract, but we surface server log
          // The generation already succeeded, so we log the error but don't crash
        }

        controller.close()
      } catch (err) {
        console.error('Stream error', err)
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
