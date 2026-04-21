import { requireUserUid } from "@/lib/server-auth"
import { adminDb } from "@/lib/firebase-admin"
import Browserbase from "@browserbasehq/sdk"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getBB() {
  const apiKey = process.env.BROWSERBASE_API_KEY
  const projectId = process.env.BROWSERBASE_PROJECT_ID
  if (!apiKey || !projectId) throw new Error("Browserbase not configured")
  return { bb: new Browserbase({ apiKey }), projectId }
}

export async function POST(req: Request) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let computerId: string | undefined
  try {
    const body = await req.json()
    computerId = typeof body?.computerId === "string" ? body.computerId : undefined
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (computerId) {
    const snap = await adminDb.collection("computers").doc(computerId).get()
    if (!snap.exists || (snap.data() as Record<string, unknown>).ownerId !== uid) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  try {
    const { bb, projectId } = getBB()
    const session = await bb.sessions.create({ projectId })
    const debug = await bb.sessions.debug(session.id)
    const debugRecord = debug as unknown as Record<string, unknown>
    const liveViewUrl =
      (debugRecord.debuggerFullscreenUrl as string) ??
      `https://www.browserbase.com/sessions/${session.id}`

    if (computerId) {
      await adminDb.collection("computers").doc(computerId).update({
        browserbaseSessionId: session.id,
        browserbaseLiveViewUrl: liveViewUrl,
      })
    }

    return Response.json({ sessionId: session.id, liveViewUrl })
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Failed to create session" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let sessionId: string
  try {
    const body = await req.json()
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 })

  try {
    const { bb } = getBB()
    await bb.sessions.update(sessionId, { status: "REQUEST_RELEASE" })
    return Response.json({ ok: true })
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Failed to close session" }, { status: 500 })
  }
}
