import OpenAI from "openai"
import { adminAuth } from "@/lib/firebase-admin"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

    let specificInstructions = ""
    if (itemKey === "audience") {
      specificInstructions = "Generate 3-4 specific audience segments that would realistically use this product. Each should be a complete phrase like 'Small business owners looking to scale' or 'Tech-savvy millennials in urban areas'."
    } else if (itemKey === "pages") {
      specificInstructions = "Generate 4-5 essential page names for this website/app. Focus on the core user journey and must-have sections."
    } else if (itemKey === "systems") {
      specificInstructions = "Generate 3-4 common backend/integrations that might be needed. Include options like 'User authentication', 'Payment processing', 'CMS for content', 'Database for user data'."
    } else if (itemKey === "features") {
      specificInstructions = "Generate 4-5 key features that would make this product valuable. Focus on the main value propositions."
    } else if (itemKey === "style") {
      specificInstructions = "Generate 3-4 visual style directions like 'Minimal and clean', 'Bold and modern', 'Warm and professional', 'Playful and energetic'."
    } else {
      specificInstructions = "Generate 3-5 realistic options for this aspect of the project."
    }

    const systemPrompt = `You are helping generate clarification options for a website/app planning process.

The user is building: ${prompt}

Current blueprint context:
${JSON.stringify(blueprint, null, 2)}

${specificInstructions}

Return only a JSON array of strings, no other text. Each option should be concise but descriptive.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate options for: ${itemKey}` }
      ],
      max_tokens: 300,
    })

    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) {
      throw new Error("No content generated")
    }

    const options = JSON.parse(content)
    if (!Array.isArray(options)) {
      throw new Error("Invalid response format")
    }

    return Response.json({ options })
  } catch (error) {
    console.error("Generate options error:", error)
    return new Response(JSON.stringify({ error: 'Failed to generate options' }), { status: 500 })
  }
}