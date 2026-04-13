"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteDoc, doc } from "firebase/firestore"
import {
  Settings,
  Search,
  Clock,
  Menu,
  X,
  Trash2,
  LogOut,
  User,
  Users,
  Globe,
  Lock,
  FolderOpen,
  CreditCard,
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

export default function ProjectsPage() {
  const router = useRouter()
  const { user, userData, signOut } = useAuth()

  const isTeamsPlan = !!userData?.planId && planIdForDisplay(userData.planId) === "team"

  const [scope, setScope] = useState<"user" | "team">("user")
  const [search, setSearch] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    if (!isTeamsPlan && scope === "team") setScope("user")
  }, [isTeamsPlan, scope])

  useEffect(() => {
    setHasMounted(true)
    setIsSidebarOpen(false)
  }, [])

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

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteDoc(doc(db, "projects", projectId))
    } catch (err) {
      console.error("Failed to delete project:", err)
    }
  }

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen bg-[#f5f5f2] text-zinc-900">

        {/* Sidebar backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm duration-300",
            hasMounted && "transition-all",
            isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />

        {/* ─── Sidebar ─── */}
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-zinc-200 bg-[#f5f5f2] shadow-2xl shadow-zinc-900/10 duration-300 ease-in-out",
            hasMounted && "transition-transform"
          )}
          style={{ transform: isSidebarOpen ? "translateX(0)" : "translateX(100%)" }}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">All Projects</h2>
                <p className="text-xs text-zinc-500">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-lg p-0 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

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
                          className="group/item flex items-center gap-1 rounded-xl border border-zinc-200 bg-white transition-all hover:border-zinc-300 hover:shadow-sm"
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
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-[#f5f5f2]/80 backdrop-blur-md">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="shrink-0 text-[15px] font-semibold text-zinc-900">
              Lotus.build
            </Link>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-9 w-full rounded-xl border-zinc-200 bg-white/70 pl-9 text-sm placeholder:text-zinc-400 focus:bg-white"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm transition-all hover:border-zinc-300"
                >
                  <Avatar className="h-8 w-8 rounded-full">
                    <AvatarImage src={user?.photoURL ?? undefined} alt="" className="object-cover" />
                    <AvatarFallback className="rounded-full bg-zinc-100 text-sm font-medium text-zinc-600">
                      {user?.displayName?.slice(0, 1)?.toUpperCase() ?? user?.email?.slice(0, 1)?.toUpperCase() ?? <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-64 border-zinc-200 bg-white text-zinc-900 shadow-lg">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-3 py-1">
                    <Avatar className="h-8 w-8 rounded-full border border-zinc-200">
                      <AvatarImage src={user?.photoURL ?? undefined} alt="" />
                      <AvatarFallback className="rounded-full bg-zinc-100 text-sm text-zinc-600">
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
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">

          {/* ─── Hero ─── */}
          <section className="mx-auto w-full max-w-2xl text-center">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.6rem]">
              What do you want to build today?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500 sm:text-[15px]">
              Describe your idea in plain English — we'll turn it into a working app in seconds.
            </p>

            <div className="mt-7">
              <AnimatedAIInput />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {["Landing page", "Dashboard", "Portfolio", "Booking form", "Pricing page"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* ─── Projects ─── */}
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-zinc-900">Your Projects</h2>
                {isTeamsPlan && (
                  <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setScope("user")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        scope === "user" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      Mine
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("team")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        scope === "team" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      <Users className="mr-1 inline h-3 w-3" />
                      Team
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-800"
              >
                <Menu className="h-3.5 w-3.5" />
                All
              </button>
            </div>

            {projectsError && (
              <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                Failed to load projects. {projectsError}
              </div>
            )}

            {projectsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl border border-zinc-200 bg-white" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/50 px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                  <FolderOpen className="h-5 w-5 text-zinc-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-700">No projects yet</p>
                <p className="mt-1 text-xs text-zinc-400">Use the prompt above to generate your first project.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(["Today", "Yesterday", "Previous"] as const).map((key) => {
                  if (grouped[key].length === 0) return null
                  return (
                    <div key={key}>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{key}</p>
                      <div className="space-y-1.5">
                        {grouped[key].map((p) => (
                          <div
                            key={p.id}
                            className="group/item flex items-center rounded-xl border border-zinc-200 bg-white transition-all hover:border-zinc-300 hover:shadow-sm"
                          >
                            <button
                              type="button"
                              onClick={() => router.push(`/project/${p.id}`)}
                              className="min-w-0 flex-1 px-4 py-3.5 text-left"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-[13px] font-medium text-zinc-900">
                                  {projectTitle(p.prompt)}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                  {statusPill(p.status)}
                                  <span className="hidden items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200 sm:inline-flex">
                                    {p.visibility === "public" || p.visibility === "link-only" ? (
                                      <><Globe className="h-2.5 w-2.5" />Public</>
                                    ) : (
                                      <><Lock className="h-2.5 w-2.5" />Private</>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                                <Clock className="h-3 w-3 shrink-0" />
                                {toDate(p.createdAt)?.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: toDate(p.createdAt)?.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                                }) || "—"}
                                {p.workspaceName && scope === "team" && (
                                  <span className="ml-1 text-zinc-400">· {p.workspaceName}</span>
                                )}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(e, p.id)}
                              className="flex h-full w-11 shrink-0 items-center justify-center rounded-r-xl text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/item:opacity-100"
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
              </div>
            )}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  )
}
