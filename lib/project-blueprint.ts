import type {
  BlueprintItemStatus,
  BlueprintSection,
  Message,
  PlanningStatus,
  ProjectBlueprint,
} from "@/app/project/[id]/types"

/** Setup requirements that may block or guide the build */
export type SetupRequirementType = "auth" | "database" | "payments" | "supabase" | "stripe" | "custom-api" | "cms"

export interface SetupRequirement {
  type: SetupRequirementType
  label: string
  description: string
  isRequired: boolean
  isConfirmed: boolean
  suggestedTiming: "v1" | "v2" | "optional"
}

export interface GuidedAnswerOption {
  id: string
  label: string
  value: string
}

export interface GuidedAnswerSet {
  key: string
  question: string
  helper: string
  selectionMode: "single" | "multiple"
  options: GuidedAnswerOption[]
  allowsCustomAnswer: boolean
}

export interface PlanningStudioStage {
  step: "define" | "plan"
  planReady: boolean
  blueprintVisible: boolean
  stepIndex: number
  questionsRemaining: number
  composerSubmitLabel: string
  statusLabel: string
  heading: string
  description: string
  reassurance: string
  nextStepLabel: string
  stepItems: Array<{
    key: "define" | "plan" | "build"
    label: string
    state: "current" | "upcoming"
  }>
}

type SectionId =
  | "goal"
  | "audience"
  | "product"
  | "structure"
  | "visual"
  | "content"
  | "systems"
  | "scope"

const SECTION_ORDER: SectionId[] = [
  "goal",
  "audience",
  "product",
  "structure",
  "visual",
  "content",
  "systems",
  "scope",
]

const STATUS_PRIORITY: Record<BlueprintItemStatus, number> = {
  confirmed: 3,
  suggested: 2,
  unknown: 1,
}

