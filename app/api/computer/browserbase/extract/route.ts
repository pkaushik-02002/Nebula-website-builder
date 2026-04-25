import { loadStagehand } from "@/lib/browserbase/load-stagehand"
import { stagehandServerOptions } from "@/lib/browserbase/stagehand-server-options"
import { requireUserUid } from "@/lib/server-auth"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const extractSchema = z.object({
  title: z.string().optional(),
  content: z.string(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let sessionId: string, instruction: string
  try {
    const body = await req.json()
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    instruction = typeof body?.instruction === "string" ? body.instruction : ""
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 })
  if (!instruction) return Response.json({ error: "instruction required" }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY || !process.env.BROWSERBASE_PROJECT_ID || !process.env.BROWSERBASE_API_KEY) {
    return Response.json({ error: "Missing API configuration" }, { status: 500 })
  }

  const { Stagehand } = await loadStagehand()
  const stagehand = new Stagehand({
    ...stagehandServerOptions,
    env: "BROWSERBASE",
    browserbaseSessionID: sessionId,
    modelName: "claude-sonnet-4-5",
    modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
  })

  try {
    await stagehand.init()
    const result = await stagehand.page.extract({ instruction, schema: extractSchema })
    return Response.json({ extracted: result })
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Extraction failed" }, { status: 500 })
  } finally {
    await stagehand.close().catch(() => {})
  }
}
