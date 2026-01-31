import { NextResponse } from "next/server"
import { getGitHubToken, requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const token = await getGitHubToken(uid)
    return NextResponse.json({ connected: !!token })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
