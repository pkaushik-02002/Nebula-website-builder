import crypto from "crypto"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

export async function requireUserUid(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Missing Authorization Bearer token")
  }

  const idToken = header.slice("Bearer ".length).trim()
  const decoded = await adminAuth.verifyIdToken(idToken)
  return decoded.uid
}

export function randomState(): string {
  return crypto.randomBytes(24).toString("hex")
}

export async function getUserNetlifyToken(uid: string): Promise<string | null> {
  const snap = await adminDb.collection("users").doc(uid).get()
  const data = snap.exists ? snap.data() : null
  const token = (data as any)?.netlifyAccessToken
  return typeof token === "string" && token.length > 0 ? token : null
}

export async function setUserNetlifyToken(uid: string, accessToken: string) {
  await adminDb.collection("users").doc(uid).set(
    {
      netlifyAccessToken: accessToken,
      netlifyConnectedAt: new Date(),
    },
    { merge: true }
  )
}

export async function setUserNetlifyOauthState(uid: string, state: string) {
  await adminDb.collection("users").doc(uid).set(
    {
      netlifyOauthState: state,
      netlifyOauthStateCreatedAt: new Date(),
    },
    { merge: true }
  )
}

export async function getUserNetlifyOauthState(uid: string): Promise<string | null> {
  const snap = await adminDb.collection("users").doc(uid).get()
  const data = snap.exists ? snap.data() : null
  const state = (data as any)?.netlifyOauthState
  return typeof state === "string" && state.length > 0 ? state : null
}
