"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteDoc, doc } from "firebase/firestore"
import {
  LayoutGrid,
  Settings,
  Search,
  ChevronRight,
  Sparkles,
  Clock,
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
  Plus,
  Zap,
  ArrowRight,
  FolderOpen,
  Star,
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
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { PlanCard } from "@/components/ui/plan-card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

type CompanySetupForm = {
  companyName: string
  industry: string
  teamSize: string
  productFocus: string
  companyDescription: string
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
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Ready
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 ring-1 ring-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Error
      </span>
    )
  }
  if (status === "generating") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 ring-1 ring-blue-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        Building
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 ring-1 ring-zinc-200">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Queued
    </span>
  )
}

// Soft gradient placeholder thumbnails cycling through warm tones
const thumbnailGradients = [
  "from-amber-50 to-orange-100",
  "from-sky-50 to-blue-100",
  "from-violet-50 to-purple-100",
  "from-emerald-50 to-teal-100",
  "from-rose-50 to-pink-100",
  "from-yellow-50 to-amber-100",
]

function ProjectThumbnail({ index, status }: { index: number; status: ProjectStatus }) {
  const grad = thumbnailGradients[index % thumbnailGradients.length]
  return (
    <div className={cn("relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br", grad)}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, white 0%, transparent 60%)" }} />
      <Sparkles className="h-7 w-7 text-zinc-300" />
      {status === "generating" && (
        <div className="absolute bottom-0 left-0 h-0.5 w-full overflow-hidden rounded-b-xl bg-zinc-200">
          <div className="h-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue-400 to-transparent" style={{ backgroundSize: "200% 100%" }} />
        </div>
      )}
    </div>
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
  const [isCompanySetupOpen, setIsCompanySetupOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanySetupForm>({
    companyName: "",
    industry: "",
    teamSize: "",
    productFocus: "",
    companyDescription: "",
  })

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
    return projects.filter((p) => !q || (p.prompt || "").toLowerCase().includes(q))
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

  const updateCompanyField = (field: keyof CompanySetupForm, value: string) => {
    setCompanyForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateCompanyWorkspace = async () => {
    if (!user || !isTeamsPlan || isCreatingTeamWorkspace) return
    const missing =
      !companyForm.companyName.trim() ||
      !companyForm.industry.trim() ||
      !companyForm.productFocus.trim() ||
      !companyForm.teamSize.trim()
    if (missing) {
      setTeamWorkspaceError("Please complete all required company fields.")
      return
    }
    setIsCreatingTeamWorkspace(true)
    setTeamWorkspaceError(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: companyForm.companyName.trim(),
          workspaceType: "company",
          companyProfile: {
            companyName: companyForm.companyName.trim(),
            industry: companyForm.industry.trim(),
            teamSize: companyForm.teamSize.trim(),
            productFocus: companyForm.productFocus.trim(),
            companyDescription: companyForm.companyDescription.trim() || null,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not create company workspace")
      const workspaceId = json?.workspaceId
      const dashboardUrl =
        typeof json?.companyDashboardUrl === "string" && json.companyDashboardUrl.trim()
          ? json.companyDashboardUrl.trim()
          : workspaceId
            ? `/projects?workspace=${workspaceId}&view=company`
            : "/projects"
      setIsCompanySetupOpen(false)
      router.push(dashboardUrl)
    } catch (err) {
      setTeamWorkspaceError(err instanceof Error ? err.message : "Could not create company workspace")
    } finally {
      setIsCreatingTeamWorkspace(false)
    }
  }

  const activeCards = galleryTab === "recent" ? recentCards : galleryTab === "projects" ? workspaceCards : publicTemplateCards

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen bg-[linear-gradient(180deg,#f7f7f3_0%,#f1f1eb_100%)] text-zinc-900">

        {/* Sidebar backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm transition-all duration-300",
            isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />

        {/* ─── All Projects Sidebar ─── */}
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-zinc-200/80 bg-[#f9f9f6] shadow-2xl shadow-zinc-900/10 transition-transform duration-300 ease-in-out",
            isSidebarOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 bg-white/80 px-5 py-4 backdrop-blur-sm">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">All Projects</h2>
                <p className="text-xs text-zinc-500">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-lg p-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Search */}
            <div className="border-b border-zinc-200 px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="h-9 w-full rounded-lg border-zinc-200 bg-white pl-9 text-sm placeholder:text-zinc-400"
                />
              </div>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
              {(["Today", "Yesterday", "Previous"] as const).map((key) => {
                if (grouped[key].length === 0) return null
                return (
                  <div key={key} className="mb-6">
                    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{key}</p>
                    <div className="space-y-1.5">
                      {grouped[key].map((p) => (
                        <div
                          key={p.id}
                          className="group/item flex items-center gap-1 rounded-xl border border-zinc-200/80 bg-white transition-all hover:border-zinc-300 hover:shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => { router.push(`/project/${p.id}`); setIsSidebarOpen(false) }}
                            className="min-w-0 flex-1 px-3.5 py-3 text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-[13px] font-medium leading-snug text-zinc-800">
                                {projectTitle(p.prompt)}
                              </span>
                              <span className="shrink-0">{statusPill(p.status)}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                              <Clock className="h-3 w-3 shrink-0" />
                              {toDate(p.createdAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || "—"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(e, p.id)}
                            className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-xl text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/item:opacity-100"
                            aria-label={`Delete ${projectTitle(p.prompt)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {filtered.length === 0 && !projectsLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                    <FolderOpen className="h-5 w-5 text-zinc-400" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-zinc-700">No projects found</p>
                  <p className="mt-1 text-xs text-zinc-400">Try a different search term</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ─── Header ─── */}
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            {/* Logo */}
            <Link
              href="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all hover:border-zinc-300 hover:shadow"
            >
              <Sparkles className="h-4 w-4" />
            </Link>

            {/* Search — hidden on smallest screens, shown on sm+ */}
            <div className="hidden min-w-0 flex-1 sm:block">
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="h-9 w-full rounded-xl border-zinc-200 bg-zinc-50 pl-9 text-sm placeholder:text-zinc-400 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-9 items-center gap-2 border-zinc-200 bg-white text-sm text-zinc-600 shadow-sm hover:bg-zinc-50 sm:inline-flex"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-3.5 w-3.5" />
                All Projects
              </Button>

              {/* Mobile menu icon */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 border-zinc-200 bg-white p-0 sm:hidden"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-zinc-300"
                  >
                    <Avatar className="h-9 w-9 rounded-xl">
                      <AvatarImage src={user?.photoURL ?? undefined} alt="" className="object-cover" />
                      <AvatarFallback className="rounded-xl bg-zinc-100 text-sm font-medium text-zinc-600">
                        {user?.displayName?.slice(0, 1)?.toUpperCase() ?? user?.email?.slice(0, 1)?.toUpperCase() ?? <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-72 border-zinc-200 bg-white text-zinc-900 shadow-lg">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-3 py-1">
                      <Avatar className="h-9 w-9 rounded-xl border border-zinc-200">
                        <AvatarImage src={user?.photoURL ?? undefined} alt="" />
                        <AvatarFallback className="rounded-xl bg-zinc-100 text-sm text-zinc-600">
                          {user?.displayName?.slice(0, 1)?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-zinc-900">{user?.displayName ?? "User"}</span>
                        <span className="truncate text-xs text-zinc-500">{user?.email ?? ""}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-100" />
                  <div className="px-2 py-2">
                    <PlanCard />
                  </div>
                  <DropdownMenuSeparator className="bg-zinc-100" />
                  <DropdownMenuItem className="cursor-pointer gap-2 text-zinc-700 focus:bg-zinc-50" onClick={() => router.push("/pricing")}>
                    <CreditCard className="h-4 w-4" />
                    Billing & Plans
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2 text-zinc-700 focus:bg-zinc-50" onClick={() => router.push("/settings")}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-100" />
                  <DropdownMenuItem className="cursor-pointer gap-2 text-red-500 focus:bg-red-50 focus:text-red-500" onClick={() => signOut()}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">

          {/* ─── Hero Prompt Section ─── */}
          <section className="mx-auto w-full max-w-3xl text-center">
            {/* Greeting chip */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-500 shadow-sm">
              <Zap className="h-3 w-3 text-amber-500" />
              AI Website Builder
            </div>

            <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              What do you want to{" "}
              <span className="relative inline-block">
                build today
                <span className="absolute -bottom-1 left-0 h-0.5 w-full rounded-full bg-zinc-900/20" />
              </span>
              ?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-500 sm:text-base">
              Describe your idea in plain English — we'll turn it into a working app in seconds.
            </p>

            <div className="mt-8">
              <AnimatedAIInput />
            </div>

            {/* Quick-start suggestions */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {["Landing page", "Dashboard", "Portfolio", "Booking form", "Pricing page"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* ─── Mobile search bar ─── */}
          <div className="mt-8 sm:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-10 w-full rounded-xl border-zinc-200 bg-white pl-9 text-sm placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* ─── Projects Gallery ─── */}
          <section className="mt-10 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
            {/* Section header */}
            <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7">
              {/* Tabs */}
              <div className="inline-flex rounded-xl border border-zinc-100 bg-zinc-50 p-1">
                {[
                  { key: "templates", label: "Templates", icon: Star },
                  { key: "recent", label: "Recent", icon: Clock },
                  { key: "projects", label: "My Projects", icon: FolderOpen },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGalleryTab(key as typeof galleryTab)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                      galleryTab === key
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden xs:inline sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              {/* Scope toggle + browse all */}
              <div className="flex items-center gap-3">
                {isTeamsPlan && (
                  <div className="inline-flex rounded-lg border border-zinc-100 bg-zinc-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setScope("user")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        scope === "user" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      Mine
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("team")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        scope === "team" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      Team
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
                >
                  Browse all
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Error banner */}
            {projectsError && (
              <div className="mx-5 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 sm:mx-6">
                Failed to load some projects. {projectsError}
              </div>
            )}

            {/* Cards grid */}
            <div className="p-5 sm:p-6 lg:p-7">
              {projectsLoading ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-56 animate-pulse rounded-2xl border border-zinc-100 bg-zinc-50" />
                  ))}
                </div>
              ) : activeCards.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {activeCards.map((p, idx) => (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/project/${p.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          router.push(`/project/${p.id}`)
                        }
                      }}
                      className="group text-left outline-none"
                    >
                      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2">
                        {/* Thumbnail */}
                        <div className="relative overflow-hidden">
                          <ProjectThumbnail index={idx} status={p.status} />
                          {/* Delete overlay on hover */}
                          {galleryTab !== "templates" && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(e, p.id)}
                              className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-zinc-400 opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                              aria-label={`Delete ${projectTitle(p.prompt)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Card body */}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold leading-snug text-zinc-900">
                              {projectTitle(p.prompt)}
                            </p>
                            {statusPill(p.status)}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {/* Visibility */}
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200">
                              {p.visibility === "public" || p.visibility === "link-only" ? (
                                <><Globe className="h-2.5 w-2.5" />Public</>
                              ) : (
                                <><Lock className="h-2.5 w-2.5" />Private</>
                              )}
                            </span>

                            {/* Team badge */}
                            {scope === "team" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600 ring-1 ring-violet-200">
                                <Users className="h-2.5 w-2.5" />Team
                              </span>
                            )}

                            {/* Template tag */}
                            {galleryTab === "templates" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-200">
                                <Star className="h-2.5 w-2.5" />Template
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <Clock className="h-3 w-3 shrink-0" />
                            {toDate(p.createdAt)?.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: toDate(p.createdAt)?.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                            }) || "—"}
                            {p.workspaceName && scope === "team" && (
                              <span className="ml-auto truncate text-zinc-400">· {p.workspaceName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    {galleryTab === "templates" ? (
                      <Star className="h-6 w-6 text-zinc-400" />
                    ) : galleryTab === "recent" ? (
                      <Clock className="h-6 w-6 text-zinc-400" />
                    ) : (
                      <FolderOpen className="h-6 w-6 text-zinc-400" />
                    )}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-zinc-700">
                    {galleryTab === "templates"
                      ? "No public templates yet"
                      : galleryTab === "recent"
                        ? "No recently viewed projects"
                        : scope === "team"
                          ? "No team projects yet"
                          : "No projects yet"}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-xs text-xs text-zinc-400">
                    {galleryTab === "templates"
                      ? "Public projects you create will appear here automatically."
                      : scope === "team"
                        ? "Create a project or ask teammates to share with the workspace."
                        : "Use the prompt above to generate your first project."}
                  </p>
                  {galleryTab !== "templates" && (
                    <button
                      type="button"
                      onClick={() => document.getElementById("projects-create")?.scrollIntoView({ behavior: "smooth" })}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                    >
                      <Plus className="h-4 w-4" />
                      Create a project
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ─── Bottom cards row ─── */}
          <section className="mt-5 grid gap-4 md:grid-cols-2">

            {/* Company Workspace card */}
            <div className="group rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
                  <Users className="h-4.5 w-4.5 text-zinc-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">Company Workspace</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isTeamsPlan
                      ? "Create a shared workspace with team project starters."
                      : "Upgrade to Teams to unlock shared workspaces."}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {isTeamsPlan ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setScope("team")}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Team Projects
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 bg-zinc-900 text-xs text-white hover:bg-zinc-800"
                      onClick={() => setIsCompanySetupOpen(true)}
                      disabled={isCreatingTeamWorkspace}
                    >
                      {isCreatingTeamWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      New Company
                    </Button>
                  </div>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Upgrade to Teams
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
                {!isTeamsPlan && (
                  <p className="mt-2.5 text-[11px] text-zinc-400">Teams plan required</p>
                )}
                {teamWorkspaceError && (
                  <p className="mt-2 text-xs text-red-500">{teamWorkspaceError}</p>
                )}
              </div>
            </div>

            {/* Plan & Usage card */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
                  <Zap className="h-4.5 w-4.5 text-zinc-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">Plan & Usage</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isFreePlan ? "Free plan · Upgrade for more capacity" : `${planIdForDisplay(userData?.planId)} plan`}
                  </p>
                </div>
              </div>

              {/* Usage bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Token usage</span>
                  <span className="font-medium text-zinc-700">{tokenPercentage}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                    style={{ width: `${tokenPercentage}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Plan</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-zinc-800">
                    {isFreePlan ? "Free" : planIdForDisplay(userData?.planId)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Projects</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-800">{projects.length}</p>
                </div>
              </div>

              {isFreePlan && (
                <Link
                  href="/pricing"
                  className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                >
                  View plans
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </section>
        </main>

        {/* ─── Company Setup Dialog ─── */}
        <Dialog open={isCompanySetupOpen} onOpenChange={setIsCompanySetupOpen}>
          <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-lg">
            <DialogHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
                <Users className="h-5 w-5 text-zinc-600" />
              </div>
              <DialogTitle className="text-lg font-bold">Create company workspace</DialogTitle>
              <DialogDescription className="text-zinc-500">
                This workspace personalises the AI builder for your team and company context.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-1">
              <div className="grid gap-1.5">
                <label htmlFor="companyName" className="text-xs font-semibold text-zinc-700">
                  Company Name <span className="text-red-400">*</span>
                </label>
                <Input
                  id="companyName"
                  value={companyForm.companyName}
                  onChange={(e) => updateCompanyField("companyName", e.target.value)}
                  placeholder="Acme Inc."
                  className="border-zinc-200 bg-zinc-50 focus:bg-white"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor="industry" className="text-xs font-semibold text-zinc-700">
                    Industry <span className="text-red-400">*</span>
                  </label>
                  <select
                    id="industry"
                    value={companyForm.industry}
                    onChange={(e) => updateCompanyField("industry", e.target.value)}
                    className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:bg-white"
                  >
                    <option value="">Select industry</option>
                    <option value="SaaS">SaaS</option>
                    <option value="E-commerce">E-commerce</option>
                    <option value="Finance">Finance</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Education">Education</option>
                    <option value="Agency">Agency</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="teamSize" className="text-xs font-semibold text-zinc-700">
                    Team Size <span className="text-red-400">*</span>
                  </label>
                  <select
                    id="teamSize"
                    value={companyForm.teamSize}
                    onChange={(e) => updateCompanyField("teamSize", e.target.value)}
                    className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:bg-white"
                  >
                    <option value="">Select size</option>
                    <option value="Just me">Just me</option>
                    <option value="2-5">2–5</option>
                    <option value="6-20">6–20</option>
                    <option value="20+">20+</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="productFocus" className="text-xs font-semibold text-zinc-700">
                  What are you building? <span className="text-red-400">*</span>
                </label>
                <select
                  id="productFocus"
                  value={companyForm.productFocus}
                  onChange={(e) => updateCompanyField("productFocus", e.target.value)}
                  className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:bg-white"
                >
                  <option value="">Select focus</option>
                  <option value="SaaS product">SaaS product</option>
                  <option value="Marketing website">Marketing website</option>
                  <option value="Internal tool">Internal tool</option>
                  <option value="Mobile app">Mobile app</option>
                  <option value="AI tool">AI tool</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Optional</p>
                <div className="grid gap-1.5">
                  <label htmlFor="companyDescription" className="text-xs font-semibold text-zinc-700">Company Description</label>
                  <Textarea
                    id="companyDescription"
                    value={companyForm.companyDescription}
                    onChange={(e) => updateCompanyField("companyDescription", e.target.value)}
                    placeholder="Tell us about your company and goals…"
                    className="min-h-[80px] resize-none border-zinc-200 bg-white text-sm placeholder:text-zinc-400"
                  />
                </div>
              </div>

              {teamWorkspaceError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {teamWorkspaceError}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-zinc-200 text-zinc-700"
                onClick={() => setIsCompanySetupOpen(false)}
                disabled={isCreatingTeamWorkspace}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-zinc-900 text-white hover:bg-zinc-800"
                onClick={handleCreateCompanyWorkspace}
                disabled={isCreatingTeamWorkspace}
              >
                {isCreatingTeamWorkspace ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Creating…</>
                ) : (
                  <><Plus className="mr-2 h-3.5 w-3.5" />Create Workspace</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  )
}
