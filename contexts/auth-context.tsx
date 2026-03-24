"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth"
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, Timestamp, collection } from "firebase/firestore"
import { auth, db, googleProvider, githubProvider, type UserPlan, PLAN_TOKEN_LIMITS, DEFAULT_PLANS } from "@/lib/firebase"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

interface TokenUsage {
  used: number
  remaining: number
  periodStart: Date
  periodEnd: Date
}

interface AgentUsage {
  used: number
  remaining: number
  periodStart: Date
  periodEnd: Date
}

interface UserData {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  planId: string
  planName?: string
  tokenUsage: TokenUsage
  agentUsage: AgentUsage
  tokensLimit: number
  agentRunLimit: number
  createdAt: Date
  currentWorkspaceId?: string
}

interface Workspace {
  id: string
  name: string
  slug: string
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

interface AuthContextType {
  user: User | null
  userData: UserData | null
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  loading: boolean
  switchWorkspace: (workspaceId: string) => Promise<void>
  /** Returns Bearer header when auth.currentUser exists (avoids 403 on project fetch when React state lags). */
  getOptionalAuthHeader: () => Promise<Record<string, string>>
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  sendPasswordResetEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  updateTokensUsed: (tokens: number) => Promise<void>
  hasTokens: (required: number) => boolean
  remainingTokens: number
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  // Ensure user doc exists and set up onSnapshot listener
  const ensureUserDoc = async (firebaseUser: User) => {
    const userRef = doc(db, "users", firebaseUser.uid)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      const now = new Date()
      const planId = 'free'
      const plan = DEFAULT_PLANS[planId as UserPlan]
      const agentRunLimit = getAgentRunLimitForPlan(planId)
      const initial = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        planId,
        tokenUsage: {
          used: 0,
          remaining: plan.tokensPerMonth,
          periodStart: serverTimestamp(),
          periodEnd: serverTimestamp(),
        },
        agentRunLimit,
        agentUsage: {
          used: 0,
          remaining: agentRunLimit,
          periodStart: serverTimestamp(),
          periodEnd: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
        currentWorkspaceId: null,
      }
      await setDoc(userRef, initial)
      // Auto-create personal workspace
      try {
        const idToken = await firebaseUser.getIdToken()
        const wsRes = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ name: `${firebaseUser.displayName || firebaseUser.email}'s Workspace`, slug: `personal-${firebaseUser.uid.slice(0, 8)}` })
        })
        if (wsRes.ok) {
          const ws = await wsRes.json()
          await updateDoc(userRef, { currentWorkspaceId: ws.id })
        }
      } catch (e) {
        console.error('Failed to auto-create personal workspace', e)
      }
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      
      if (firebaseUser) {
        try {
          await ensureUserDoc(firebaseUser)
          try {
            const idToken = await firebaseUser.getIdToken()
            await fetch("/api/user/refresh-token-period", {
              method: "POST",
              headers: { Authorization: `Bearer ${idToken}` },
            })
          } catch {
            // non-blocking: snapshot will still get latest data
          }

          const userRef = doc(db, "users", firebaseUser.uid)
          const unsubscribeUser = onSnapshot(userRef, async (snap) => {
            if (!snap.exists()) return
            const data = snap.data()

            const planId = data.planId || 'free'
            // Prefer Firestore values (set by Stripe webhook / API) over defaults
            let planName = data.planName || DEFAULT_PLANS[planId as UserPlan]?.name || planId
            let tokensLimit = data.tokensLimit != null ? Number(data.tokensLimit) : (DEFAULT_PLANS[planId as UserPlan]?.tokensPerMonth ?? PLAN_TOKEN_LIMITS.free)
            const agentRunLimit = getAgentRunLimitForPlan(planId, data.agentRunLimit)

            // Optionally override from plans collection
            try {
              const planRef = doc(db, 'plans', planId)
              const planSnap = await getDoc(planRef)
              if (planSnap.exists()) {
                const p = planSnap.data()
                if (p?.name) planName = p.name
                if (p?.tokensPerMonth != null) tokensLimit = p.tokensPerMonth
              }
            } catch (e) {
              // ignore
            }

            const tokenUsage = data.tokenUsage || { used: data.tokensUsed || 0, remaining: tokensLimit - (data.tokensUsed || 0), periodStart: new Date(), periodEnd: new Date() }
            const tokenPeriodStart = tokenUsage.periodStart?.toDate ? tokenUsage.periodStart.toDate() : new Date(tokenUsage.periodStart)
            const tokenPeriodEnd = tokenUsage.periodEnd?.toDate ? tokenUsage.periodEnd.toDate() : new Date(tokenUsage.periodEnd)
            const agentUsageRaw = data.agentUsage || {}
            const agentUsed = Math.max(0, Number(agentUsageRaw.used ?? 0))
            const agentRemaining = Math.max(
              0,
              Number.isFinite(Number(agentUsageRaw.remaining))
                ? Number(agentUsageRaw.remaining)
                : agentRunLimit - agentUsed
            )
            const agentPeriodStart = agentUsageRaw.periodStart?.toDate
              ? agentUsageRaw.periodStart.toDate()
              : tokenPeriodStart
            const agentPeriodEnd = agentUsageRaw.periodEnd?.toDate
              ? agentUsageRaw.periodEnd.toDate()
              : tokenPeriodEnd

            setUserData({
              uid: firebaseUser.uid,
              email: data.email,
              displayName: data.displayName,
              photoURL: data.photoURL,
              planId,
              planName,
              tokenUsage: {
                used: tokenUsage.used || 0,
                remaining: Math.max(0, tokenUsage.remaining ?? (tokensLimit - (tokenUsage.used || 0))),
                periodStart: tokenPeriodStart,
                periodEnd: tokenPeriodEnd,
              },
              agentUsage: {
                used: agentUsed,
                remaining: agentRemaining,
                periodStart: agentPeriodStart,
                periodEnd: agentPeriodEnd,
              },
              tokensLimit,
              agentRunLimit,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
              currentWorkspaceId: data.currentWorkspaceId || null,
            })

            // Fetch workspaces list
            try {
              const idToken = await firebaseUser.getIdToken()
              const wsRes = await fetch('/api/workspaces', {
                headers: { Authorization: `Bearer ${idToken}` }
              })
              if (wsRes.ok) {
                const wsData = await wsRes.json()
                setWorkspaces(Array.isArray(wsData) ? wsData : (wsData?.workspaces ?? []))
              }
            } catch (e) {
              console.error('Failed to fetch workspaces', e)
            }
          })

          // keep unsubscribe reference
          ;(unsubscribe as any)._unsubscribeUser = unsubscribeUser
        } catch (error) {
          console.error("Error fetching user data:", error)
        }
      } else {
        setUserData(null)
        setWorkspaces([])
      }

      setLoading(false)
    })

    return () => {
      // cleanup auth listener
      unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Google sign in error:", error)
      throw error
    }
  }

  const signInWithGithub = async () => {
    try {
      await signInWithPopup(auth, githubProvider)
    } catch (error) {
      console.error("GitHub sign in error:", error)
      throw error
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      console.error("Email sign in error:", error)
      throw error
    }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (error) {
      console.error("Email sign up error:", error)
      throw error
    }
  }

  const sendPasswordResetEmailToUser = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error) {
      console.error("Password reset email error:", error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (error) {
      console.error("Sign out error:", error)
      throw error
    }
  }

  const updateTokensUsed = async (tokens: number) => {
    if (!user || !userData) return

    const currentRemaining = Math.max(0, userData.tokenUsage.remaining ?? 0)
    const actualDeduct = Math.min(tokens, currentRemaining)
    const newRemaining = Math.max(0, currentRemaining - actualDeduct)
    const newUsed = (userData.tokenUsage.used || 0) + actualDeduct

    const userRef = doc(db, "users", user.uid)
    // client-side best-effort update; server-side transaction should be authoritative
    await updateDoc(userRef, {
      'tokenUsage.used': newUsed,
      'tokenUsage.remaining': newRemaining,
    } as any)

    setUserData(prev => prev ? { ...prev, tokenUsage: { ...prev.tokenUsage, used: newUsed, remaining: newRemaining } } : null)
  }

  const hasTokens = (required: number): boolean => {
    if (!userData) return false
    return (userData.tokenUsage.remaining || 0) >= required
  }

  const remainingTokens = userData ? Math.max(0, userData.tokenUsage.remaining ?? 0) : 0

  const getOptionalAuthHeader = async (): Promise<Record<string, string>> => {
    const currentUser = auth.currentUser
    if (!currentUser) return {}
    try {
      const token = await currentUser.getIdToken()
      return { Authorization: `Bearer ${token}` }
    } catch {
      return {}
    }
  }

  const switchWorkspace = async (workspaceId: string) => {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    await updateDoc(userRef, { currentWorkspaceId: workspaceId })
  }

  const currentWorkspace = Array.isArray(workspaces) ? workspaces.find(w => w.id === userData?.currentWorkspaceId) || null : null

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        workspaces,
        currentWorkspace,
        loading,
        switchWorkspace,
        getOptionalAuthHeader,
        signInWithGoogle,
        signInWithGithub,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordResetEmail: sendPasswordResetEmailToUser,
        signOut,
        updateTokensUsed,
        hasTokens,
        remainingTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
