import { adminAuth } from "@/lib/firebase-admin"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { url: string; idToken: string } | null
  if (!body || !body.url || !body.idToken) {
    return NextResponse.json({ error: "Missing url or idToken" }, { status: 400 })
  }

  const { url, idToken } = body

  // Verify Firebase ID token
  try {
    await adminAuth.verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid idToken" }, { status: 401 })
  }

  // Scrape via Firecrawl
  let firecrawlRes: Response
  try {
    firecrawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 })
  }

  if (!firecrawlRes.ok) {
    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 })
  }

  const data = await firecrawlRes.json().catch(() => null)
  const payload = data?.data ?? data ?? {}
  const markdown: string = payload?.markdown ?? ""
  const title: string = payload?.metadata?.title ?? ""
  const description: string = payload?.metadata?.description ?? ""

  return NextResponse.json({
    title,
    description,
    markdown: markdown.slice(0, 6000),
    sourceUrl: url,
  })
}
