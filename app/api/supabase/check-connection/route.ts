import { NextResponse } from "next/server"
import { requireUserUid } from "@/lib/server-auth"
import { getSupabaseConnection } from "@/lib/supabase-management"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const connection = await getSupabaseConnection(uid)
    
    const connected = !!connection?.accessToken
    return NextResponse.json({ connected })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ connected: false, error: message }, { status: 401 })
  }
}
