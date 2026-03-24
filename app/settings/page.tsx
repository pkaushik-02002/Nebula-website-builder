"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { Navbar } from "@/components/ui/navbar"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { db } from "@/lib/firebase"
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  FolderKanban,
  Loader2,
  Mail,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  User,
  XCircle,
} from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

type ProjectStatus = "pending" | "generating" | "complete" | "error"

type ProjectAnalyticsItem = {
  id: string
  prompt: string
  model?: string
  status: ProjectStatus
  createdAt?: any
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === "function") return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function SettingsContent() {
  const { user, userData, currentWorkspace, workspaces, loading } = useAuth()
  const [projectsData, setProjectsData] = useState<ProjectAnalyticsItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setProjectsData([])
      setProjectsLoading(false)
      return
    }

    setProjectsLoading(true)
    const q = query(collection(db, "projects"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ProjectAnalyticsItem[] = []
        snap.forEach((projectDoc) => {
          const data = projectDoc.data() as any
          next.push({
            id: projectDoc.id,
            prompt: data.prompt || "",
            model: data.model || "GPT-4-1 Mini",
            status: (data.status as ProjectStatus) || "pending",
            createdAt: data.createdAt,
          })
        })
        next.sort((a, b) => {
          const aTime = toDate(a.createdAt)?.getTime() ?? 0
          const bTime = toDate(b.createdAt)?.getTime() ?? 0
          return bTime - aTime
        })
        setProjectsData(next)
        setProjectsLoading(false)
      },
      (err) => {
        console.error("Failed to load settings analytics:", err)
        setProjectsLoading(false)
      }
    )

    return () => unsub()
  }, [user?.uid])

  const analytics = useMemo(() => {
    const total = projectsData.length
    const complete = projectsData.filter((p) => p.status === "complete").length
    const generating = projectsData.filter((p) => p.status === "generating").length
    const pending = projectsData.filter((p) => p.status === "pending").length
    const error = projectsData.filter((p) => p.status === "error").length

    const now = new Date()
    const monthProjects = projectsData.filter((p) => {
      const d = toDate(p.createdAt)
      return !!d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekProjects = projectsData.filter((p) => {
      const d = toDate(p.createdAt)
      return !!d && d >= weekAgo
    }).length

    const avgPromptLength =
      total > 0
        ? Math.round(
            projectsData.reduce((sum, p) => sum + (p.prompt?.trim().length || 0), 0) / total
          )
        : 0

    const modelCounts = projectsData.reduce<Record<string, number>>((acc, p) => {
      const key = (p.model || "GPT-4-1 Mini").trim()
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const topModels = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    const recentProjects = projectsData.slice(0, 5)

    return {
      total,
      complete,
      generating,
      pending,
      error,
      monthProjects,
      weekProjects,
      avgPromptLength,
      successRate: total > 0 ? Math.round((complete / total) * 100) : 0,
      topModels,
      recentProjects,
    }
  }, [projectsData])

  if (loading || !user || !userData) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
      </div>
    )
  }

  const remainingClamped = Math.max(0, userData.tokenUsage?.remaining ?? 0)
  const tokensLimit = Math.max(
    Number(userData.tokensLimit ?? 0),
    Number(userData.tokenUsage.used ?? 0) + remainingClamped
  )
  const tokenPercentage =
    tokensLimit > 0 ? Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100)) : 0
  const periodStart = userData.tokenUsage?.periodStart ? new Date(userData.tokenUsage.periodStart) : null
  const periodEnd = userData.tokenUsage?.periodEnd ? new Date(userData.tokenUsage.periodEnd) : null
  const createdAt = userData.createdAt ? new Date(userData.createdAt) : null
  const cycleDays =
    periodStart && periodEnd
      ? Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)))
      : 30
  const dailyAverage = Math.max(0, Math.round((userData.tokenUsage.used || 0) / cycleDays))
  const daysLeft =
    periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0
  const usageState =
    tokenPercentage >= 90 ? "High" : tokenPercentage >= 60 ? "Moderate" : "Healthy"
  const agentRunLimit = getAgentRunLimitForPlan(userData.planId, userData.agentRunLimit)
  const agentUsed = Math.max(0, Number(userData.agentUsage?.used ?? 0))
  const agentRemaining = Math.max(
    0,
    Number.isFinite(Number(userData.agentUsage?.remaining))
      ? Number(userData.agentUsage?.remaining)
      : agentRunLimit - agentUsed
  )

  const creditsRunwayDays = dailyAverage > 0 ? Math.floor(remainingClamped / dailyAverage) : null

  const getInitials = (name: string | null, email: string | null) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    if (email) return email[0].toUpperCase()
    return "U"
  }

  return (
    <main className="relative min-h-screen bg-[#f5f5f2] overflow-hidden">

      <Navbar />

      <div className="relative z-10 pt-24 pb-16 px-4 sm:px-6 lg:px-8 safe-area-inset-top">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <section className="rounded-3xl border border-zinc-200 bg-white px-5 py-8 sm:px-8 sm:py-10 shadow-[0_30px_100px_-60px_rgba(0,0,0,0.95)]">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-900">Settings</h1>
            <p className="text-zinc-500 text-sm sm:text-base mt-2">Manage your account, usage, and analytics.</p>
          </section>

          <div className="mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-300 flex items-center justify-center">
                    <User className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-zinc-900">Profile</h2>
                    <p className="text-xs text-zinc-500">Your account details</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-zinc-300 shrink-0">
                    <AvatarImage src={userData.photoURL || undefined} alt={userData.displayName || "User"} />
                    <AvatarFallback className="bg-zinc-100 text-zinc-700 text-xl">
                      {getInitials(userData.displayName, userData.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Display name</label>
                      <p className="text-zinc-900 font-medium mt-1 truncate">{userData.displayName || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-600">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="text-sm text-zinc-700 truncate">{userData.email || "-"}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-300 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-zinc-900">Account overview</h2>
                    <p className="text-xs text-zinc-500">Live metadata for your account</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">User ID</p>
                    <p className="mt-1 text-sm text-zinc-800 font-mono truncate">{userData.uid}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Member since</p>
                    <p className="mt-1 text-sm text-zinc-800">
                      {createdAt ? createdAt.toLocaleDateString() : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Current workspace</p>
                    <p className="mt-1 text-sm text-zinc-800 truncate">{currentWorkspace?.name || "Personal"}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Total workspaces</p>
                    <p className="mt-1 text-sm text-zinc-800">{Array.isArray(workspaces) ? workspaces.length : 0}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-300 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-zinc-900">Project analytics</h2>
                    <p className="text-xs text-zinc-500">Real-time project insights</p>
                  </div>
                </div>

                {projectsLoading ? (
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-4 text-sm text-zinc-600 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading analytics...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Projects</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-900">{analytics.total}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Success rate</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-900">{analytics.successRate}%</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">This month</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-900">{analytics.monthProjects}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Avg prompt</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-900">{analytics.avgPromptLength} chars</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-4 space-y-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500">Status breakdown</p>
                        {[
                          { label: "Completed", value: analytics.complete, color: "bg-emerald-500" },
                          { label: "Generating", value: analytics.generating, color: "bg-blue-500" },
                          { label: "Pending", value: analytics.pending, color: "bg-amber-500" },
                          { label: "Failed", value: analytics.error, color: "bg-red-500" },
                        ].map((item) => {
                          const ratio = analytics.total > 0 ? Math.round((item.value / analytics.total) * 100) : 0
                          return (
                            <div key={item.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-600">{item.label}</span>
                                <span className="text-zinc-700">{item.value}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                                <div className={`h-full ${item.color} rounded-full`} style={{ width: `${ratio}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-4 space-y-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500">Top models</p>
                        {analytics.topModels.length === 0 ? (
                          <p className="text-sm text-zinc-500">No model usage yet.</p>
                        ) : (
                          analytics.topModels.map(([model, count]) => (
                            <div key={model} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-700 truncate pr-2">{model}</span>
                              <span className="text-zinc-500">{count}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-4">
                      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Recent activity</p>
                      {analytics.recentProjects.length === 0 ? (
                        <p className="text-sm text-zinc-500">No recent project activity.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {analytics.recentProjects.map((project) => (
                            <div key={project.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm text-zinc-800 truncate">
                                  {project.prompt?.trim() ? project.prompt : "Untitled project"}
                                </p>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {toDate(project.createdAt)?.toLocaleDateString() || "Unknown date"}
                                </p>
                              </div>
                              <span className="text-[11px] uppercase tracking-wider text-zinc-600 shrink-0">
                                {project.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-300 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-zinc-900">Connected services</h2>
                    <p className="text-xs text-zinc-500">Manage integrations from your projects</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-500">
                  Connect GitHub, Netlify, and Supabase from the Integrations panel when you open a project.
                </p>
              </section>
            </div>

            <div className="lg:col-span-5">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 lg:sticky lg:top-24">
                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-300 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-zinc-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-heading text-lg font-semibold text-zinc-900 truncate">Plan & usage</h2>
                      <p className="text-xs text-zinc-500">Token usage this period</p>
                    </div>
                  </div>
                  <Link href="/pricing" className="shrink-0">
                    <Button size="sm" variant="outline" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 h-9 text-xs">
                      Upgrade
                    </Button>
                  </Link>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-600 capitalize">{userData.planName || "Free"} plan</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Tokens used</span>
                    <span className="text-zinc-700">
                      {userData.tokenUsage.used.toLocaleString()} / {tokensLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-zinc-800 transition-all" style={{ width: `${Math.min(tokenPercentage, 100)}%` }} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px] uppercase tracking-wider">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Billing cycle
                    </div>
                    <p className="mt-1 text-sm text-zinc-800">
                      {periodStart ? periodStart.toLocaleDateString() : "-"} - {periodEnd ? periodEnd.toLocaleDateString() : "-"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{daysLeft} days left</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px] uppercase tracking-wider">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Daily average
                    </div>
                    <p className="mt-1 text-sm text-zinc-800">{dailyAverage.toLocaleString()} tokens/day</p>
                    <p className="mt-1 text-xs text-zinc-500">Usage state: {usageState}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px] uppercase tracking-wider">
                      <Clock3 className="w-3.5 h-3.5" />
                      Remaining credits
                    </div>
                    <p className="mt-1 text-sm text-zinc-800">{remainingClamped.toLocaleString()} tokens</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Runway: {creditsRunwayDays === null ? "N/A" : `${creditsRunwayDays} days`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px] uppercase tracking-wider">
                      <FolderKanban className="w-3.5 h-3.5" />
                      Workspace context
                    </div>
                    <p className="mt-1 text-sm text-zinc-800 truncate">{currentWorkspace?.slug || "personal"}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-3 sm:col-span-2">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px] uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      Agents usage
                    </div>
                    <p className="mt-1 text-sm text-zinc-800">
                      {agentUsed.toLocaleString()} used · {agentRemaining.toLocaleString()} / {agentRunLimit.toLocaleString()} remaining
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {userData.agentUsage?.periodEnd
                        ? `Resets ${new Date(userData.agentUsage.periodEnd).toLocaleDateString()}`
                        : "Resets each billing period"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-200 bg-[#f5f5f2]/50 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Builder health</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between text-zinc-700">
                      <span className="inline-flex items-center gap-2 text-zinc-600"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Completed projects</span>
                      <span>{analytics.complete}</span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-700">
                      <span className="inline-flex items-center gap-2 text-zinc-600"><Activity className="w-4 h-4 text-blue-400" />Builds this week</span>
                      <span>{analytics.weekProjects}</span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-700">
                      <span className="inline-flex items-center gap-2 text-zinc-600"><XCircle className="w-4 h-4 text-red-400" />Failed projects</span>
                      <span>{analytics.error}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function AccountSettingsPage() {
  return (
    <ProtectedRoute requiredTokens={0}>
      <SettingsContent />
    </ProtectedRoute>
  )
}

