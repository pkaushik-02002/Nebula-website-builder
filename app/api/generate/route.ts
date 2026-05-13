import OpenAI from "openai"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { DEFAULT_PLANS } from "@/lib/firebase"
import { normalizeGeneratedCodeFiles } from "@/lib/generated-code-normalization"
import { chargeTokensForGeneration } from "@/lib/charge-tokens"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
})

const DEFAULT_MODEL = "GPT-5.5"
const OPENAI_MODEL_MAP: Record<string, string> = {
  "o3-mini": "o3-mini",
  "GPT-5.5 Pro": "gpt-5.5-pro",
  "GPT-5.5": "gpt-5.5",
  "GPT-5.4 Pro": "gpt-5.4-pro",
  "GPT-5.4": "gpt-5.4",
  "GPT-5.4 Mini": "gpt-5.4-mini",
  "GPT-5.4 Nano": "gpt-5.4-nano",
  "GPT-5 Mini": "gpt-5-mini",
  "GPT-5 Nano": "gpt-5-nano",
  "GPT-4-1 Mini": "gpt-4.1-mini",
  "GPT-4-1": "gpt-4.1",
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

type Provider = "openai" | "nvidia"

type StreamState = {
  usageInfo: any
  streamedLength: number
  closed: boolean
}

const FILE_SELECTION_LIMIT = 8
const FILE_CONTENT_SCAN_LIMIT = 1500
const PROMPT_KEYWORD_LIMIT = 12
const OPENAI_TIMEOUT_MS = 90000
const MAX_PROMPT_CHARS = 12000
const CODE_GENERATION_OUTPUT_RULES = `You are a world-class frontend engineer and visual designer building real production websites.

CRITICAL OUTPUT RULES:
- You MUST output ONLY file blocks.
- Each file MUST be in this format:

===FILE: path===
file content
===END_FILE===

- DO NOT output explanations, markdown, JSON, or any text outside file blocks.
- If you do not follow this format, the output will be rejected.

INTELLIGENT EDITING MODE:
- If current project files are provided, analyze the user request.
- FOR TARGETED EDITS: Only output files that change. Unchanged files must NOT appear.
- FOR FULL BUILDS: Output every required file below.

REQUIRED FILES (new projects only):
- index.html (must include viewport meta + Google Fonts link tag)
- package.json
- tailwind.config.ts
- postcss.config.js
- src/App.tsx
- src/main.tsx (must import './index.css' at top)
- src/index.css (must start with @tailwind base/components/utilities)

COMPLETENESS CHECK: Every imported file must exist in the output. If App.tsx imports "./components/Hero", output src/components/Hero.tsx. Scan all imports before finishing.

TECH STACK:
- Vite + React + TypeScript + Tailwind CSS.
- No external UI kits.
- All dependencies in package.json.
- Architecture: Vite project with components under src/. Never a single HTML/CSS/JS file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN IDENTITY — do this before writing any code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every website must feel handcrafted for its specific domain. Before writing a single component, decide:
1. Visual personality: editorial, bold typographic, refined minimal, warm artisanal, sleek tech, dramatic, playful
2. Color system: one brand color + one accent + specific background tone (not plain white or plain black)
3. Typography pair: display font for headings + body font for reading
4. One standout layout decision that makes this site memorable

TYPOGRAPHY — mandatory Google Fonts:
- NEVER use system-ui, Inter alone, or Roboto alone as the primary font.
- Load Google Fonts via @import in src/index.css.
- Choose a display + body pair suited to the domain:
  • Luxury / hospitality / food: Cormorant Garamond + DM Sans
  • Bold / agency / creative: Syne + Inter OR Bebas Neue + Work Sans
  • Refined SaaS / tech: Plus Jakarta Sans + Inter
  • Health / wellness / calm: Fraunces + Nunito
  • Editorial / news / content: Playfair Display + Source Serif 4
  • E-commerce / consumer: Outfit + Manrope
  • Finance / legal / trust: Libre Baskerville + Source Sans 3
  • Restaurant / café: Marcellus + Lato
- Apply the display font to h1–h3. Apply body font to p, nav, buttons.
- Set font-family on :root or body in index.css, not only Tailwind classes.

COLOR SYSTEM:
- Define in :root CSS custom properties: --color-brand, --color-accent, --color-bg, --color-surface, --color-text.
- Background must have character:
  • Warm cream: #faf7f2 or #f5f0e8
  • Cool off-white: #f8f9fa or #f4f4f0
  • Deep charcoal: #0d0d0d or #111110
  • Rich dark: #1a1917 or #18181b
  • Soft sage: #f2f4f0
  • Slate: #0f172a
- Plain #ffffff or #000000 is only acceptable for ultra-minimal tech brands.
- One brand accent used sparingly (buttons, highlights, hover states).
- BANNED by default: purple/violet/indigo gradient heroes, neon glow, rainbow gradients. Use only if user explicitly requests.

LAYOUT AND SECTIONS:
- Content max-width: 1200px (max-w-screen-xl or max-w-[1200px]), centered, with px-6 md:px-12.
- Vertical rhythm: generous. Major sections 80–128px vertical padding. Do NOT enforce py-20 on everything.
- Section backgrounds should alternate to create visual flow: primary bg → surface/tinted → primary bg.
- Layout must be chosen for the domain, NOT the generic SaaS template:

  RESTAURANT / CAFÉ / FOOD:
  • Full-bleed hero image with overlay text, reservation CTA prominent
  • Menu highlights with real dish names and prices
  • Atmosphere/story section (chef, philosophy, sourcing)
  • Gallery or food imagery grid
  • Hours, location, booking

  AGENCY / PORTFOLIO / CREATIVE:
  • Bold typographic hero with one strong statement
  • Work samples / case studies (not "Features")
  • Process or approach section
  • Team with real names and roles
  • Contact with actual form

  SAAS / TECH / PRODUCT:
  • Hero with product screenshot or demo (not decorative code card)
  • 2–3 key differentiators (not 6 generic icons)
  • Social proof: logos or 2 real quotes
  • Pricing with 3 tiers, middle highlighted
  • Footer with links

  E-COMMERCE / RETAIL:
  • Product-forward hero
  • Category or collection grid
  • Featured products with real names and prices
  • Trust signals (reviews, shipping, returns)
  • Newsletter with incentive

  HEALTH / WELLNESS / SERVICE:
  • Calm, trust-building hero
  • Philosophy or differentiator
  • Services with real descriptions
  • Testimonials (specific, personal, believable)
  • Booking or contact with friction removed

  PERSONAL / PORTFOLIO:
  • Distinctive opening — who you are in one sentence
  • Work samples with context
  • Skills / tools used
  • Writing or thoughts section if applicable
  • Direct contact

COPY — non-negotiable:
- ZERO lorem ipsum. ZERO "Your headline here". ZERO "Lorem description".
- ALL copy must be domain-specific, realistic, and written for a real audience.
- Headlines: strong, specific, opinionated. "London's most obsessive sourdough" beats "Welcome to our bakery".
- CTAs: action-specific. "Reserve a table" not "Contact us". "See our work" not "Learn more".
- Supporting copy: concrete benefits or details, not abstract promises.

VISUAL ATMOSPHERE:
- Every design needs atmosphere. Use at least one of:
  • Subtle CSS grain/noise texture on the background (SVG filter or radial-gradient noise)
  • Gradient mesh in the hero (multiple radial gradients, soft and blurred)
  • Alternating section tints (bg slightly off primary alternates)
  • Full-bleed photography sections with proper overlay
  • Geometric pattern via repeating CSS gradient or SVG
- Do not ship flat-color sections edge to edge with no visual interest.

IMAGES:
- For food, products, people, places, architecture: use real Unsplash photo URLs.
- Format: https://images.unsplash.com/photo-[ID]?w=1200&q=80&auto=format&fit=crop
- Choose IDs that genuinely match the content type. No clearly wrong stock photos.
- Every img tag must have a working URL. No broken placeholders.
- Alt text must be descriptive.

COMPONENTS:
- Clean semantic React. No unused imports. Prefer named exports.
- Navigation: sticky or fixed, collapses to hamburger on mobile.
- Cards: style varies by domain. Not always "rounded-xl border border-zinc-200 p-6 bg-white".
- Buttons: styled to match the brand identity, not one universal class.
- Icons: lucide-react only when they add meaning. Include in package.json.

ANIMATION:
- Framer Motion for: hero entrance, section fade-in on viewport entry (useInView), card stagger.
- Feels intentional, adds perceived quality. Duration 0.4–0.7s, ease-out.
- No bounce, spin, or flashy effects.

RESPONSIVE:
- Works perfectly at 320px, 768px, 1280px.
- index.html must have viewport meta tag.
- Navigation must work on mobile. Touch targets ≥ 44px.

SELF-CHECK BEFORE OUTPUT:
1. Does this look like it was made by a top design agency, or a generic AI template? If generic, find the weakest element and fix it.
2. Is every section earning its place? Remove anything that could be from any other website.
3. Is the typography creating real hierarchy and brand character?
4. Is all copy written for this specific domain with real details?
5. Are images real, relevant, and working?
6. Is the color system coherent and atmospheric?
7. Does the layout suit the domain or is it the default SaaS hero + 3-feature grid?`
const STRICT_FILE_FORMAT_RETRY_PROMPT = `Your previous response did not follow the required file format.

You MUST output ONLY file blocks using:

===FILE: path===
content
===END_FILE===

Do not include anything else.`
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
  const fileRegex = /===FILE:\s*(.*?)===([\s\S]*?)===END_FILE===/g
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

function serializeFileBlocks(files: ParsedFileBlock[]) {
  return files.map((file) => `===FILE: ${file.path}===\n${file.content}\n===END_FILE===`).join("\n")
}


function assertValidFileBlockOutput(content: string) {
  if (!content.includes("===FILE:")) {
    throw new Error("Invalid generator output: no file blocks")
  }

  const fileBlocks = parseFileBlocks(content)
  if (fileBlocks.length === 0) {
    throw new Error("Invalid generator output: no parseable file blocks")
  }

  return fileBlocks
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

  // Check for mandatory CSS files
  const hasIndexCss = fileBlocks.some(f => f.path === "src/index.css")
  const hasTailwindConfig = fileBlocks.some(f => f.path === "tailwind.config.ts")
  const hasPostcssConfig = fileBlocks.some(f => f.path === "postcss.config.js")
  
  if (!hasIndexCss) {
    issues.add("Missing mandatory file: src/index.css (required for CSS styling)")
  }
  if (!hasTailwindConfig) {
    issues.add("Missing mandatory file: tailwind.config.ts (required for Tailwind compilation)")
  }
  if (!hasPostcssConfig) {
    issues.add("Missing mandatory file: postcss.config.js (required for PostCSS processing)")
  }

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

function injectMissingCssFiles(fileBlocks: ParsedFileBlock[]): ParsedFileBlock[] {
  const paths = new Set(fileBlocks.map(f => f.path))
  const injected = [...fileBlocks]

  // Inject missing tailwind.config.ts
  if (!paths.has("tailwind.config.ts")) {
    injected.push({
      path: "tailwind.config.ts",
      content: `import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 2px)",
        md: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config`
    })
  }

  // Inject missing postcss.config.js
  if (!paths.has("postcss.config.js")) {
    injected.push({
      path: "postcss.config.js",
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    })
  }

  const TAILWIND_DIRECTIVES = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
  const DEFAULT_INDEX_CSS = `${TAILWIND_DIRECTIVES}
:root {
  --radius: 12px;
  --radius-lg: 16px;
  --container: 72rem;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}`

  // Inject missing src/index.css, or prepend @tailwind directives if they're absent
  const indexCssIdx = injected.findIndex(f => f.path === "src/index.css")
  if (indexCssIdx === -1) {
    injected.push({ path: "src/index.css", content: DEFAULT_INDEX_CSS })
  } else if (!injected[indexCssIdx].content.includes("@tailwind")) {
    injected[indexCssIdx] = {
      ...injected[indexCssIdx],
      content: `${TAILWIND_DIRECTIVES}\n${injected[indexCssIdx].content}`,
    }
  }

  // Ensure src/main.tsx imports index.css
  const mainTsxIndex = injected.findIndex(f => f.path === "src/main.tsx")
  if (mainTsxIndex !== -1 && !injected[mainTsxIndex].content.includes("index.css")) {
    const lines = injected[mainTsxIndex].content.split('\n')
    let insertIdx = 0
    for (let i = 0; i < lines.length; i++) {
      if (/import\s+.*react/i.test(lines[i])) insertIdx = i + 1
    }
    lines.splice(insertIdx, 0, "import './index.css'")
    injected[mainTsxIndex] = { ...injected[mainTsxIndex], content: lines.join('\n') }
  }

  return injected
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
  try {
    assertValidFileBlockOutput(finalContent)
  } catch {
    const retried = await params.client.chat.completions.create({
      model: params.selectedModel,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userMessageContent },
        { role: "assistant", content: finalContent },
        { role: "user", content: STRICT_FILE_FORMAT_RETRY_PROMPT },
      ],
      max_tokens: 8000,
    })

    finalContent = retried.choices[0]?.message?.content || ""
    usageInfo = retried.usage || usageInfo
    assertValidFileBlockOutput(finalContent)
  }

  let validation = validateGeneratedFiles(finalContent, params.existingFiles)

  if (validation.issues.length > 0) {
    const repairPrompt = `Your previous output had build-breaking issues. Repair the project and return the complete corrected response in the exact same streaming file format.

Detected issues:
${validation.issues.map((issue) => `- ${issue}`).join("\n")}

Rules:
- Keep the same app intent and design direction.
- CRITICAL: Ensure src/index.css, tailwind.config.ts, and postcss.config.js are included and properly configured.
- Ensure src/main.tsx imports './index.css' at the top.
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

  // Inject missing CSS files as fallback
  let finalFileBlocks = validation.fileBlocks
  if (!finalFileBlocks.some(f => f.path === "tailwind.config.ts") ||
      !finalFileBlocks.some(f => f.path === "postcss.config.js") ||
      !finalFileBlocks.some(f => f.path === "src/index.css")) {
    finalFileBlocks = injectMissingCssFiles(finalFileBlocks)
    // Reconstruct content from injected blocks
    finalContent = serializeFileBlocks(finalFileBlocks)
  }

  finalFileBlocks = normalizeGeneratedCodeFiles(finalFileBlocks)
  finalContent = serializeFileBlocks(finalFileBlocks)

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
- CRITICAL: Ensure src/index.css, tailwind.config.ts, and postcss.config.js are included and properly configured.
- Ensure src/main.tsx imports './index.css' at the top.
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

  let content = repaired.choices[0]?.message?.content || params.brokenContent
  
  // Inject missing CSS files if needed
  const fileBlocks = parseFileBlocks(content)
  if (!fileBlocks.some(f => f.path === "tailwind.config.ts") ||
      !fileBlocks.some(f => f.path === "postcss.config.js") ||
      !fileBlocks.some(f => f.path === "src/index.css")) {
    const injectedBlocks = injectMissingCssFiles(fileBlocks)
    content = injectedBlocks.map(f => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`).join('\n')
  }

  return {
    content,
    usage: repaired.usage || null,
  }
}

