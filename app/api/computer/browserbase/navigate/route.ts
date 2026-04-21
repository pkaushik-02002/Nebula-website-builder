import { requireUserUid } from "@/lib/server-auth"
import { loadStagehand } from "@/lib/browserbase/load-stagehand"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let sessionId: string, url: string
  try {
    const body = await req.json()
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    url = typeof body?.url === "string" ? body.url : ""
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 })
  if (!url) return Response.json({ error: "url required" }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY || !process.env.BROWSERBASE_PROJECT_ID || !process.env.BROWSERBASE_API_KEY) {
    return Response.json({ error: "Missing API configuration" }, { status: 500 })
  }

  const { Stagehand } = await loadStagehand()
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    browserbaseSessionID: sessionId,
    modelName: "claude-sonnet-4-5",
    modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
  })

  try {
    await stagehand.init()
    await stagehand.page.goto(url, { waitUntil: "domcontentloaded" })
    const finalUrl = stagehand.page.url()
    return Response.json({ ok: true, url: finalUrl })
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Navigation failed" }, { status: 500 })
  } finally {
    await stagehand.close().catch(() => {})
  }
}
