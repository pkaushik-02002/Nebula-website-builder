import { NextResponse } from "next/server"
import { getUserNetlifyOauthState, randomState, requireUserUid, setUserNetlifyOauthState } from "@/lib/server-auth"
import { adminDb } from "@/lib/firebase-admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)

    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""
    const computerId = url.searchParams.get("computerId") || ""

    const clientId = process.env.NETLIFY_CLIENT_ID
    const redirectUri = process.env.NETLIFY_REDIRECT_URI

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "NETLIFY_CLIENT_ID/NETLIFY_REDIRECT_URI not configured" },
        { status: 500 }
      )
    }

    const existingState = await getUserNetlifyOauthState(uid)
    const state = existingState || randomState()

    await setUserNetlifyOauthState(uid, state)
    await adminDb.collection("netlifyOauthStates").doc(state).set(
      {
        uid,
        projectId,
        computerId,
        createdAt: new Date(),
      },
      { merge: true }
    )

    const authUrl = new URL("https://app.netlify.com/authorize")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("state", state)

    return NextResponse.json({ url: authUrl.toString() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unauthorized" }, { status: 401 })
  }
}