async function repairInvalidFileFormatWithOpenAI(params: {
  systemPrompt: string
  userMessageContent: string
  brokenContent: string
}) {
  const repaired = await openai.chat.completions.create({
    model: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessageContent },
      { role: "assistant", content: params.brokenContent },
      { role: "user", content: STRICT_FILE_FORMAT_RETRY_PROMPT },
    ],
    max_tokens: 8000,
  })

  const content = repaired.choices[0]?.message?.content || ""
  assertValidFileBlockOutput(content)

  return {
    content,
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
    try {
      assertValidFileBlockOutput(validated.finalContent)
    } catch {
      const repaired = await repairInvalidFileFormatWithOpenAI({
        systemPrompt: params.systemPrompt,
        userMessageContent: params.userMessageContent,
        brokenContent: validated.finalContent,
      })
      params.state.usageInfo = repaired.usage || params.state.usageInfo
      params.state.streamedLength = repaired.content.length
      params.controller.enqueue(params.encoder.encode(repaired.content))
      return
    }

    if (validated.remainingIssues.length > 0) {
      console.warn("NVIDIA generation still has unresolved validation issues:", validated.remainingIssues)
      const salvaged = await salvageWithOpenAI({
        systemPrompt: params.systemPrompt,
        userMessageContent: params.userMessageContent,
        brokenContent: validated.finalContent,
        issues: validated.remainingIssues,
      })
      assertValidFileBlockOutput(salvaged.content)
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

  const streamTokens = async (completion: Awaited<ReturnType<typeof createOpenAICompletion>>) => {
    let buffered = ""
    for await (const chunk of completion) {
      if ((chunk as any).usage) params.state.usageInfo = (chunk as any).usage
      const content = chunk.choices?.[0]?.delta?.content
      if (!content) continue
      buffered += content
      if (!params.state.closed) {
        try { params.controller.enqueue(params.encoder.encode(content)) }
        catch { params.state.closed = true }
      }
    }
    return buffered
  }

  let basePrompt = params.userMessageContent
  if (params.userMessageContent.includes("\n\nCurrent project files")) {
    basePrompt = params.userMessageContent.split("\n\nCurrent project files")[0]
  }

  let completion
  try {
    completion = await createOpenAICompletion(params.userMessageContent)
  } catch (err: any) {
    if (err?.message === "MODEL_TIMEOUT" && params.existingFiles?.length) {
      const retrySeedFiles = selectRelevantFiles(params.existingFiles, params.userMessageContent)
      const reducedFiles = trimPromptFilesToBudget(
        params.userMessageContent,
        retrySeedFiles.slice(0, Math.max(2, Math.ceil(retrySeedFiles.length / 2)))
      )
      completion = await createOpenAICompletion(buildFollowUpUserMessage(basePrompt, reducedFiles))
    } else {
      throw err
    }
  }

  const output = await streamTokens(completion)
  params.state.streamedLength += output.length

  // Append any missing CSS infrastructure as extra file blocks at the end of the stream.
  // parseGenerateResponse in the computer agent buffers the full stream, so these are included.
  const parsedBlocks = parseFileBlocks(output)
  const allKnownPaths = new Set([
    ...parsedBlocks.map(f => f.path),
    ...(params.existingFiles?.map(f => f.path) || [])
  ])
  const needsCssFix =
    !allKnownPaths.has("tailwind.config.ts") ||
    !allKnownPaths.has("postcss.config.js") ||
    !allKnownPaths.has("src/index.css") ||
    (parsedBlocks.some(f => f.path === "src/index.css") && !parsedBlocks.find(f => f.path === "src/index.css")?.content.includes("@tailwind")) ||
    (parsedBlocks.some(f => f.path === "src/main.tsx") && !parsedBlocks.find(f => f.path === "src/main.tsx")?.content.includes("index.css"))

  if (needsCssFix) {
    const fixedBlocks = injectMissingCssFiles(parsedBlocks)
    const newFiles = fixedBlocks.filter(b => !parsedBlocks.find(p => p.path === b.path))
    if (newFiles.length && !params.state.closed) {
      try { params.controller.enqueue(params.encoder.encode(serializeFileBlocks(normalizeGeneratedCodeFiles(newFiles)))) }
      catch { params.state.closed = true }
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

export async function GET() {
  const nvidiaModels = await getNvidiaModels()
  return Response.json({
    defaultModel: DEFAULT_MODEL,
    models: [...Object.keys(OPENAI_MODEL_MAP), ...nvidiaModels],
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    prompt: string
    model?: string
    idToken?: string
    existingFiles?: { path: string; content: string }[]
    intent?: string
    inspirationContext?: { title: string; description: string; markdown: string; sourceUrl: string }
  } | null
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const {
    prompt,
    model = DEFAULT_MODEL,
    idToken,
    existingFiles,
    intent,
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
- Preserve the existing project architecture and file structure. Do NOT convert an existing React/Vite project into standalone HTML/CSS/JS.
- Never say you are building "a single-page HTML/CSS/JS file" in the agent message. Describe the actual targeted React/Vite change.

UI STANDARD: When adding or changing UI, keep it modern and polished—distinctive typography, intentional colors, generous spacing, subtle motion (Framer Motion). Avoid generic "AI slop" aesthetics. Match or elevate the existing design language.

RESPONSIVE: Preserve or improve responsiveness on all devices. Use Tailwind breakpoints (sm:, md:, lg:) for layout and typography; avoid fixed widths that break on small screens; ensure touch targets are at least 44px on mobile; prevent horizontal overflow (max-w-full, min-w-0, overflow-hidden where needed). Generated UI must work on phone, tablet, and desktop.

DEPENDENCIES (CRITICAL):
- Before using ANY new import/package in your code, you MUST add it to package.json dependencies or devDependencies.
- NEVER import from react-icons subpackages like react-icons/hi2, react-icons/hi, react-icons/md etc unless "react-icons" is already in package.json.
- If you use react-icons, add "react-icons": "^5.0.0" to package.json dependencies AND import only from react-icons/fa or react-icons/fa6 — these are the most stable subpackages.
- NEVER use HiOutlineMenu, HiOutlineBars3 or any Hi* icon — they are unreliable across versions.
- PREFER lucide-react for ALL icons. It is always available and has zero subpackage issues. Only use react-icons when lucide-react does not have what you need.
- NEVER hallucinate lucide-react icon names. 'RocketLaunch' does not exist, use 'Rocket'. Use exact lucide casing: 'Github' not 'GitHub', 'Linkedin' not 'LinkedIn', 'Youtube' not 'YouTube'.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use framer-motion, add "framer-motion": "^11.0.0" to dependencies.
- Check the existing package.json first. Only add packages that are truly needed and don't already exist.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui).
- For the favicon in index.html, ALWAYS use an inline SVG: <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>"> to prevent 404 errors.

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
The AGENT_MESSAGE must accurately reflect the architecture. Never claim you will create a standalone HTML/CSS/JS file. Say "React/Vite page", "React components", or "targeted project update" when relevant.
Then immediately output the file blocks. No other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data, output at the very end (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Only when the app would clearly benefit from a database or backend.`

  const systemPromptNew = `FRONTEND DESIGN SKILL — FOLLOW THIS BEFORE WRITING ANY CODE:

Before writing a single line of code, commit to a BOLD aesthetic direction for the domain. Ask yourself:
  - What is the purpose and audience of this interface?
  - What tone fits? Options: brutally minimal, editorial/magazine, luxury/refined, organic/natural, industrial/utilitarian, playful/toy-like, retro-futuristic, art deco/geometric, brutalist/raw, maximalist. Pick one and commit.
  - What makes this UNFORGETTABLE? What is the one visual thing the user will remember?

TYPOGRAPHY (MANDATORY):
  - Pair a distinctive display/heading font with a refined body font using Google Fonts @import.
  - NEVER use Inter, Roboto, Arial, system-ui, or Space Grotesk as the primary typeface.
  - Unexpected, characterful font choices elevate everything.
  - Build a real type scale: one size for display, one for section headings, one for body, one for captions.

COLOR (MANDATORY):
  - Build a CSS custom property palette in :root {} — never default to Tailwind zinc/stone alone.
  - Dominant color with one sharp accent outperforms evenly-distributed multi-color palettes.
  - BANNED as default accent: purple, violet, indigo, blue-purple gradients. Use them ONLY if the user or reference explicitly calls for them.
  - Pick colors that match the domain. Food = warm. Finance = cool authoritative. Creative = bold. Wellness = muted natural.

MOTION (MANDATORY):
  - Use Framer Motion for all entrance animations.
  - One well-orchestrated page load with staggered reveals (staggerChildren, animation-delay) creates more impact than scattered micro-interactions.
  - Every interactive element must have a hover state and transition. No static buttons.
  - Duration 0.3s–0.5s. No bouncing, spinning, or excessive stagger.

SPATIAL COMPOSITION:
  - Aim for unexpected layouts: asymmetry, overlap, diagonal flow, grid-breaking elements, generous negative space OR controlled density. Never the default centered 3-column symmetric grid.
  - Fewer sections executed brilliantly beats more sections executed generically.

BACKGROUNDS AND DEPTH:
  - Create atmosphere. Use gradient meshes, subtle noise textures, geometric patterns, layered transparencies, or grain overlays that match the aesthetic direction.
  - Never ship a flat solid-color background as the only choice when texture or depth would serve the domain better.

ABSOLUTE BANS — NEVER produce these:
  - Purple/indigo gradient hero on a dark page.
  - Default Features / Pricing / Docs nav structure when not asked.
  - Generic "Build smarter" / "Ship faster" hero copy.
  - Decorative code preview cards as hero content when not asked.
  - Inter or Space Grotesk as the font.
  - Rainbow gradients or neon glow spam.
  - Glassmorphism unless extremely subtle and domain-appropriate.
  - Placeholder copy. If you do not know the content, infer it intelligently from context. A bakery means real bakery copy.

QUALITY BAR:
  Before finalising, ask: "Would a real design agency charge for this?" If no — redesign it. Every output must be distinctive, domain-appropriate, and production-ready.

---

You are an expert React developer. Generate a complete, working Vite + React + TypeScript application based on the user's request.

ARCHITECTURE (NON-NEGOTIABLE):
- Build within the Lotus generated-app architecture: Vite + React + TypeScript.
- Do NOT create or describe a standalone single-page HTML/CSS/JS file.
- Do NOT collapse the project into inline CSS/scripts in index.html.
- index.html is only the Vite shell. The application UI belongs in src/App.tsx and reusable React components under src/components.
- A "single page" website means a single React page/route inside the Vite app, not a standalone HTML document.

PRODUCTION-GRADE OUTPUT (MANDATORY — NO EXCEPTIONS):
- You are building real websites for real businesses. Every output must be production-ready, not a demo.
- ZERO placeholder content. If you don't know the actual content, infer it intelligently from context. A bakery prompt means you write real bakery copy, real menu items, real opening hours format, real address format.
- ZERO generic AI layouts. No default hero-features-cta-footer cookie cutter. Design for the specific domain.
- ZERO default purple AI SaaS shells. Do not use a dark purple-accented landing page with Features/Pricing/Docs and fake code preview unless the user explicitly asks for that exact visual direction.
- Do not use purple, violet, indigo, or blue-purple gradients as the primary brand color by default. Pick a domain-specific palette.
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

Generate files in this order (ALL MANDATORY):
1. package.json - Dependencies first (MUST include tailwindcss, postcss, autoprefixer)
2. vite.config.ts
3. tailwind.config.ts - ALWAYS (required for Tailwind compilation)
4. postcss.config.js - ALWAYS (required for Tailwind compilation)
5. index.html
6. src/main.tsx - MUST import './index.css'
7. src/App.tsx
8. src/index.css - ALWAYS (must include @tailwind base; @tailwind components; @tailwind utilities; directives and custom properties)
9. src/components/*.tsx - Any necessary components
10. src/lib/*.ts - Utility functions if needed

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
- NEVER hallucinate lucide-react icon names. 'RocketLaunch' does not exist, use 'Rocket'. Use exact lucide casing: 'Github' not 'GitHub', 'Linkedin' not 'LinkedIn', 'Youtube' not 'YouTube'.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use Tailwind CSS, include tailwindcss, postcss, and autoprefixer in devDependencies.
- Do not reference any package in code unless it exists in package.json.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui is not a real package).
- For the favicon in index.html, ALWAYS use an inline SVG: <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>"> to prevent 404 errors.

Ensure the dev server binds to 0.0.0.0 and uses a known port (prefer port 3000). If you use Vite, configure it accordingly.

Make the code production-ready with proper error handling, accessibility, and responsive design.
Create organized folder structures with components in /src/components, utilities in /src/lib, etc.

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply to the user, e.g. "I'll help you build Cookie Clicker - a mobile app where the user can press on a cookie and a score will increment. When incremented, the new score should be displayed for users on any device. I'll add animations when the cookie is pressed." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
The AGENT_MESSAGE must accurately describe a Vite + React implementation. Never say you will create a standalone HTML/CSS/JS file.
Then immediately output the file blocks. Do not include any other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

COMPLETENESS VERIFICATION (MANDATORY before output):
1. Every import path in every file resolves to a file you also generate (or an npm package in package.json).
2. Every component used in JSX is defined — either in the same file or in a generated file.
3. Every asset path (images, fonts, icons) either uses a CDN URL or is generated as a file.
4. No file references another file that is not in your output.
If any check fails, generate the missing file before finishing.

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

  const isInspiration = intent === "inspiration"
  const systemPrompt = isFollowUp ? systemPromptFollowUp : systemPromptNew
  const finalSystemPrompt = provider === "nvidia"
    ? `${systemPrompt}\n\n${nvidiaReliabilityPrompt}`
    : systemPrompt

  // Build user message — inspiration mode prepends the reference site context
  const inspirationPrefix = body.inspirationContext
    ? `REFERENCE SITE FOR INSPIRATION:\nURL: ${body.inspirationContext.sourceUrl}\nTitle: ${body.inspirationContext.title}\nDescription: ${body.inspirationContext.description}\n\nSite content:\n${body.inspirationContext.markdown}\n\n${isInspiration ? "Use the above as the content and layout inspiration. Recreate the same sections, copy, and visual hierarchy as a modern React app with Tailwind. Match the design intent closely without copying styles verbatim." : "Use the above only as reference context. Build a fresh, inspired design."}\n\n`
    : ""

  const userMessageContent = isFollowUp
    ? buildFollowUpUserMessage(inspirationPrefix + prompt, promptFiles)
    : `Create a Vite + React + TypeScript application: ${inspirationPrefix}${prompt}`

  const encoder = new TextEncoder()
  const streamState: StreamState = {
    usageInfo: null,
    streamedLength: 0,
    closed: false,
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
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

        streamState.closed = true
        try { controller.close() } catch {}

        await chargeTokensForGeneration({
          uid,
          usageInfo: streamState.usageInfo,
          promptChars: userMessageContent.length,
          completionChars: streamState.streamedLength,
        })
      } catch (err: any) {
        console.error('Stream error', err)

        if (err?.message === "MODEL_TIMEOUT") {
          controller.error(err)
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
