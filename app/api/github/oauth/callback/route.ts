import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { setGitHubToken } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code || !state) {
    return new NextResponse("Missing code or state", { status: 400 })
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const redirectUri = process.env.GITHUB_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return new NextResponse("GitHub OAuth env not configured", { status: 500 })
  }

  const stateSnap = await adminDb.collection("githubOauthStates").doc(state).get()
  if (!stateSnap.exists) {
    return new NextResponse("Invalid or expired state", { status: 400 })
  }

  const { uid, projectId } = (stateSnap.data() ?? {}) as { uid?: string; projectId?: string }
  if (!uid) {
    return new NextResponse("Invalid state payload", { status: 400 })
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "")
    return new NextResponse(`Token exchange failed: ${tokenRes.status} ${text}`, { status: 500 })
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string }
  const accessToken = tokenJson?.access_token
  if (!accessToken) {
    return new NextResponse(tokenJson?.error ?? "No access_token returned", { status: 500 })
  }

  await setGitHubToken(uid, accessToken)
  await adminDb.collection("githubOauthStates").doc(state).delete().catch(() => {})

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin
  const redirectTo = new URL(baseUrl)
  redirectTo.pathname = projectId ? `/project/${projectId}` : "/settings"
  redirectTo.searchParams.set("github", "connected")

  return NextResponse.redirect(redirectTo.toString())
}
