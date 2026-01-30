// lib/firebaseAdmin.ts
import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function getServiceAccountFromEnv() {
  console.log("env check", {
    hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
  })

  const projectId = requiredEnv("FIREBASE_PROJECT_ID")
  const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL")
  const privateKeyRaw = requiredEnv("FIREBASE_PRIVATE_KEY")

  // Most platforms store multiline secrets with literal "\n" sequences
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n") // common fix [web:101]

  return { projectId, clientEmail, privateKey }
}

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  const sa = getServiceAccountFromEnv()

  return initializeApp({
    credential: cert({
      projectId: sa.projectId,
      clientEmail: sa.clientEmail,
      privateKey: sa.privateKey,
    }),
  })
}

export const adminApp: App = getAdminApp()
export const adminAuth: Auth = getAuth(adminApp)
export const adminDb: Firestore = getFirestore(adminApp)
