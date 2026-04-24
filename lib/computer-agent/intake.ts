import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type {
  ComputerBuildScope,
  ComputerClarificationQuestion,
  ComputerIntent,
  ComputerPermissions,
} from "@/lib/computer-types"
import {
  extractReferenceDomainsFromText,
  extractReferenceUrlsFromText,
  mergeReferenceUrls,
} from "./reference-urls"
import { resolveReferenceUrlFromPrompt } from "./reference-resolver"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const clarificationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(48),
  answer: z.string().min(1),
  recommended: z.boolean().optional().default(false),
})

const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(clarificationOptionSchema).min(2).max(4),
})

const intakeSchema = z.object({
  intent: z.enum(["website-build", "website-clone", "web-app"]),
  buildScope: z.enum(["frontend-only", "full-stack"]),
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(clarificationQuestionSchema).max(4),
  summary: z.string(),
  shouldResearchReferences: z.boolean(),
})

function looksLikeCloneRequest(prompt: string): boolean {
  return /\b(clone|recreate|mirror|imitate|copy|rebuild)\b/i.test(prompt)
}

export interface ComputerIntakeResult {
  intent: ComputerIntent
  buildScope: ComputerBuildScope
  needsClarification: boolean
  clarificationQuestions: ComputerClarificationQuestion[]
  summary: string
  shouldResearchReferences: boolean
  referenceUrls: string[]
}

function parseJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error("Failed to parse intake analysis")
  }

  return JSON.parse(match[0]) as Record<string, unknown>
}

export async function analyzeComputerBrief(input: {
  prompt: string
  referenceUrls?: string[]
  permissions?: ComputerPermissions | null
}): Promise<ComputerIntakeResult> {
  const directReferenceUrls = mergeReferenceUrls(
    input.referenceUrls ?? [],
    extractReferenceUrlsFromText(input.prompt),
    extractReferenceDomainsFromText(input.prompt)
  )
  const resolvedReferenceUrl =
    directReferenceUrls.length === 0 ? await resolveReferenceUrlFromPrompt(input.prompt) : null
  const mergedReferenceUrls = mergeReferenceUrls(directReferenceUrls, resolvedReferenceUrl ? [resolvedReferenceUrl] : [])

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    system: `You are a senior website product strategist for an autonomous website builder.

Return valid JSON only. No markdown. No commentary.

Rules:
- Website clone requests are a default flow, not an exception.
- If the brief is specific enough to plan a production-quality website safely, do not ask clarification questions.
- If critical information is missing, ask concise high-value clarification questions only. Do not paper over weak briefs with random assumptions.
- Ask clarification when the user asks for a "modern website" or "nice landing page" but gives no product, audience, offer, or visual direction.
- When clarification is needed, return structured questions with clickable options.
- When the user asks to clone, recreate, mirror, imitate, or rebuild an existing website, classify it as "website-clone".
- Website cloning must always use "frontend-only" scope. Never suggest backend cloning.
- If a website clone target can be identified from the prompt or resolved reference URL, do not ask clarification questions by default.
- For website clone requests without an explicit page or section, default to cloning the public landing page or homepage.
- If the user wants a richer web experience such as WebGL, 3D scenes, immersive motion, or interactive storytelling, keep that in mind but only ask follow-up questions when something essential is unclear.
- If a clone-style request does not include a usable reference URL, clarification is required.
- Prefer at most 4 questions unless the brief is truly too vague.
- Prefer questions that improve design quality: audience, offer, content source, visual taste, and required interactions.
- Each clarification question must include 2 to 4 concise options that a user can click.
- Each option must include a short "label" of a few words, not a full sentence.
- Each option must include a complete "answer" string that can be sent back to the agent as the user's reply.
- Options must be grounded in the user's brief. Do not invent random branches or placeholder choices.
- Mark at most one option per question as recommended when there is a clearly safer default.
- "shouldResearchReferences" should be true when reference URLs are available and useful.

Return this shape:
{
  "intent": "website-build" | "website-clone" | "web-app",
  "buildScope": "frontend-only" | "full-stack",
  "needsClarification": boolean,
  "clarificationQuestions": [
    {
      "id": "short-stable-id",
      "prompt": "question",
      "options": [
        {
          "id": "option-id",
          "label": "short clickable label",
          "answer": "full answer sentence the user can send back",
          "recommended": true
        }
      ]
    }
  ],
  "summary": "one sentence",
  "shouldResearchReferences": boolean
}`,
    messages: [
      {
        role: "user",
        content: `Prompt:
${input.prompt}

Reference URLs already provided:
${mergedReferenceUrls.length > 0 ? mergedReferenceUrls.map((url) => `- ${url}`).join("\n") : "(none)"}

Plan approval is ${input.permissions?.requirePlanApproval === false ? "disabled" : "enabled"}.

Remember:
- Disable assumptions only when the brief is genuinely too vague or missing critical targets.
- Do not approve a plan from a vague aesthetic request alone. High-quality design needs product/audience/content anchors.
- Clone requests default to frontend-only.
- If no exact target URL is present for a clone request, ask for it.
- Clarification options should feel like real product decisions, not generic filler.`,
      },
    ],
  })

  const text = response.content[0]?.type === "text" ? response.content[0].text : ""
  const parsed = intakeSchema.parse(parseJsonObject(text))
  const forceCloneDefaults = parsed.intent === "website-clone" && mergedReferenceUrls.length > 0
  const fallbackCloneIntent = looksLikeCloneRequest(input.prompt) && mergedReferenceUrls.length > 0

  return {
    ...parsed,
    ...(forceCloneDefaults || fallbackCloneIntent
      ? {
          intent: "website-clone" as const,
          buildScope: "frontend-only" as const,
          needsClarification: false,
          clarificationQuestions: [],
          shouldResearchReferences: true,
        }
      : {}),
    referenceUrls: mergedReferenceUrls,
  }
}
