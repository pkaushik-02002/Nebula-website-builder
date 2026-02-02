"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { collection, doc, deleteDoc, onSnapshot, orderBy, query } from "firebase/firestore"
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
  Coins,
  CreditCard,
  Crown,
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
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"

type ProjectStatus = "pending" | "generating" | "complete" | "error"

type ProjectSummary = {
  id: string
  prompt: string
  model?: string
  status: ProjectStatus
  createdAt?: any
  sandboxUrl?: string
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === "function") return value.toDate()
  return null
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
  return trimmed.length > 52 ? `${trimmed.slice(0, 52)}…` : trimmed
}

function statusPill(status: ProjectStatus) {
  const base = "text-[10px] font-medium px-2.5 py-1 rounded-full border shrink-0"
  if (status === "complete") {
    return <span className={cn(base, "bg-emerald-500/10 border-emerald-500/30 text-emerald-400")}>Ready</span>
  }
  if (status === "error") {
    return <span className={cn(base, "bg-red-500/10 border-red-500/30 text-red-400")}>Error</span>
  }
  if (status === "generating") {
    return <span className={cn(base, "bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse")}>Building</span>
  }
  return <span className={cn(base, "bg-zinc-800/60 border-zinc-600/60 text-zinc-400")}>Queued</span>
}