function tidy(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeList(items: string[]) {
  return Array.from(new Set(items.map((item) => tidy(item)).filter(Boolean)))
}

export function getBlueprintItem(blueprint: ProjectBlueprint, key: string) {
  return blueprint.sections.flatMap((section) => section.items).find((item) => item.key === key)
}

function buildOption(id: string, label: string, value = label): GuidedAnswerOption {
  return { id, label, value }
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function splitCandidateParts(value: string) {
  return value
    .replace(/\b(?:and|or)\b/gi, ",")
    .split(",")
    .map((part) => tidy(part.replace(/^[\-\u2022]\s*/, "")))
    .filter(Boolean)
}

function cleanCandidate(value: string) {
  return tidy(
    value
      .replace(/^a\s+/i, "")
      .replace(/^an\s+/i, "")
      .replace(/^the\s+/i, "")
      .replace(/\bfor version one\b/gi, "")
      .replace(/\bversion one\b/gi, "")
      .replace(/\bneeds(?: [a-z]+)?\b/gi, "")
      .replace(/\bstill\b/gi, "")
      .replace(/\bconfirmation\b/gi, "")
      .replace(/\bclarified\b/gi, "")
      .replace(/[.:]$/g, "")
  )
}

function normalizeCandidateOptions(values: string[]) {
  return normalizeList(
    values
      .flatMap((value) => splitCandidateParts(value))
      .map(cleanCandidate)
      .filter((value) => value.length > 1)
  )
}

function extractChoicesFromQuestion(question: string) {
  const sources: string[] = []
  const colonMatch = question.match(/:\s*(.+?)(?:\?|$)/)
  if (colonMatch?.[1]) sources.push(colonMatch[1])

  const shouldThisMatch = question.match(/should this be (.+?)(?:\?|$)/i)
  if (shouldThisMatch?.[1]) sources.push(shouldThisMatch[1])

  const whatDirectionMatch = question.match(/should the build follow[: ]+(.+?)(?:\?|$)/i)
  if (whatDirectionMatch?.[1]) sources.push(whatDirectionMatch[1])

  const doYouNeedMatch = question.match(/do you need (.+?)(?:\?|$)/i)
  if (doYouNeedMatch?.[1]) sources.push(doYouNeedMatch[1])

  const provideMatch = question.match(/will you provide (.+?)(?:\?|$)/i)
  if (provideMatch?.[1]) sources.push(provideMatch[1])

  return normalizeCandidateOptions(sources)
}

function extractChoicesFromItemValue(item?: { value: string; status: BlueprintItemStatus }) {
  if (!item || item.status === "unknown") return []
  if (/(not defined|needs|should be confirmed|still open|unknown)/i.test(item.value)) return []
  return normalizeCandidateOptions([item.value])
}

function extractAudienceChoices(prompt: string) {
  const matches = [
    prompt.match(/for ([a-z0-9 ,/&-]+)/i)?.[1],
    prompt.match(/target(?:ing)? ([a-z0-9 ,/&-]+)/i)?.[1],
    prompt.match(/aimed at ([a-z0-9 ,/&-]+)/i)?.[1],
  ].filter(Boolean) as string[]

  return normalizeCandidateOptions(matches)
}

function extractExplicitPages(prompt: string) {
  return normalizeList(
    (prompt.match(/\b(home|about|pricing|contact|blog|faq|dashboard|settings|checkout|login|signup|features|testimonials|onboarding|billing|help)\b/gi) || [])
      .map(titleCase)
  )
}

function deriveGuidedOptions(blueprint: ProjectBlueprint, unresolvedItem: { key: string; value: string; status: BlueprintItemStatus }) {
  const question = blueprint.openQuestions[0] || ""
  const prompt = getBlueprintItem(blueprint, "goal")?.value || blueprint.summary
  const questionChoices = extractChoicesFromQuestion(question)
  const itemChoices = extractChoicesFromItemValue(unresolvedItem)

  if (unresolvedItem.key === "audience") {
    return normalizeList([...questionChoices, ...itemChoices, ...extractAudienceChoices(prompt)])
  }

  if (unresolvedItem.key === "pages") {
    return normalizeList([...itemChoices, ...extractExplicitPages(prompt)])
  }

  return normalizeList([...questionChoices, ...itemChoices])
}

/**
 * Fallback detection functions for when AI analysis is not available.
 * These provide reasonable defaults without calling the API.
 */

function detectProjectTypeSync(prompt: string) {
  const text = prompt.toLowerCase()

  if (/(dashboard|admin|portal|internal tool|workspace)/.test(text)) {
    return { value: "Dashboard or product workspace", status: "confirmed" as const }
  }
  if (/(landing page|homepage|marketing site|brand site)/.test(text)) {
    return { value: "Marketing website", status: "confirmed" as const }
  }
  if (/(e-?commerce|store|shop|checkout|product catalog)/.test(text)) {
    return { value: "Commerce website", status: "confirmed" as const }
  }
  if (/(saas|app|platform|tool)/.test(text)) {
    return { value: "Web app or SaaS product", status: "suggested" as const }
  }

  return { value: "Website or web app needs confirmation", status: "unknown" as const }
}

function detectAudienceSync(prompt: string) {
  const text = prompt.toLowerCase()
  const match =
    text.match(/for ([a-z0-9 ,/&-]+)/i) ||
    text.match(/target(?:ing)? ([a-z0-9 ,/&-]+)/i) ||
    text.match(/aimed at ([a-z0-9 ,/&-]+)/i)

  if (match?.[1]) {
    return {
      value: titleCase(match[1].replace(/[.].*$/, "").trim()),
      status: "confirmed" as const,
    }
  }

  return { value: "Primary audience not defined yet", status: "unknown" as const }
}

function detectVisualSync(prompt: string) {
  const text = prompt.toLowerCase()
  const keywords = [
    "minimal",
    "luxury",
    "editorial",
    "bold",
    "premium",
    "modern",
    "playful",
    "dark",
    "light",
    "elegant",
    "corporate",
    "clean",
  ].filter((token) => text.includes(token))

  if (keywords.length > 0) {
    return {
      value: normalizeList(keywords).map(titleCase).join(", "),
      status: "confirmed" as const,
    }
  }

  return {
    value: "Brand and visual direction still needs confirmation",
    status: "unknown" as const,
  }
}

function detectPagesSync(prompt: string, projectType: string) {
  const text = prompt.toLowerCase()
  const explicitPages = normalizeList(
    (text.match(/\b(home|about|pricing|contact|blog|faq|dashboard|settings|checkout|login|signup)\b/g) || [])
      .map(titleCase)
  )

  if (explicitPages.length > 0) {
    return { value: explicitPages.join(", "), status: "confirmed" as const }
  }

  if (projectType === "Marketing website") {
    return {
      value: "Home, Features, Pricing, FAQ, Contact",
      status: "suggested" as const,
    }
  }

  if (projectType === "Dashboard or product workspace") {
    return {
      value: "Marketing entry, Product workspace, Key management screens",
      status: "suggested" as const,
    }
  }

  return {
    value: "Primary pages or screens still need definition",
    status: "unknown" as const,
  }
}

function detectFeaturesSync(prompt: string) {
  const text = prompt.toLowerCase()
  const features = normalizeList([
    /(login|sign in|auth|authentication)/.test(text) ? "Authentication" : "",
    /(payment|billing|stripe|checkout|subscription)/.test(text) ? "Payments" : "",
    /(cms|content management|blog)/.test(text) ? "CMS or content workflow" : "",
    /(form|lead|book demo|contact)/.test(text) ? "Lead capture forms" : "",
    /(analytics|tracking)/.test(text) ? "Analytics" : "",
    /(dashboard|admin)/.test(text) ? "Dashboard or admin tools" : "",
    /(database|data|saved|persist)/.test(text) ? "Persistent data layer" : "",
  ])

  if (features.length > 0) {
    return { value: features.join(", "), status: "confirmed" as const }
  }

  return {
    value: "Core feature set still needs scoping",
    status: "unknown" as const,
  }
}

function detectContentSync(prompt: string) {
  const text = prompt.toLowerCase()
  if (/(copy|content|case stud|testimonials|images|portfolio|gallery)/.test(text)) {
    return { value: "Custom content is part of the brief", status: "confirmed" as const }
  }

  return {
    value: "Content source and writing needs still open",
    status: "unknown" as const,
  }
}

function detectSystemsSync(prompt: string) {
  const text = prompt.toLowerCase()
  const parts = normalizeList([
    /(auth|login|signup)/.test(text) ? "Auth may be needed" : "",
    /(payment|stripe|checkout|subscription)/.test(text) ? "Payments may be needed" : "",
    /(cms|blog|content)/.test(text) ? "CMS or content editing may be needed" : "",
    /(database|saved|persist|dashboard|account)/.test(text) ? "Backend or database may be needed" : "",
    /(supabase|firebase|notion|github|vercel|netlify)/.test(text)
      ? "Third-party integrations are mentioned"
      : "",
  ])

  if (parts.length > 0) {
    return { value: parts.join(", "), status: "suggested" as const }
  }

  return {
    value: "No backend, auth, payment, or integration requirements confirmed yet",
    status: "unknown" as const,
  }
}

function detectScopeSync(prompt: string) {
  const text = prompt.toLowerCase()
  if (/(mvp|simple|small|single page|one page)/.test(text)) {
    return { value: "Focused launch scope", status: "confirmed" as const }
  }
  if (/(dashboard|portal|marketplace|platform|multi-tenant|admin)/.test(text)) {
    return { value: "Medium to high product complexity", status: "suggested" as const }
  }

  return {
    value: "Build scope should be confirmed before implementation",
    status: "unknown" as const,
  }
}

/**
 * AI-driven detection using the blueprint analyze API.
 * Intelligently extracts project attributes from user prompt with context awareness.
 */
async function detectWithAI(prompt: string, existingBlueprint?: ProjectBlueprint) {
  try {
    const response = await fetch("/api/blueprint/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        existingBlueprint: existingBlueprint ? {
          sections: existingBlueprint.sections
        } : undefined,
      }),
    })

    if (!response.ok) {
      console.warn("AI analysis failed, falling back to heuristics")
      return null
    }

    const analysis = await response.json()
    return analysis
  } catch (error) {
    console.warn("AI analysis error, falling back to heuristics:", error)
    return null
  }
}

