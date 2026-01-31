import { NextResponse } from "next/server"
import { getGitHubOauthState, randomState, requireUserUid, setGitHubOauthState } from "@/lib/server-auth"
import { adminDb } from "@/lib/firebase-admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)

    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId") || ""

    const clientId = process.env.GITHUB_CLIENT_ID
    const redirectUri = process.env.GITHUB_REDIRECT_URI

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "GITHUB_CLIENT_ID / GITHUB_REDIRECT_URI not configured" },
        { status: 500 }
      )
    }

    const existingState = await getGitHubOauthState(uid)
    const state = existingState || randomState()

    await setGitHubOauthState(uid, state)
    await adminDb.collection("githubOauthStates").doc(state).set(
      {
        uid,
        projectId,
        createdAt: new Date(),
      },
      { merge: true }
    )

    const authUrl = new URL("https://github.com/login/oauth/authorize")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("scope", "repo")
    authUrl.searchParams.set("state", state)

    return NextResponse.json({ url: authUrl.toString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