export default function ProjectsPage() {
  const router = useRouter()
  const { user, userData, signOut } = useAuth()

  const remainingClamped = userData ? Math.max(0, userData.tokenUsage?.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingClamped : 0
  const tokenPercentage = userData && tokensLimit > 0
    ? Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100))
    : 0
  const isFreePlan = !userData?.planId || userData.planId === "free"
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [search, setSearch] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const isLg = typeof window !== "undefined" && window.innerWidth >= 1024
    if (isLg) setIsSidebarOpen(true)
  }, [])

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      const next: ProjectSummary[] = []
      snap.forEach((doc) => {
        const data = doc.data() as any
        next.push({
          id: doc.id,
          prompt: data.prompt || "",
          model: data.model,
          status: (data.status as ProjectStatus) || "pending",
          createdAt: data.createdAt,
          sandboxUrl: data.sandboxUrl,
        })
      })
      setProjects(next)
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => (p.prompt || "").toLowerCase().includes(q))
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
      <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row">
        {/* Left icon rail — hidden on mobile, visible lg+ */}
        <aside className="hidden lg:flex w-16 flex-col items-center py-5 gap-4 border-r border-zinc-800/80 bg-zinc-950 shrink-0">
          <Link href="/" className="w-10 h-10 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors">
            <Sparkles className="w-5 h-5" />
          </Link>
          <div className="flex flex-col gap-1.5">
            <span className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-100" title="Projects">
              <LayoutGrid className="w-4 h-4" />
            </span>
            <Link href="/" className="w-10 h-10 rounded-xl border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors" title="Home">
              <Compass className="w-4 h-4" />
            </Link>
            <button type="button" className="w-10 h-10 rounded-xl border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors" title="Templates">
              <FileText className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-10 h-10 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                aria-label="User menu"
              >
                <Avatar className="w-10 h-10 rounded-xl">
                  <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? undefined} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium">
                    {user?.displayName?.slice(0, 1)?.toUpperCase() ?? user?.email?.slice(0, 1)?.toUpperCase() ?? <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-72 bg-zinc-900 border-zinc-800 text-zinc-100">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="h-9 w-9 rounded-lg border border-zinc-700">
                    <AvatarImage src={user?.photoURL ?? undefined} alt="" className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-zinc-800 text-zinc-300 text-sm">
                      {user?.displayName?.slice(0, 1)?.toUpperCase() ?? user?.email?.slice(0, 1)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-zinc-100 truncate">{user?.displayName ?? "User"}</span>
                    <span className="text-xs text-zinc-500 truncate">{user?.email ?? ""}</span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator className="bg-zinc-800" />

              {/* Plan & Token usage */}
              <div className="px-2 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isFreePlan ? (
                      <Coins className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <Crown className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-sm text-zinc-300 capitalize">
                      {userData?.planName ?? (userData?.planId ?? "Free")}
                    </span>
                    <span className="text-xs text-zinc-500">Plan</span>
                  </div>
                  {isFreePlan && (
                    <Link
                      href="/pricing"
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Upgrade
                    </Link>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      Tokens
                    </span>
                    <span className="text-zinc-400">
                      {userData?.tokenUsage?.remaining?.toLocaleString() ?? "—"} / {tokensLimit > 0 ? tokensLimit.toLocaleString() : "—"} left
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-gradient-to-r from-amber-400 to-yellow-500"
                      style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                    />
                  </div>
                </div>
                {isFreePlan && (
                  <Link
                    href="/pricing"
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    Upgrade to Pro
                  </Link>
                )}
              </div>

              <DropdownMenuSeparator className="bg-zinc-800" />

              <DropdownMenuItem
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
                onClick={() => router.push("/pricing")}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Billing & plans
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
                onClick={() => router.push("/settings")}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:bg-zinc-800 focus:text-red-400 cursor-pointer"
                onClick={() => signOut()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </aside>

        {/* Projects sidebar — overlay on mobile, inline on lg */}
        <>
          {/* Backdrop on mobile when sidebar open */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300",
              isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={cn(
              "fixed lg:static inset-y-0 left-0 z-50 w-full max-w-[320px] lg:max-w-none lg:w-80 flex flex-col border-r border-zinc-800/80 bg-zinc-950/95 lg:bg-zinc-950/50 backdrop-blur-xl lg:backdrop-blur-none transition-transform duration-300 ease-out",
              isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
              !isSidebarOpen && "lg:flex" // always show on lg
            )}
          >
            <div className="flex flex-col h-full min-h-0">
              <div className="p-4 lg:p-5 border-b border-zinc-800/80 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Your Projects</h2>
                  <button
                    type="button"
                    className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="Close sidebar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-4 py-3 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-9 h-10 bg-zinc-900/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 rounded-xl text-sm focus-visible:ring-zinc-600"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 space-y-6">
                {(["Today", "Yesterday", "Previous"] as const).map((key) => (
                  <div key={key} className="space-y-2.5">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{key}</div>
                    <div className="space-y-1.5">
                      {grouped[key].length === 0 ? (
                        <p className="text-xs text-zinc-600 py-2">No projects</p>
                      ) : (
                        grouped[key].map((p) => (
                          <div
                            key={p.id}
                            className="group/item flex items-stretch gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                router.push(`/project/${p.id}`)
                                setIsSidebarOpen(false)
                              }}
                              className="flex-1 min-w-0 text-left px-3 py-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-zinc-200 truncate group-hover/item:text-zinc-100">{projectTitle(p.prompt)}</span>
                                {statusPill(p.status)}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                                <Clock className="w-3 h-3 shrink-0" />
                                {toDate(p.createdAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || "—"}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(e, p.id)}
                              className="shrink-0 w-8 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-r-xl transition-colors"
                              aria-label={`Delete ${projectTitle(p.prompt)}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

            {/* Pro Access pinned to bottom of sidebar */}
            <div className="shrink-0 p-4 pt-3 border-t border-zinc-800/80">
              <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-950/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">Pro Access</div>
                    <div className="text-xs text-zinc-500 mt-0.5">More tokens, faster builds.</div>
                  </div>
                  <Sparkles className="w-5 h-5 text-zinc-500 shrink-0" />
                </div>
                <Link
                  href="/pricing"
                  className="mt-4 flex w-full items-center justify-center rounded-xl bg-white text-zinc-900 font-medium py-2.5 text-sm hover:bg-zinc-200 transition-colors"
                >
                  Upgrade
                </Link>
              </div>
            </div>
          </div>
        </aside>
        </>

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 h-14 lg:h-14 shrink-0 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md flex items-center gap-3 px-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="h-9 w-9 p-0 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 lg:flex"
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="lg:hidden h-9 w-9 p-0 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open projects"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0 max-w-xl">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-9 h-9 bg-zinc-900/50 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 rounded-lg text-sm"
                />
              </div>
            </div>
          </header>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
              {/* Hero */}
              <section className="text-center">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-100">
                  What do you want to create?
                </h1>
                <p className="mt-2 sm:mt-3 text-sm sm:text-base text-zinc-500 max-w-lg mx-auto">
                  Describe your idea. We’ll generate the app.
                </p>
              </section>

              <div id="projects-create" className="mt-8 sm:mt-10 flex justify-center">
                <AnimatedAIInput />
              </div>

              {/* Workspace */}
              <section className="mt-10 sm:mt-14">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-zinc-100">Your Workspace</h2>
                    <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">Continue from where you left off.</p>
                  </div>
                  {filtered.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setIsSidebarOpen(true)}
                      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      View all ({filtered.length})
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {workspaceCards.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => router.push(`/project/${p.id}`)}
                      className="text-left rounded-2xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    >
                      <Card className="border-0 bg-transparent shadow-none rounded-2xl">
                        <CardContent className="p-4 sm:p-5">
                          <div className="h-24 sm:h-28 rounded-xl bg-gradient-to-br from-zinc-800/60 to-zinc-900/40 border border-zinc-800/60" />
                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-zinc-100 truncate">{projectTitle(p.prompt)}</div>
                              <div className="text-xs text-zinc-500 mt-0.5 truncate">{p.model || "AI"}</div>
                            </div>
                            {statusPill(p.status)}
                          </div>
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <Clock className="w-3 h-3 shrink-0" />
                            {toDate(p.createdAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: toDate(p.createdAt)?.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) || "—"}
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>

                {workspaceCards.length === 0 && (
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-8 sm:p-10 text-center">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-800 flex items-center justify-center mx-auto">
                      <LayoutGrid className="w-6 h-6 text-zinc-500" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-200">No projects yet</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Use the prompt above to create your first project.</p>
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
