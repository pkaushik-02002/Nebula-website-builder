"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import {
  Bot,
  LayoutGrid,
  Compass,
  FileText,
  Settings,
  Search,
  Plus,
  ChevronRight,
  Sparkles,
  Clock,
  PanelLeft,
} from "lucide-react"

import { ProtectedRoute } from "@/components/auth/protected-route"
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
  const base = "text-[10px] px-2 py-0.5 rounded-full border"
  if (status === "complete") {
    return <span className={cn(base, "bg-emerald-500/10 border-emerald-500/20 text-emerald-300")}>Ready</span>
  }
  if (status === "error") {
    return <span className={cn(base, "bg-red-500/10 border-red-500/20 text-red-300")}>Error</span>
  }
  if (status === "generating") {
    return <span className={cn(base, "bg-blue-500/10 border-blue-500/20 text-blue-300")}>Building</span>
  }
  return <span className={cn(base, "bg-zinc-800/60 border-zinc-700/60 text-zinc-300")}>Queued</span>
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [search, setSearch] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

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

  const workspaceCards = useMemo(() => filtered.slice(0, 3), [filtered])

  return (
    <ProtectedRoute>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="h-full flex">
          <div className="w-[64px] border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-4 gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-zinc-300" />
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <button className="w-10 h-10 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-200">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-200">
                <Compass className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-200">
                <FileText className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1" />
            <Link
              href="/"
              className="w-10 h-10 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-200"
            >
              <Bot className="w-4 h-4" />
            </Link>
            <button className="w-10 h-10 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-200">
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div
            className={cn(
              "border-r border-zinc-800 bg-zinc-950/60 flex flex-col overflow-hidden transition-[width] duration-300",
              isSidebarOpen ? "w-[320px]" : "w-0"
            )}
            aria-hidden={!isSidebarOpen}
          >
            <div className={cn(!isSidebarOpen && "pointer-events-none opacity-0")}>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-zinc-100">Your Projects</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                    v1.25
                  </span>
                </div>
              </div>

              <Button
                type="button"
                className="w-full mt-4 justify-start gap-2 bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  const el = document.getElementById("projects-create")
                  el?.scrollIntoView({ behavior: "smooth", block: "center" })
                }}
              >
                <Plus className="w-4 h-4" />
                Add new project
              </Button>
            </div>

            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search history..."
                  className="pl-9 bg-zinc-900/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="px-4 pb-4 space-y-5">
                {(["Today", "Yesterday", "Previous"] as const).map((key) => (
                  <div key={key} className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">{key}</div>
                    <div className="space-y-1">
                      {grouped[key].length === 0 ? (
                        <div className="text-xs text-zinc-600">No projects</div>
                      ) : (
                        grouped[key].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => router.push(`/project/${p.id}`)}
                            className="w-full text-left px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs text-zinc-200 truncate">{projectTitle(p.prompt)}</div>
                              <div className="shrink-0">{statusPill(p.status)}</div>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                              <Clock className="w-3 h-3" />
                              <span>
                                {toDate(p.createdAt)?.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                }) || ""}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-4">
                <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/60 to-zinc-950/20 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">Pro Access</div>
                      <div className="text-xs text-zinc-500 mt-1">Upgrade for more tokens and faster builds.</div>
                    </div>
                    <Sparkles className="w-5 h-5 text-zinc-400" />
                  </div>
                  <a
                    href="/#pricing"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 font-medium py-2 text-sm hover:bg-zinc-200 transition-colors"
                  >
                    Upgrade Now
                  </a>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="h-14 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between px-4">
              <div className="flex items-center gap-2 w-full max-w-xl">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen((v) => !v)}
                  className="h-9 w-9 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                >
                  <PanelLeft className="w-4 h-4" />
                </Button>
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search history..."
                    className="pl-9 bg-zinc-900/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                >
                  Publish
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl mx-auto px-6 py-16">
                <div className="text-center">
                  <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-100">
                    What do you want to create?
                  </h1>
                  <p className="mt-3 text-sm md:text-base text-zinc-500">
                    Start building with a single prompt. No coding needed.
                  </p>
                </div>

                <div id="projects-create" className="mt-10 flex justify-center">
                  <AnimatedAIInput />
                </div>

                <div className="mt-14">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">Your Workspace</div>
                      <div className="text-xs text-zinc-500 mt-1">Explore and continue what you&apos;ve been building.</div>
                    </div>
                    <Link
                      href="#"
                      className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
                    >
                      View All
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {workspaceCards.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => router.push(`/project/${p.id}`)}
                        className="text-left"
                      >
                        <Card className="border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
                          <CardContent className="p-4">
                            <div className="h-28 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800" />
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-zinc-100 truncate">{projectTitle(p.prompt)}</div>
                                <div className="text-xs text-zinc-500 mt-1 truncate">{p.model || "AI Builder"}</div>
                              </div>
                              <div className="shrink-0">{statusPill(p.status)}</div>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    ))}

                    {workspaceCards.length === 0 && (
                      <div className="md:col-span-3">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
                          <div className="text-sm text-zinc-200">No projects yet</div>
                          <div className="text-xs text-zinc-500 mt-2">Create your first project using the prompt above.</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
