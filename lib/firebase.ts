import { initializeApp, getApps } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from "firebase/auth"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const db = getFirestore(app)
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()
const githubProvider = new GithubAuthProvider()

// User plan types and token limits
export type UserPlan = "free" | "pro" | "enterprise"

export const PLAN_TOKEN_LIMITS: Record<UserPlan, number> = {
  free: 10000,
  pro: 50000,
  enterprise: 500000,
}

export const PLAN_FEATURES: Record<UserPlan, { name: string; tokensPerMonth: number; features: string[] }> = {
  free: {
    name: "Free",
    tokensPerMonth: 10000,
    features: ["10,000 tokens/month", "Basic code generation", "Community support"],
  },
  pro: {
    name: "Pro",
    tokensPerMonth: 50000,
    features: ["50,000 tokens/month", "Advanced code generation", "Priority support", "Custom templates"],
  },
  enterprise: {
    name: "Enterprise",
    tokensPerMonth: 500000,
    features: ["500,000 tokens/month", "Unlimited projects", "Dedicated support", "Custom integrations", "Team collaboration"],
  },
}

// Convenience: default plan docs to seed in Firestore (optional)
export const DEFAULT_PLANS: Record<UserPlan, { id: string; name: string; tokensPerMonth: number; features: string[] }> = {
  free: { id: 'free', name: 'Free', tokensPerMonth: 10000, features: ['10,000 tokens/month', 'Basic code generation', 'Community support'] },
  pro: { id: 'pro', name: 'Pro', tokensPerMonth: 50000, features: ['50,000 tokens/month', 'Advanced code generation', 'Priority support', 'Custom templates'] },
  enterprise: { id: 'enterprise', name: 'Enterprise', tokensPerMonth: 500000, features: ['500,000 tokens/month', 'Unlimited projects', 'Dedicated support', 'Custom integrations', 'Team collaboration'] },
}

export { app, db, auth, googleProvider, githubProvider }
