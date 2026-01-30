"use client"

import React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Loader2 } from "lucide-react"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredTokens?: number
}

export function ProtectedRoute({ children, requiredTokens = 0 }: ProtectedRouteProps) {
  const router = useRouter()
  const { user, userData, loading, hasTokens } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Check token limit
  if (requiredTokens > 0 && !hasTokens(requiredTokens)) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">Token Limit Reached</h2>
          <p className="text-zinc-500 mb-4">
            You&apos;ve used all your tokens for this month. Upgrade your plan to continue building.
          </p>
          <p className="text-zinc-600 text-sm mb-6">
            Current plan: <span className="text-zinc-400 capitalize">{userData?.plan}</span>
            {" | "}
            Used: <span className="text-zinc-400">{userData?.tokensUsed.toLocaleString()}</span> / {userData?.tokensLimit.toLocaleString()}
          </p>
          <a
            href="/#pricing"
            className="inline-flex items-center justify-center px-6 py-2 bg-zinc-100 text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Upgrade Plan
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
