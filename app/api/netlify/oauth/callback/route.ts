import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { setUserNetlifyToken } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code || !state) {
    return new NextResponse("Missing code/state", { status: 400 })
  }

  const clientId = process.env.NETLIFY_CLIENT_ID
  const clientSecret = process.env.NETLIFY_CLIENT_SECRET
  const redirectUri = process.env.NETLIFY_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return new NextResponse("Netlify OAuth env not configured", { status: 500 })
  }

  const stateSnap = await adminDb.collection("netlifyOauthStates").doc(state).get()
  if (!stateSnap.exists) {
    return new NextResponse("Invalid state", { status: 400 })
  }

  const { uid, projectId, computerId } = stateSnap.data() as any
  if (!uid) {
    return new NextResponse("Invalid state payload", { status: 400 })
  }

  const tokenRes = await fetch("https://api.netlify.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
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

  const tokenJson = (await tokenRes.json()) as any
  const accessToken = tokenJson?.access_token
  if (!accessToken) {
    return new NextResponse("No access_token returned", { status: 500 })
  }

  await setUserNetlifyToken(uid, accessToken)
  await adminDb.collection("netlifyOauthStates").doc(state).delete().catch(() => {})

  const redirectTo = new URL(process.env.NEXT_PUBLIC_APP_URL || url.origin)
  redirectTo.pathname = computerId ? `/computer/${computerId}` : projectId ? `/project/${projectId}` : "/projects"
  redirectTo.searchParams.set("netlify", "connected")

  return NextResponse.redirect(redirectTo.toString())
}
