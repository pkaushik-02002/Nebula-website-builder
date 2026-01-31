"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/ui/navbar"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ArrowLeft,
  User,
  Coins,
  Sparkles,
  Loader2,
  Mail,
  Github,
  Rocket,
  Settings as SettingsIcon,
} from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"

function SettingsContent() {
  const router = useRouter()
  const { user, userData, loading } = useAuth()

  if (loading || !user || !userData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  const tokensLimit = userData.tokenUsage.used + (userData.remainingTokens ?? 0)
  const tokenPercentage = tokensLimit > 0 ? Math.round((userData.tokenUsage.used / tokensLimit) * 100) : 0

  const getInitials = (name: string | null, email: string | null) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    if (email) return email[0].toUpperCase()
    return "U"
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 safe-area-inset-top">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="mb-10">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-100">Settings</h1>
            <p className="text-zinc-500 text-sm sm:text-base mt-1">Manage your account and preferences.</p>
          </div>

          <div className="space-y-6 sm:space-y-8">
            {/* Profile */}
            <section className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
                  <User className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-semibold text-zinc-100">Profile</h2>
                  <p className="text-xs text-zinc-500">Your account details</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-zinc-700 shrink-0">
                  <AvatarImage src={userData.photoURL || undefined} alt={userData.displayName || "User"} />
                  <AvatarFallback className="bg-zinc-800 text-zinc-300 text-xl">
                    {getInitials(userData.displayName, userData.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Display name</label>
                    <p className="text-zinc-100 font-medium mt-1 truncate">{userData.displayName || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="text-sm text-zinc-300 truncate">{userData.email || "—"}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Plan & usage */}
            <section className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-zinc-100">Plan & usage</h2>
                    <p className="text-xs text-zinc-500">Token usage this period</p>
                  </div>
                </div>
                <Link href="/pricing" className="shrink-0">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-9 text-xs">
                    Upgrade
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-400 capitalize">{userData.planName || "Free"} plan</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Tokens used</span>
                  <span className="text-zinc-300">
                    {userData.tokenUsage.used.toLocaleString()} / {tokensLimit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      tokenPercentage > 90 ? "bg-red-500" : tokenPercentage > 70 ? "bg-amber-500" : "bg-zinc-400"
                    }`}
                    style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Connected services */}
            <section className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
                  <SettingsIcon className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-semibold text-zinc-100">Connected services</h2>
                  <p className="text-xs text-zinc-500">Manage integrations from your projects</p>
                </div>
              </div>
              <p className="text-sm text-zinc-500">
                Connect GitHub, Netlify, and Supabase from the Integrations panel when you open a project.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function SettingsPage() {
  return (
    <ProtectedRoute requiredTokens={0}>
      <SettingsContent />
    </ProtectedRoute>
  )
}
