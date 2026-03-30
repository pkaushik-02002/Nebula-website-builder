import { NextRequest, NextResponse } from "next/server"

interface AnalyzeRequest {
  prompt: string
  existingBlueprint?: {
    sections: Array<{
      id: string
      items: Array<{
        key: string
        label: string
        value: string
        status: string
      }>
    }>
  }
}

interface DetectionResult {
  key: string
  value: string
  status: "confirmed" | "suggested" | "unknown"
  reasoning?: string
}

interface AnalyzeResponse {
  type: DetectionResult
  audience: DetectionResult
  pages: DetectionResult
  features: DetectionResult
  style: DetectionResult
  systems: DetectionResult
  content: DetectionResult
  scope: DetectionResult
}

const ANALYSIS_PROMPT = `You are an expert product strategist analyzing a project brief to extract key product insights.

Given the user's project prompt, extract and infer the following attributes with confidence:
- type: What kind of product (Marketing website, Dashboard or product workspace, Web app or SaaS product, E-commerce website, etc.)
- audience: Who the product is for
- pages: Key pages or screens needed
- features: Core features or capabilities
- style: Visual direction and brand cues
- systems: Backend, auth, payments, CMS, integrations needed
- content: Content and brand asset needs
- scope: How ambitious the first build should be (MVP, Full-featured, etc.)

For each attribute, return:
1. value: A concise, natural description
2. status: "confirmed" (directly stated), "suggested" (inferred from context), or "unknown" (not enough info)
3. reasoning: Brief explanation of why you chose this status

Be thoughtful and consider the user's intent. If something is ambiguous, mark it as "suggested" rather than "unknown".
Prefer specific, actionable insights over generic placeholders.
Avoid overthinking - if the brief doesn't mention something, mark it "unknown" unless you can reasonably infer it.

Return your analysis as a JSON object matching this exact structure:
{
  "type": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "audience": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "pages": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "features": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "style": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "systems": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "content": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" },
  "scope": { "value": "string", "status": "confirmed|suggested|unknown", "reasoning": "string" }
}

Project brief:
`

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()
    const { prompt, existingBlueprint } = body

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const contextAddendum =
      existingBlueprint && existingBlueprint.sections.length > 0
        ? `\n\nExisting blueprint context (items already confirmed or suggested):
${existingBlueprint.sections
  .flatMap((section) =>
    section.items
      .filter((item) => item.status !== "unknown")
      .map((item) => `- ${item.label}: "${item.value}" (${item.status})`)
  )
  .join("\n")}`
        : ""

    const fullPrompt = ANALYSIS_PROMPT + prompt + contextAddendum
    void fullPrompt

    return NextResponse.json(
      { error: "Blueprint AI analysis unavailable" },
      { status: 503 }
    )
  } catch (error) {
    console.error("Blueprint analysis error:", error)
    return NextResponse.json(
      { error: "Failed to analyze blueprint" },
      { status: 500 }
    )
  }
}
