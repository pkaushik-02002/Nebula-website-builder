import { NextResponse } from "next/server"
import { getUserNetlifyToken, requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const token = await getUserNetlifyToken(uid)
    return NextResponse.json({ connected: !!token })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
