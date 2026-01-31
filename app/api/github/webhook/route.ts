import { NextResponse } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature || !signature.startsWith("sha256=")) {
    return false
  }
  const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")
  if (signature.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-hub-signature-256")

  const rawBody = await req.text()
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: { action?: string; zen?: string; hook_id?: number }
  try {
    payload = JSON.parse(rawBody) as { action?: string; zen?: string; hook_id?: number }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const event = req.headers.get("x-github-event") || ""

  if (event === "ping") {
    return NextResponse.json({ message: "pong", hook_id: payload.hook_id })
  }

  return NextResponse.json({ received: true })
}
