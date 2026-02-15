"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteDoc, doc } from "firebase/firestore"
import {
  LayoutGrid,
  Compass,
  FileText,
  Settings,
  Search,
  ChevronRight,
  Sparkles,
  Clock,
  PanelLeft,
  Menu,
  X,
  Trash2,
  LogOut,
  User,
  CreditCard,
  Users,
  Loader2,
  Globe,
  Lock,
} from "lucide-react"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { useAuth } from "@/contexts/auth-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { PlanCard } from "@/components/ui/plan-card"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"
import { planIdForDisplay } from "@/lib/plans"
import { useProjectList } from "@/hooks/use-project-list"

type ProjectStatus = "pending" | "generating" | "complete" | "error"

type ProjectSummary = {
  id: string
  prompt: string
  model?: string
  status: ProjectStatus
  visibility?: "public" | "private" | "link-only"
  createdAt?: any
  updatedAt?: any
  sandboxUrl?: string
  workspaceId?: string
  workspaceName?: string
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === "function") return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sectionLabel(d: Date | null): "Today" | "Yesterday" | "Previous" {
  if (!d) return "Previous"
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (d >= startOfToday) return "Today"
  if (d >= startOfYesterday) return "Yesterday"
  return "Previous"
}

function projectTitle(prompt: string): string {
  const trimmed = (prompt || "").trim()
  if (!trimmed) return "Untitled project"
  return trimmed.length > 52 ? `${trimmed.slice(0, 52)}...` : trimmed
}