/**
 * Get detection results, preferring AI analysis with sync fallback.
 */
async function getDetectionResults(prompt: string, existingBlueprint?: ProjectBlueprint) {
  const aiAnalysis = await detectWithAI(prompt, existingBlueprint)

  if (aiAnalysis) {
    return {
      type: { value: aiAnalysis.type.value, status: aiAnalysis.type.status },
      audience: { value: aiAnalysis.audience.value, status: aiAnalysis.audience.status },
      pages: { value: aiAnalysis.pages.value, status: aiAnalysis.pages.status },
      features: { value: aiAnalysis.features.value, status: aiAnalysis.features.status },
      visual: { value: aiAnalysis.style.value, status: aiAnalysis.style.status },
      systems: { value: aiAnalysis.systems.value, status: aiAnalysis.systems.status },
      content: { value: aiAnalysis.content.value, status: aiAnalysis.content.status },
      scope: { value: aiAnalysis.scope.value, status: aiAnalysis.scope.status },
    }
  }

  // Fallback to sync detection
  const projectType = detectProjectTypeSync(prompt)
  return {
    type: projectType,
    audience: detectAudienceSync(prompt),
    pages: detectPagesSync(prompt, projectType.value),
    features: detectFeaturesSync(prompt),
    visual: detectVisualSync(prompt),
    systems: detectSystemsSync(prompt),
    content: detectContentSync(prompt),
    scope: detectScopeSync(prompt),
  }
}

