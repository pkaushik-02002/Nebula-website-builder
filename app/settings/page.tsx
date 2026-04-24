"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore"
import { deleteUser } from "firebase/auth"
import { useAuth } from "@/contexts/auth-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/firebase"
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal-content"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FolderOpen,
  Loader2,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"

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

function statusDot(status: ProjectStatus) {
  if (status === "complete") return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
  if (status === "generating") return <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
  if (status === "error") return <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
  return <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 shrink-0" />
}

function SettingsContent() {
  const router = useRouter()
  const { user, userData, currentWorkspace, workspaces, loading, signOut } = useAuth()
  const [projectsData, setProjectsData] = useState<ProjectAnalyticsItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  useEffect(() => {
    if (!user?.uid) {
      setProjectsData([])
      setProjectsLoading(false)
      return
    }
    setProjectsLoading(true)
    const q = query(collection(db, "projects"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const next: ProjectAnalyticsItem[] = []
      snap.forEach((d) => {
        const data = d.data() as any
        next.push({
          id: d.id,
          prompt: data.prompt || "",
          model: data.model || "GPT-4-1 Mini",
          status: (data.status as ProjectStatus) || "pending",
          createdAt: data.createdAt,
        })
      })
      next.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
      setProjectsData(next)
      setProjectsLoading(false)
    }, (err) => {
      console.error("Settings analytics error:", err)
      setProjectsLoading(false)
    })
    return () => unsub()
  }, [user?.uid])

  const analytics = useMemo(() => {
    const total = projectsData.length
    const complete = projectsData.filter((p) => p.status === "complete").length
    const generating = projectsData.filter((p) => p.status === "generating").length
    const error = projectsData.filter((p) => p.status === "error").length
    const now = new Date()
    const monthProjects = projectsData.filter((p) => {
      const d = toDate(p.createdAt)
      return !!d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const weekProjects = projectsData.filter((p) => { const d = toDate(p.createdAt); return !!d && d >= weekAgo }).length
    return { total, complete, generating, error, monthProjects, weekProjects,
      successRate: total > 0 ? Math.round((complete / total) * 100) : 0,
      recentProjects: projectsData.slice(0, 6),
    }
  }, [projectsData])

  if (loading || !user || !userData) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  const remainingClamped = Math.max(0, userData.tokenUsage?.remaining ?? 0)
  const tokensLimit = Math.max(Number(userData.tokensLimit ?? 0), Number(userData.tokenUsage.used ?? 0) + remainingClamped)
  const tokenPct = tokensLimit > 0 ? Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100)) : 0
  const periodEnd = userData.tokenUsage?.periodEnd ? new Date(userData.tokenUsage.periodEnd) : null
  const periodStart = userData.tokenUsage?.periodStart ? new Date(userData.tokenUsage.periodStart) : null
  const daysLeft = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86400000)) : 0
  const cycleDays = periodStart && periodEnd ? Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000)) : 30
  const dailyAvg = Math.max(0, Math.round((userData.tokenUsage.used || 0) / cycleDays))
  const createdAt = userData.createdAt ? new Date(userData.createdAt) : null
  const isFreePlan = !userData.planId || userData.planId === "free"

  const getInitials = (name: string | null, email: string | null) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    if (email) return email[0].toUpperCase()
    return "U"
  }

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== userData.email) return
    setDeleteLoading(true)
    setDeleteError("")
    try {
      // Delete user Firestore doc
      await deleteDoc(doc(db, "users", user.uid))
      // Delete Firebase Auth account
      await deleteUser(user)
      router.push("/")
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        setDeleteError("For security, please sign out and sign back in before deleting your account.")
      } else {
        setDeleteError(`Failed to delete account. Please try again or contact ${LEGAL_CONTACT_EMAIL}.`)
      }
      setDeleteLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2]">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-[#f5f5f2]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <Link href="/" className="text-[15px] font-semibold text-zinc-900">lotus.build</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/projects" className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50">
              Projects
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition-colors hover:text-red-500"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Profile hero ── */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="h-20 bg-[linear-gradient(135deg,#f0efe9_0%,#e8e6de_100%)]" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <Avatar className="-mt-10 h-16 w-16 rounded-2xl border-2 border-white shadow-md sm:h-20 sm:w-20">
                  <AvatarImage src={userData.photoURL || undefined} alt={userData.displayName || "User"} />
                  <AvatarFallback className="rounded-2xl bg-zinc-100 text-lg font-semibold text-zinc-700">
                    {getInitials(userData.displayName, userData.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="pb-0.5">
                  <h1 className="text-xl font-semibold text-zinc-900">{userData.displayName || "Account"}</h1>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
                    <Mail className="h-3.5 w-3.5" />
                    {userData.email}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
                  <Sparkles className="h-3 w-3" />
                  {userData.planName || "Free"} plan
                </span>
                {createdAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-500">
                    <CalendarDays className="h-3 w-3" />
                    Since {createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stat row ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total projects", value: projectsLoading ? "—" : analytics.total, icon: FolderOpen },
            { label: "This month", value: projectsLoading ? "—" : analytics.monthProjects, icon: TrendingUp },
            { label: "Success rate", value: projectsLoading ? "—" : `${analytics.successRate}%`, icon: CheckCircle2 },
            { label: "Tokens left", value: remainingClamped.toLocaleString(), icon: Coins },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{label}</p>
                <Icon className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">

          {/* ── Left column ── */}
          <div className="space-y-6">

            {/* Token usage */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100">
                    <Zap className="h-4 w-4 text-zinc-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">Token usage</h2>
                    <p className="text-xs text-zinc-500">Current billing period</p>
                  </div>
                </div>
                {isFreePlan && (
                  <Link href="/pricing" className="rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700">
                    Upgrade
                  </Link>
                )}
              </div>

              <div className="mb-3 flex items-end justify-between">
                <div>
                  <span className="text-3xl font-bold text-zinc-900">{tokenPct}%</span>
                  <span className="ml-2 text-sm text-zinc-500">used</span>
                </div>
                <span className="text-xs text-zinc-400">
                  {userData.tokenUsage.used.toLocaleString()} / {tokensLimit.toLocaleString()}
                </span>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full transition-all ${tokenPct >= 90 ? "bg-red-500" : tokenPct >= 60 ? "bg-amber-500" : "bg-zinc-800"}`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-zinc-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">Remaining</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">{remainingClamped.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">Daily avg</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">{dailyAvg.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">Days left</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">{daysLeft}</p>
                </div>
              </div>
            </div>

            {/* Project analytics */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100">
                  <BarChart3 className="h-4 w-4 text-zinc-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">Build analytics</h2>
                  <p className="text-xs text-zinc-500">Project status breakdown</p>
                </div>
              </div>

              {projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Completed", value: analytics.complete, total: analytics.total, color: "bg-emerald-500" },
                    { label: "Generating", value: analytics.generating, total: analytics.total, color: "bg-blue-500" },
                    { label: "Failed", value: analytics.error, total: analytics.total, color: "bg-red-400" },
                  ].map((item) => {
                    const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0
                    return (
                      <div key={item.label}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-zinc-600">{item.label}</span>
                          <span className="font-medium text-zinc-700">{item.value} <span className="font-normal text-zinc-400">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">

            {/* Account details */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100">
                  <ShieldCheck className="h-4 w-4 text-zinc-600" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-900">Account</h2>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl bg-zinc-50 px-3.5 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">User ID</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-zinc-700">{userData.uid}</p>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3.5 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Workspace</p>
                  <p className="mt-0.5 text-sm text-zinc-800">{currentWorkspace?.name || "Personal"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-50 px-3.5 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">Workspaces</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-800">{Array.isArray(workspaces) ? workspaces.length : 0}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-3.5 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">This week</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-800">{analytics.weekProjects}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent projects */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100">
                    <Activity className="h-4 w-4 text-zinc-600" />
                  </div>
                  <h2 className="text-sm font-semibold text-zinc-900">Recent builds</h2>
                </div>
                <Link href="/projects" className="text-xs text-zinc-400 transition-colors hover:text-zinc-700">
                  View all
                </Link>
              </div>

              {projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : analytics.recentProjects.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <FolderOpen className="h-8 w-8 text-zinc-200" />
                  <p className="mt-2 text-sm text-zinc-400">No projects yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {analytics.recentProjects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/project/${p.id}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50"
                    >
                      {statusDot(p.status)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-zinc-800">
                          {p.prompt?.trim() || "Untitled project"}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {toDate(p.createdAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || "—"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">Quick links</h2>
              <div className="space-y-1">
                {[
                  { label: "Billing & plans", href: "/pricing", icon: CreditCard },
                  { label: "Your projects", href: "/projects", icon: FolderOpen },
                  { label: "Help & docs", href: "/help", icon: Settings },
                ].map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Icon className="h-4 w-4 text-zinc-400" />
                    {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Danger zone ── */}
        <div className="mt-6 rounded-2xl border border-red-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Delete account</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Delete your login and account profile. This action is permanent and may not automatically remove every related project, workspace, deployment, or integration record.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setDeleteDialogOpen(true); setDeleteConfirmText(""); setDeleteError("") }}
              className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete confirmation dialog ── */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            onClick={() => !deleteLoading && setDeleteDialogOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl shadow-zinc-900/20">
            {/* Header */}
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Delete your account</h3>
                <p className="mt-0.5 text-sm text-zinc-500">This action is permanent and cannot be reversed.</p>
              </div>
            </div>

            {/* Warning list */}
            <div className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-red-600">
                This action removes:
              </p>
              <ul className="space-y-1.5 text-sm text-red-700">
                {[
                  "Your lotus.build sign-in access",
                  "Your user profile record for this account",
                  "Direct access to account-level settings tied to this login",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-red-600">
                Related projects, workspaces, deployment records, connected-service metadata, billing records, or operational logs may remain until separately deleted or removed through retention processes.
              </p>
            </div>

            {/* Confirmation input */}
            <div className="mb-5">
              <label className="mb-2 block text-sm text-zinc-700">
                Type <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-800">{userData.email}</span> to confirm
              </label>
              <Input
                type="email"
                value={deleteConfirmText}
                onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError("") }}
                placeholder={userData.email ?? "your@email.com"}
                className="h-10 rounded-xl border-zinc-200 bg-zinc-50 text-sm focus:bg-white"
                disabled={deleteLoading}
                autoComplete="off"
              />
            </div>

            {deleteError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {deleteError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== userData.email || deleteLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleteLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Deleting…</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" />Delete my account</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AccountSettingsPage() {
  return (
    <ProtectedRoute requiredTokens={0}>
      <SettingsContent />
    </ProtectedRoute>
  )
}