function statusPill(status: ProjectStatus) {
  const base =
    "text-[10px] font-medium px-2.5 py-1 rounded-full border shrink-0 whitespace-nowrap"
  if (status === "complete") {
    return (
      <span className={cn(base, "bg-emerald-500/10 border-emerald-500/30 text-emerald-400")}>
        Ready
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className={cn(base, "bg-red-500/10 border-red-500/30 text-red-400")}>
        Error
      </span>
    )
  }
  if (status === "generating") {
    return (
      <span className={cn(base, "bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse")}>
        Building
      </span>
    )
  }
  return (
    <span className={cn(base, "bg-zinc-100 border-zinc-300 text-zinc-600")}>
      Queued
    </span>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const { user, userData, signOut } = useAuth()

  const remainingClamped = userData ? Math.max(0, userData.tokenUsage?.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingClamped : 0
  const tokenPercentage =
    userData && tokensLimit > 0
      ? Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100))
      : 0
  const isFreePlan = !userData?.planId || userData.planId === "free"
  const isTeamsPlan = !!userData?.planId && planIdForDisplay(userData.planId) === "team"

  const [scope, setScope] = useState<"user" | "team">("user")
  const [galleryTab, setGalleryTab] = useState<"recent" | "projects" | "templates">("templates")
  const [search, setSearch] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCreatingTeamWorkspace, setIsCreatingTeamWorkspace] = useState(false)
  const [teamWorkspaceError, setTeamWorkspaceError] = useState<string | null>(null)

  // Open sidebar by default on lg+ screens
  useEffect(() => {
    const isLg = typeof window !== "undefined" && window.innerWidth >= 1024
    if (isLg) setIsSidebarOpen(true)
  }, [])

  useEffect(() => {
    if (!isTeamsPlan && scope === "team") setScope("user")
  }, [isTeamsPlan, scope])

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) return {}
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }, [user])

  const { projects, loading: projectsLoading, error: projectsError } = useProjectList({
    scope,
    uid: user?.uid ?? null,
    workspaceId: scope === "team" ? userData?.currentWorkspaceId || null : null,
    getAuthHeader,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      const matchesQuery = !q || (p.prompt || "").toLowerCase().includes(q)
      return matchesQuery
    })
  }, [projects, search])

  const grouped = useMemo(() => {
    const result: Record<"Today" | "Yesterday" | "Previous", ProjectSummary[]> = {
      Today: [],
      Yesterday: [],
      Previous: [],
    }
    for (const p of filtered) {
      const d = toDate(p.createdAt)
      result[sectionLabel(d)].push(p)
    }
    return result
  }, [filtered])

  const workspaceCards = useMemo(() => filtered.slice(0, 6), [filtered])
  const recentCards = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => {
          const aTs = toDate(a.updatedAt || a.createdAt)?.getTime() ?? 0
          const bTs = toDate(b.updatedAt || b.createdAt)?.getTime() ?? 0
          return bTs - aTs
        })
        .slice(0, 8),
    [filtered]
  )
  const publicTemplateCards = useMemo(
    () =>
      [...projects]
        .filter((p) => p.visibility === "public")
        .sort((a, b) => {
          const aTs = toDate(a.updatedAt || a.createdAt)?.getTime() ?? 0
          const bTs = toDate(b.updatedAt || b.createdAt)?.getTime() ?? 0
          return bTs - aTs
        })
        .slice(0, 12),
    [projects]
  )

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteDoc(doc(db, "projects", projectId))
    } catch (err) {
      console.error("Failed to delete project:", err)
    }
  }

  const handleCreateTeamWorkspace = async () => {
    if (!user || !isTeamsPlan || isCreatingTeamWorkspace) return
    setIsCreatingTeamWorkspace(true)
    setTeamWorkspaceError(null)
    try {
      const token = await user.getIdToken()
      const suggestedName =
        userData?.displayName?.trim()
          ? `${userData.displayName.split(" ")[0]}'s Team`
          : "Team Workspace"
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: suggestedName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || "Could not create workspace")
      }
      const workspaceId = json?.workspaceId
      if (workspaceId) {
        router.push(`/projects?workspace=${workspaceId}`)
      }
    } catch (err) {
      setTeamWorkspaceError(err instanceof Error ? err.message : "Could not create workspace")
    } finally {
      setIsCreatingTeamWorkspace(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#f7f7f3_0%,#f1f1eb_100%)] text-zinc-900 lg:flex-row">

        {/* Left icon rail (desktop) */}
        <aside className="relative z-20 hidden h-screen w-16 shrink-0 flex-col items-center gap-4 border-r border-zinc-200/80 bg-white/70 px-3 py-5 backdrop-blur-sm lg:flex">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Sparkles className="h-5 w-5" />
          </Link>

          <div className="flex flex-col gap-1.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-900 text-white"
              title="Projects"
            >
              <LayoutGrid className="h-4 w-4" />
            </span>
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-700"
              title="Home"
            >
              <Compass className="h-4 w-4" />
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-700"
              title="Templates"
            >
              <FileText className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 transition-colors hover:border-zinc-300 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                aria-label="User menu"
              >
                <Avatar className="h-10 w-10 rounded-xl">
                  <AvatarImage
                    src={user?.photoURL ?? undefined}
                    alt={user?.displayName ?? undefined}
                    className="object-cover"
                  />
                  <AvatarFallback className="rounded-xl bg-zinc-100 text-sm font-medium text-zinc-700">
                    {user?.displayName?.slice(0, 1)?.toUpperCase() ??
                      user?.email?.slice(0, 1)?.toUpperCase() ?? (
                        <User className="h-4 w-4" />
                      )}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="right"
              align="end"
              sideOffset={8}
              className="w-72 border-zinc-200 bg-white text-zinc-900"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="h-9 w-9 rounded-lg border border-zinc-300">
                    <AvatarImage src={user?.photoURL ?? undefined} alt="" />
                    <AvatarFallback className="rounded-lg bg-zinc-100 text-sm text-zinc-700">
                      {user?.displayName?.slice(0, 1)?.toUpperCase() ??
                        user?.email?.slice(0, 1)?.toUpperCase() ??
                        "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {user?.displayName ?? "User"}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator className="bg-zinc-100" />

              <div className="px-2 py-3">
                <PlanCard />
              </div>

              <DropdownMenuSeparator className="bg-zinc-100" />

              <DropdownMenuItem
                className="cursor-pointer text-zinc-700 focus:bg-zinc-100 focus:text-zinc-900"
                onClick={() => router.push("/pricing")}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Billing & plans
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-zinc-700 focus:bg-zinc-100 focus:text-zinc-900"
                onClick={() => router.push("/settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-100" />

              <DropdownMenuItem
                className="cursor-pointer text-red-400 focus:bg-zinc-100 focus:text-red-400"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </aside>

        {/* Mobile sidebar backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-30 bg-zinc-900/20 transition-opacity duration-300 lg:hidden",
            isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />

        {/* Projects sidebar (mobile overlay, desktop inline) */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex h-full min-h-0 flex-col border-r border-zinc-200 bg-[#f5f5f2]/95 backdrop-blur-sm transition-transform duration-300 ease-out lg:relative lg:z-10 lg:w-80 lg:bg-white/60",
            isSidebarOpen
              ? "w-full max-w-[330px] translate-x-0 lg:max-w-none"
              : "-translate-x-full lg:translate-x-0 lg:w-80"
          )}
        >
          <div className="flex h-full min-h-0 flex-col">
            {/* Sidebar header */}
            <div className="shrink-0 border-b border-zinc-200 bg-white/70 px-4 py-3 lg:px-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Your Projects
                </h2>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:hidden"
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sidebar search */}
            <div className="shrink-0 bg-white/40 px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="h-10 w-full rounded-xl border-zinc-200 bg-white pl-9 text-sm text-zinc-800 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
                />
              </div>
            </div>

            {/* Project list */}
            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-1">
              {(["Today", "Yesterday", "Previous"] as const).map((key) => (
                <div key={key} className="space-y-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    {key}
                  </div>
                  <div className="space-y-1.5">
                    {grouped[key].length === 0 ? (
                      <p className="py-2 text-xs text-zinc-600">No projects</p>
                    ) : (
                      grouped[key].map((p) => (
                        <div
                          key={p.id}
                          className="group/item flex items-stretch gap-1 rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/project/${p.id}`)
                              setIsSidebarOpen(false)
                            }}
                            className="min-w-0 flex-1 px-3 py-2.5 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm text-zinc-800 group-hover/item:text-zinc-900">
                                {projectTitle(p.prompt)}
                              </span>
                              {statusPill(p.status)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                              <Clock className="h-3 w-3 shrink-0" />
                              {toDate(p.createdAt)?.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              }) || "—"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(e, p.id)}
                            className="flex w-8 shrink-0 items-center justify-center rounded-r-xl text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            aria-label={`Delete ${projectTitle(p.prompt)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pro Access bottom card */}
            <div className="shrink-0 border-t border-zinc-200 bg-white/50 px-4 pb-4 pt-3">
              <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-[#f8f8f4] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900">
                      Pro Access
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      More tokens, faster builds.
                    </div>
                  </div>
                  <Sparkles className="h-5 w-5 shrink-0 text-zinc-500" />
                </div>
                <Link
                  href="/pricing"
                  className="mt-4 flex w-full items-center justify-center rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
                >
                  Upgrade
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="relative z-10 flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/70 px-4 backdrop-blur-sm sm:px-6">
            {/* Desktop sidebar toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="hidden h-9 w-9 rounded-lg p-0 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:inline-flex"
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>

            {/* Mobile projects menu */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex h-9 w-9 items-center justify-center rounded-lg p-0 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open projects"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Top search (mirrors sidebar search, but nice on wide screens) */}
            <div className="min-w-0 flex-1">
              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="h-9 w-full rounded-lg border-zinc-200 bg-white pl-9 text-sm text-zinc-800 placeholder:text-zinc-500"
                />
              </div>
            </div>
          </header>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
              {/* Hero */}
              <section className="px-1 py-2 text-center sm:py-3">
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl lg:text-4xl">
                  What do you want to create?
                </h1>
                <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500 sm:text-base">
                  Describe your idea. We'll generate the app.
                </p>
              </section>

              {/* Main input */}
              <div
                id="projects-create"
                className="mt-6 flex justify-center sm:mt-8"
              >
                <AnimatedAIInput />
              </div>

              <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:mt-8 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">Team Workspace</p>
                    <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                      {isTeamsPlan
                        ? "Collaborate with your team in a shared workspace."
                        : "Upgrade to Teams to unlock shared workspaces and team projects."}
                    </p>
                  </div>
                  {isTeamsPlan ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                        onClick={() => setScope("team")}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        View Team Projects
                      </Button>
                      <Button
                        type="button"
                        className="h-9 bg-zinc-900 text-white hover:bg-black"
                        onClick={handleCreateTeamWorkspace}
                        disabled={isCreatingTeamWorkspace}
                      >
                        {isCreatingTeamWorkspace ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                        Create Team Workspace
                      </Button>
                    </div>
                  ) : (
                    <Link
                      href="/pricing"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-black"
                    >
                      Upgrade to Teams
                    </Link>
                  )}
                </div>
                {!isTeamsPlan && (
                  <div className="mt-3 inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                    Teams plan required for shared workspaces
                  </div>
                )}
                {teamWorkspaceError && (
                  <p className="mt-3 text-xs text-red-600">{teamWorkspaceError}</p>
                )}
              </section>

              {isTeamsPlan && (
                <div className="mt-8 flex justify-center sm:mt-10">
                  <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setScope("user")}
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm transition-colors",
                        scope === "user"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      My Projects
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("team")}
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm transition-colors",
                        scope === "team"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      Team Projects
                    </button>
                  </div>
                </div>
              )}

              {/* Workspace section */}
              <section className="mt-10 rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_-60px_rgba(0,0,0,0.9)] sm:mt-14 sm:p-6 lg:p-8">
                {projectsError && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load some projects. {projectsError}
                  </div>
                )}
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex rounded-xl border border-zinc-200 bg-[#fbfbf8] p-1">
                    {[
                      { key: "recent", label: "Recently viewed" },
                      { key: "projects", label: "My projects" },
                      { key: "templates", label: "Templates" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setGalleryTab(tab.key as "recent" | "projects" | "templates")}
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm transition-colors",
                          galleryTab === tab.key
                            ? "border border-zinc-200 bg-white text-zinc-900 shadow-sm"
                            : "text-zinc-600 hover:text-zinc-900"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-800"
                  >
                    Browse all
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Workspace cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
                  {projectsLoading && (
                    <div className="col-span-full rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500">
                      Loading projects...
                    </div>
                  )}
                  {galleryTab === "templates" &&
                    publicTemplateCards.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => router.push(`/project/${p.id}`)}
                        className="text-left outline-none"
                      >
                        <Card className="group h-full rounded-2xl border border-zinc-200 bg-white shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f2]">
                          <CardContent className="p-4">
                            <div className="h-28 rounded-xl border border-zinc-200 bg-zinc-100 sm:h-32" />
                            <p className="mt-3 truncate text-base font-medium text-zinc-900">{projectTitle(p.prompt)}</p>
                            <p className="mt-1 text-sm text-zinc-500">
                              {p.workspaceName || "Public Project"}
                            </p>
                          </CardContent>
                        </Card>
                      </button>
                    ))}
                  {galleryTab !== "templates" && (galleryTab === "recent" ? recentCards : workspaceCards).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => router.push(`/project/${p.id}`)}
                      className="text-left outline-none"
                    >
                      <Card className="group h-full rounded-2xl border border-zinc-200 bg-white shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f2]">
                        <CardContent className="p-4 sm:p-5">
                          <div className="h-24 rounded-xl border border-zinc-200 bg-zinc-100 sm:h-28" />
                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-zinc-900">
                                {projectTitle(p.prompt)}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span className="truncate">{p.model || "AI"}</span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
                                  {p.visibility === "public" || p.visibility === "link-only" ? (
                                    <>
                                      <Globe className="h-3 w-3" />
                                      Public
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3 w-3" />
                                      Private
                                    </>
                                  )}
                                </span>
                                {scope === "team" && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
                                    <Users className="h-3 w-3" />
                                    Team Project
                                  </span>
                                )}
                              </div>
                            </div>
                            {statusPill(p.status)}
                          </div>
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <Clock className="h-3 w-3 shrink-0" />
                            {toDate(p.createdAt)?.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year:
                                toDate(p.createdAt)?.getFullYear() !==
                                new Date().getFullYear()
                                  ? "numeric"
                                  : undefined,
                            }) || "—"}
                          </div>
                          {scope === "team" && (
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Workspace: {p.workspaceName || "Team Workspace"}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>

                {/* Empty state */}
                {!projectsLoading && galleryTab !== "templates" && (galleryTab === "recent" ? recentCards.length === 0 : workspaceCards.length === 0) && (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center sm:mt-6 sm:p-10">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100">
                      <LayoutGrid className="h-6 w-6 text-zinc-500" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-800">
                      {galleryTab === "recent" ? "No recently viewed projects yet" : scope === "team" ? "No team projects yet" : "No projects yet"}
                    </p>
                    <p className="mt-1 mx-auto max-w-sm text-xs text-zinc-500">
                      {scope === "team"
                        ? "No team projects yet — create one or ask your teammates to share."
                        : "Use the prompt above to create your first project."}
                    </p>
                  </div>
                )}
                {!projectsLoading && galleryTab === "templates" && publicTemplateCards.length === 0 && (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center sm:mt-6 sm:p-10">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100">
                      <LayoutGrid className="h-6 w-6 text-zinc-500" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-800">
                      No public templates yet
                    </p>
                    <p className="mt-1 mx-auto max-w-sm text-xs text-zinc-500">
                      Public projects will appear here automatically.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}