async function buildSections(prompt: string, existingBlueprint?: ProjectBlueprint): Promise<BlueprintSection[]> {
  const goal = tidy(prompt)
  const detections = await getDetectionResults(prompt, existingBlueprint)
  
  const product = detections.type
  const audience = detections.audience
  const visual = detections.visual
  const pages = detections.pages
  const features = detections.features
  const content = detections.content
  const systems = detections.systems
  const scope = detections.scope

  const sectionMap: Record<SectionId, BlueprintSection> = {
    goal: {
      id: "goal",
      title: "Project goal",
      description: "What we are building and why it exists.",
      items: [
        { key: "goal", label: "Primary brief", value: goal, status: "confirmed" },
      ],
    },
    audience: {
      id: "audience",
      title: "Audience",
      description: "Who the product needs to speak to.",
      items: [
        { key: "audience", label: "Target audience", value: audience.value, status: audience.status },
      ],
    },
    product: {
      id: "product",
      title: "Product shape",
      description: "What kind of experience this should become.",
      items: [
        { key: "type", label: "Website or app type", value: product.value, status: product.status },
        { key: "features", label: "Core features", value: features.value, status: features.status },
      ],
    },
    structure: {
      id: "structure",
      title: "Structure",
      description: "Pages, screens, and information architecture.",
      items: [
        { key: "pages", label: "Pages or screens", value: pages.value, status: pages.status },
      ],
    },
    visual: {
      id: "visual",
      title: "Visual direction",
      description: "Look, tone, and brand cues.",
      items: [
        { key: "style", label: "Style direction", value: visual.value, status: visual.status },
      ],
    },
    content: {
      id: "content",
      title: "Content needs",
      description: "How much content or brand material is required.",
      items: [
        { key: "content", label: "Content requirements", value: content.value, status: content.status },
      ],
    },
    systems: {
      id: "systems",
      title: "Systems and integrations",
      description: "Backend, auth, payments, CMS, and integrations.",
      items: [
        { key: "systems", label: "System requirements", value: systems.value, status: systems.status },
      ],
    },
    scope: {
      id: "scope",
      title: "Scope and constraints",
      description: "How ambitious the first build should be.",
      items: [
        { key: "scope", label: "Scope", value: scope.value, status: scope.status },
      ],
    },
  }

  return SECTION_ORDER.map((id) => sectionMap[id])
}

function scoreReadiness(sections: BlueprintSection[]) {
  const items = sections.flatMap((section) => section.items)
  const total = items.reduce((sum, item) => sum + STATUS_PRIORITY[item.status], 0)
  const max = items.length * STATUS_PRIORITY.confirmed
  return Math.round((total / Math.max(max, 1)) * 100)
}

