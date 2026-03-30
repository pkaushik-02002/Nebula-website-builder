import OpenAI from "openai"
import { adminAuth } from "@/lib/firebase-admin"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const ITEM_GUIDANCE: Record<string, string> = {
  audience: "Suggest realistic audience segments or buyer types only if the brief implies a few plausible directions.",
  pages: "Suggest likely pages or screens only when page structure is still open and choices would help the user move faster.",
  systems: "Suggest likely backend, auth, CMS, data, or payment needs only if the planning context would benefit from a quick checklist.",
  features: "Suggest core product capabilities only when there are a few coherent directions the user could pick from.",
  style: "Suggest a few visual directions only when style can reasonably be narrowed through quick choices.",
  content: "Suggest content direction choices only when the content question can be simplified into a few clear options.",
  scope: "Suggest scope directions only when the product could clearly be narrowed by choosing between a few levels of ambition.",
}

export async function POST(req: Request) {
  const body = await req.json() as {
    itemKey: string
    blueprint: any
    prompt: string
  }
  const { itemKey, blueprint, prompt } = body

  // Authenticate
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
  if (!bearerToken) {
    return new Response(JSON.stringify({ error: 'Missing auth token' }), { status: 401 })
  }

  try {
    await adminAuth.verifyIdToken(bearerToken)
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
  }

  try {
    const itemKey = body.itemKey
    const blueprint = body.blueprint
    const prompt = body.prompt

    const systemPrompt = `You are helping generate clarification options for a website/app planning process.

The user is building: ${prompt}

Current blueprint context:
${JSON.stringify(blueprint, null, 2)}

Current item under discussion: ${itemKey}

${ITEM_GUIDANCE[itemKey] || "Offer quick choices only if they genuinely help."}

Decide whether quick choices should be shown at all.
- If the user would be better served by open chat, set "show": false.
- If quick choices would help, set "show": true and generate concise but helpful options.
- Prefer 3-5 options.
- Avoid generic filler.
- Make helper copy feel conversational, not survey-like.
- Pick "single" or "multiple" based on the planning context, not by item key alone.

Return only valid JSON matching this shape:
{
  "show": true,
  "question": "string",
  "helper": "string",
  "selectionMode": "single" | "multiple",
  "allowsCustomAnswer": true,
  "options": ["option 1", "option 2"]
}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Decide whether quick choices would help for ${itemKey}, and if so generate them.` }
      ],
      max_tokens: 300,
    })

    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) {
      throw new Error("No content generated")
    }

    const payload = JSON.parse(content)
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid response format")
    }

    return Response.json({
      show: payload.show === true,
      question: typeof payload.question === "string" ? payload.question : null,
      helper: typeof payload.helper === "string" ? payload.helper : null,
      selectionMode: payload.selectionMode === "multiple" ? "multiple" : "single",
      allowsCustomAnswer: payload.allowsCustomAnswer !== false,
      options: Array.isArray(payload.options) ? payload.options : [],
    })
  } catch (error) {
    console.error("Generate options error:", error)
    return new Response(JSON.stringify({ error: 'Failed to generate options' }), { status: 500 })
  }
}