function buildOpenQuestions(sections: BlueprintSection[]) {
  const itemMap = new Map(sections.flatMap((section) => section.items.map((item) => [item.key, item])))

  const prompts = [
    itemMap.get("audience")?.status === "unknown"
      ? "Who is the primary audience? What should they do first?"
      : "",
    itemMap.get("type")?.status === "unknown"
      ? "What type of experience: marketing site, product app, or SaaS?"
      : "",
    itemMap.get("pages")?.status !== "confirmed"
      ? "What are the must-have pages or screens for the first version?"
      : "",
    itemMap.get("style")?.status === "unknown"
      ? "What's the visual direction? (minimal, bold, luxury, editorial, modern...)"
      : "",
    itemMap.get("systems")?.status === "unknown"
      ? "Do you need user authentication, payments, a CMS, or a backend?"
      : "",
    itemMap.get("content")?.status === "unknown"
      ? "Will you provide content and brand assets, or use placeholder copy?"
      : "",
  ]

  return normalizeList(prompts).slice(0, 3)
}

/** Detect which backend systems are explicitly mentioned and required */
function detectSetupRequirements(prompt: string): SetupRequirement[] {
  const text = prompt.toLowerCase()
  const requirements: SetupRequirement[] = []

  // Authentication
  if (/(auth|login|sign[- ]?in|signup|account|user accounts)/.test(text)) {
    requirements.push({
      type: "auth",
      label: "User authentication",
      description: "Users need to sign in or create accounts",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // Payments / Stripe
  if (/(payment|stripe|checkout|subscription|billing|charge|credit card)/.test(text)) {
    requirements.push({
      type: "payments",
      label: "Payment processing",
      description: "Collect payments from users (Stripe, etc)",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // Database
  if (/(database|backend|persist|save|data storage|user data|records)/.test(text)) {
    requirements.push({
      type: "database",
      label: "Database",
      description: "Persistent data storage for users or content",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // Supabase
  if (/supabase/.test(text)) {
    requirements.push({
      type: "supabase",
      label: "Supabase integration",
      description: "Use Supabase for auth and database",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // Stripe specifically
  if (/stripe/.test(text)) {
    requirements.push({
      type: "stripe",
      label: "Stripe",
      description: "Process payments with Stripe",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // CMS
  if (/(cms|content management|blog|editorial|manage content)/i.test(text)) {
    requirements.push({
      type: "cms",
      label: "CMS or content management",
      description: "Platform to manage content and blog posts",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v1",
    })
  }

  // Custom API
  if (/(api|third[- ]?party|external|integration|webhook)/.test(text)) {
    requirements.push({
      type: "custom-api",
      label: "Custom API or integrations",
      description: "Connect to external APIs or services",
      isRequired: true,
      isConfirmed: true,
      suggestedTiming: "v2",
    })
  }

  return requirements
}

function buildAssumptions(sections: BlueprintSection[]) {
  return normalizeList(
    sections.flatMap((section) =>
      section.items
        .filter((item) => item.status === "suggested")
        .map((item) => `${item.label}: ${item.value}`)
    )
  ).slice(0, 4)
}

function buildSummary(sections: BlueprintSection[]) {
  const goal = sections.find((section) => section.id === "goal")?.items[0]?.value || "New project"
  const type = sections.find((section) => section.id === "product")?.items.find((item) => item.key === "type")
  const audience = sections.find((section) => section.id === "audience")?.items[0]

  const parts = [
    goal,
    type?.status !== "unknown" ? type?.value : "",
    audience?.status === "confirmed" ? `for ${audience.value}` : "",
  ].filter(Boolean)

  return tidy(parts.join(" "))
}

function refreshBlueprint(blueprint: ProjectBlueprint): ProjectBlueprint {
  const sections = blueprint.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      value: tidy(item.value),
    })),
  }))

  return {
    ...blueprint,
    sections,
    readiness: scoreReadiness(sections),
    openQuestions: buildOpenQuestions(sections),
    assumptions: buildAssumptions(sections),
    summary: buildSummary(sections),
  }
}

function updateItem(
  sections: BlueprintSection[],
  key: string,
  value: string,
  status: BlueprintItemStatus = "confirmed"
) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.key === key ? { ...item, value: tidy(value), status } : item
    ),
  }))
}

function appendOrPromoteFeature(sections: BlueprintSection[], feature: string) {
  return sections.map((section) => {
    if (section.id !== "product") return section

    return {
      ...section,
      items: section.items.map((item) => {
        if (item.key !== "features") return item

        const features = normalizeList(
          item.status === "unknown" ? [feature] : [...item.value.split(","), feature]
        )
        return {
          ...item,
          value: features.join(", "),
          status: "confirmed" as const,
        }
      }),
    }
  })
}

function answerFromReply(blueprint: ProjectBlueprint, reply: string) {
  let sections = blueprint.sections
  const text = tidy(reply)
  const lower = text.toLowerCase()

  const audienceMatch =
    text.match(/(?:for|targeting|aimed at)\s+(.+)/i) ||
    text.match(/audience(?: is| should be)?\s+(.+)/i)
  if (audienceMatch?.[1]) {
    const candidate = tidy(audienceMatch[1])
    // Reject if it looks like generic instructions (long, contains verbs, punctuation)
    const isProperAudience = candidate.length <= 120 && !/[.!?]$/.test(candidate) && !/\b(build|create|make|design|add|include|have|need)\b/i.test(candidate)
    if (isProperAudience) {
      sections = updateItem(sections, "audience", candidate, "confirmed")
    }
  } else {
    const audienceItem = sections
      .flatMap((section) => section.items)
      .find((item) => item.key === "audience")
    // Only treat short, simple text as audience (not complex instructions)
    if (audienceItem?.status !== "confirmed" && text.length <= 80 && !/[.?!]/.test(text) && !/\b(build|when|if|should|need|can|want)\b/i.test(text)) {
      sections = updateItem(sections, "audience", text, "confirmed")
    }
  }

  if (/(landing page|marketing site|brand site)/i.test(text)) {
    sections = updateItem(sections, "type", "Marketing website", "confirmed")
  } else if (/(dashboard|portal|admin|workspace)/i.test(text)) {
    sections = updateItem(sections, "type", "Dashboard or product workspace", "confirmed")
  } else if (/(web app|saas|app|platform)/i.test(text)) {
    sections = updateItem(sections, "type", "Web app or SaaS product", "confirmed")
  }

  const pagesMatch =
    text.match(/(?:pages|screens|sections)(?: should be| include|:)?\s+(.+)/i) ||
    text.match(/include\s+(.+(?:home|pricing|contact|about|dashboard|login).*)/i)
  if (pagesMatch?.[1]) {
    sections = updateItem(sections, "pages", pagesMatch[1], "confirmed")
  }

  const styleKeywords = [
    "minimal",
    "luxury",
    "editorial",
    "bold",
    "premium",
    "modern",
    "playful",
    "dark",
    "light",
    "elegant",
    "corporate",
    "clean",
  ].filter((token) => lower.includes(token))
  if (styleKeywords.length > 0) {
    sections = updateItem(
      sections,
      "style",
      normalizeList(styleKeywords).map(titleCase).join(", "),
      "confirmed"
    )
  }

  if (/(auth|login|sign[- ]?in|signup|accounts?)/.test(lower) && /(yes|need|required|require|implement|add)/.test(lower)) {
    sections = appendOrPromoteFeature(sections, "Authentication")
    sections = updateItem(
      sections,
      "systems",
      "Yes, users need to sign in",
      "confirmed"
    )
  }
  if (/(payment|stripe|checkout|subscription|billing|charge)/.test(lower)) {
    sections = appendOrPromoteFeature(sections, "Payments")
    sections = updateItem(
      sections,
      "systems",
      "Yes, payments are needed",
      "confirmed"
    )
  }
  if (/(cms|blog|editorial|content management|manage content)/.test(lower)) {
    sections = updateItem(
      sections,
      "systems",
      "Yes, a CMS or content editing is needed",
      "confirmed"
    )
  }
  if (/(database|backend|persist|save|data storage|recur)/.test(lower)) {
    sections = updateItem(
      sections,
      "systems",
      "Yes, a backend / data storage is needed",
      "confirmed"
    )
  }
  if (/(use supabase|supabase for)?/.test(lower)) {
    sections = updateItem(
      sections,
      "systems",
      "Use Supabase for auth and database",
      "confirmed"
    )
  }
  // Explicitly handle "no backend stuff" or "later" responses
  if (/(no|nope|don't|dont|skip|later|post-launch|v2|version 2|after launch|none of these).*?(auth|backend|payment|database|cms)/.test(lower) ||
      /(auth|backend|payment|database|cms).*?(no|nope|don't|dont|skip|later|post-launch|v2|version 2|after launch|none)/.test(lower)) {
    sections = updateItem(
      sections,
      "systems",
      "Build frontend first, add backend after launch",
      "confirmed"
    )
  }
  if (/(placeholder|will provide|i'll provide|you can write|use placeholder|fake content)/.test(lower)) {
    sections = updateItem(
      sections,
      "content",
      "Use placeholder copy, we'll update it later",
      "confirmed"
    )
  }
  if (/(mvp|simple|focused|version one|small scope|lean)/.test(lower)) {
    sections = updateItem(sections, "scope", "Focused version-one scope", "confirmed")
  }

  return refreshBlueprint({ ...blueprint, sections })
}

export async function createInitialBlueprint(prompt: string): Promise<ProjectBlueprint> {
  const sections = await buildSections(prompt)
  return refreshBlueprint({
    summary: tidy(prompt),
    readiness: 0,
    sections,
    openQuestions: [],
    assumptions: [],
  })
}

export function updateBlueprintFromReply(blueprint: ProjectBlueprint, reply: string) {
  return answerFromReply(blueprint, reply)
}

export function buildPlanningAssistantReply(
  blueprint: ProjectBlueprint,
  userReply?: string
): { content: string; planningStatus: PlanningStatus } {
  const openQuestions = blueprint.openQuestions
  const sectionsWithUnknowns = blueprint.sections
    .flatMap((section) =>
      section.items
        .filter((item) => item.status === "unknown")
        .map((item) => `${section.title.toLowerCase()}: ${item.label.toLowerCase()}`)
    )
    .slice(0, 2)

  const intro = userReply
    ? "I updated the blueprint with what feels newly confirmed."
    : "I understand the direction so far and I want to tighten the few decisions that will most affect the first build."

  if (openQuestions.length === 0) {
    return {
      content: `${intro} I have enough context to draft a solid first plan once you approve these answers. After the plan is generated, you can still refine it before we build.`,
      planningStatus: "draft",
    }
  }

  return {
    content: `${intro} The main things to clarify are ${sectionsWithUnknowns.join(" and ")}. ${openQuestions[0]}${openQuestions[1] ? ` After that, I’d also like to confirm: ${openQuestions[1]}` : ""}`,
    planningStatus: "needs-input",
  }
}

export function getGuidedAnswerSet(blueprint: ProjectBlueprint): GuidedAnswerSet | null {
  const unresolvedItem = blueprint.sections
    .flatMap((section) => section.items)
    .find((item) => item.status === "unknown" || item.status === "suggested")

  if (!unresolvedItem) return null
  const derivedOptions = deriveGuidedOptions(blueprint, unresolvedItem)
  
  // Only return guided options if we have derived options
  if (derivedOptions.length < 2) return null

  const questionText = (blueprint.openQuestions[0] || unresolvedItem.label || "").toLowerCase()
  const optionCount = derivedOptions.length
  const mentionsMultipleIntent =
    /\b(select all|all that apply|which of these|any of these|what pages|which pages|what features|which features|integrations|systems)\b/i.test(
      questionText
    )
  const keyDefaultsToMultiple =
    unresolvedItem.key === "pages" || unresolvedItem.key === "systems" || unresolvedItem.key === "features"

  const selectionMode: "single" | "multiple" =
    keyDefaultsToMultiple || mentionsMultipleIntent || optionCount >= 5
      ? "multiple"
      : "single"

  const helper =
    selectionMode === "multiple"
      ? "Select all that apply, then adjust anything in chat if needed."
      : "Choose the closest option, then adjust it in chat if needed."

  return {
    key: unresolvedItem.key,
    question: blueprint.openQuestions[0] || unresolvedItem.label,
    helper,
    selectionMode,
    options: derivedOptions.map((option) => buildOption(slugify(option), option)),
    allowsCustomAnswer: true,
  }
}

const GUIDED_DRAFT_BUILDERS: Partial<Record<string, (optionLabels: string[]) => string>> = {
  pages: (optionLabels) => `Pages for version one: ${optionLabels.join(", ")}.`,
  systems: (optionLabels) => `For version one, include: ${optionLabels.join(", ")}.`,
  features: (optionLabels) => `For version one, include: ${optionLabels.join(", ")}.`,
  scope: (optionLabels) => `Scope for version one: ${optionLabels.join(", ")}.`,
}

export function buildGuidedAnswerDraft(
  guidedAnswerSet: GuidedAnswerSet | null,
  optionLabels: string[]
) {
  if (!guidedAnswerSet || optionLabels.length === 0) return ""

  if (guidedAnswerSet.selectionMode === "single") {
    return optionLabels[0]
  }

  if (guidedAnswerSet.options.some((option) => option.id === "none" && optionLabels.includes(option.label))) {
    return "None of these for version one."
  }

  return GUIDED_DRAFT_BUILDERS[guidedAnswerSet.key]?.(optionLabels) || optionLabels.join(", ")
}

export function getPlanningStudioStage(
  blueprint: ProjectBlueprint,
  planningStatus: PlanningStatus
): PlanningStudioStage {
  const planReady = blueprint.openQuestions.length === 0
  const blueprintVisible = planningStatus === "plan-generated" || planningStatus === "approved"
  const questionsRemaining = blueprint.openQuestions.length
  const stepIndex = blueprintVisible ? 2 : 1
  const stepItems: Array<{ key: "define" | "plan" | "build"; label: string; state: "current" | "upcoming" }> = [
    { key: "define", label: "Define", state: blueprintVisible ? "upcoming" : "current" },
    { key: "plan", label: "Plan", state: blueprintVisible ? "current" : "upcoming" },
    { key: "build", label: "Build", state: "upcoming" },
  ]

  return {
    step: blueprintVisible ? "plan" : "define",
    planReady,
    blueprintVisible,
    stepIndex,
    questionsRemaining,
    composerSubmitLabel: blueprintVisible
      ? "Refine plan"
      : planReady
        ? "Next"
        : "Next",
    statusLabel: blueprintVisible
      ? "Plan ready to review"
      : planReady
        ? "Ready to generate plan"
        : "Shaping your brief",
    heading: blueprintVisible ? "Your plan is ready to review" : "Let's shape your site before we build it",
    description: blueprintVisible
      ? "You now have a clear version-one plan. Review it, refine anything that feels off, then build when you're ready."
      : "A few clear decisions now will make the first build feel much closer to what you actually want.",
    reassurance: blueprintVisible
      ? "You're past the open-ended part. This is the review step before the build."
      : planReady
        ? "You're very close. One approval turns these answers into a plan you can review."
        : questionsRemaining === 1
          ? "This should only take one more decision before the plan is ready."
          : `${questionsRemaining} key decisions left before we draft the plan.`,
    nextStepLabel: blueprintVisible
      ? "Next: approve the plan for build"
      : planReady
        ? "Next: generate your plan"
        : "Next: answer the current question",
    stepItems,
  }
}

export function getPlanningProgressLabel(readiness: number) {
  if (readiness >= 80) return "Build-ready"
  if (readiness >= 55) return "Taking shape"
  return "Exploring"
}

export async function createPlanningMessages(prompt: string, existingMessages: Message[] = [], blueprint?: ProjectBlueprint) {
  if (existingMessages.length > 0) return existingMessages

  const resolvedBlueprint = blueprint ?? await createInitialBlueprint(prompt)
  return [
    {
      role: "assistant" as const,
      content: buildPlanningAssistantReply(resolvedBlueprint).content,
      timestamp: new Date().toISOString(),
    },
  ]
}
