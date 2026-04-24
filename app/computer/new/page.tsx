"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Loader2, Globe, ArrowRight, ArrowLeft, Cpu, Sparkles } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

const EXAMPLE_PROMPTS = [
  {
    label: "Restaurant",
    text: "Build a website for Noma Copenhagen with their seasonal tasting menu, reservation flow, and the story behind their kitchen.",
  },
  {
    label: "Studio",
    text: "Design portfolio for an architecture studio in Lisbon. Show three signature projects with editorial photography and a quiet, confident voice.",
  },
  {
    label: "Product",
    text: "Landing page for a premium ceramic cookware brand. Hero with a single dish, story, materials, and pre-order CTA.",
  },
]

export default function ComputerNewPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [prompt, setPrompt] = useState("")
  const [urls, setUrls] = useState<string[]>([""])
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addUrl = () => setUrls((u) => [...u, ""])
  const removeUrl = (i: number) => setUrls((u) => u.filter((_, idx) => idx !== i))
  const updateUrl = (i: number, val: string) =>
    setUrls((u) => u.map((v, idx) => (idx === i ? val : v)))

  const applyExample = (text: string) => {
    if (isCreating) return
    setPrompt(text)
  }

  const handleSubmit = async () => {
    if (!prompt.trim() || isCreating) return
    if (!user) {
      router.push("/login?redirect=/computer/new")
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const referenceUrls = urls.filter((u) => u.trim().length > 0)

      const res = await fetch("/api/computer/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: prompt.trim(), referenceUrls }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to create")
      }

      const { computerId } = (await res.json()) as { computerId: string }
      router.push(`/computer/${computerId}?autostart=1`)
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong")
      setIsCreating(false)
    }
  }

  const canSubmit = prompt.trim().length > 0 && !isCreating
  const promptCharCount = prompt.length

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#f0ece4] text-[#1c1c1c]">
      {/* ambient glow — warm royal radial */}
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(214,196,162,0.32),transparent_60%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 -z-0 h-[40vh] bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(195,176,142,0.22),transparent_60%)]" />

      {/* Nav */}
      <header className="relative z-10 shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-[#e0dbd1] bg-[rgba(252,250,246,0.92)] px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_32px_-16px_rgba(0,0,0,0.1)] backdrop-blur-md sm:px-5">
          <Link
            href="/"
            className="group flex items-center gap-2 text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            lotus.build
          </Link>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e6dfd1] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 shadow-sm">
            <Cpu className="h-3 w-3 text-[#8a7556]" />
            Computer
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:items-center sm:px-6 sm:pt-16">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="mb-9 text-center">
            <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e2d7c3] bg-[linear-gradient(180deg,#fdfaf3,#f1e7d2)] text-[#8a7556] shadow-[0_12px_32px_-18px_rgba(138,117,86,0.55)]">
              <Sparkles className="h-5 w-5" strokeWidth={1.6} />
            </div>

            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#a89578]">
              Autonomous Build Agent
            </p>
            <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-[#1c1c1c] sm:text-[52px]">
              What do you want
              <br />
              <span className="italic text-[#7a6244]">to build?</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-zinc-500">
              Describe your site. The agent researches references, plans the structure, writes the code, verifies the result, and deploys it for you.
            </p>
          </div>

          {/* Composer card */}
          <div className="rounded-[1.6rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] p-2 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_24px_60px_-30px_rgba(0,0,0,0.18)] backdrop-blur-sm">
            <div className="rounded-[1.3rem] border border-[#ebe5d8] bg-white p-5 sm:p-6">
              {/* Prompt textarea */}
              <div>
                <label className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Brief
                  </span>
                  <span className="font-mono text-[10px] text-zinc-300">
                    {promptCharCount} chars
                  </span>
                </label>

                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Build a restaurant website for Noma Copenhagen with their seasonal menu, reservation system, and story…"
                  rows={5}
                  className={cn(
                    "mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-[#fcfbf8] px-4 py-3.5",
                    "text-[14px] leading-relaxed text-zinc-800 placeholder:text-zinc-400",
                    "transition-all focus:border-[#bba27d] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d8c5a3]/30"
                  )}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit()
                  }}
                  disabled={isCreating}
                />

                {/* Example prompts */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center pr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Try
                  </span>
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => applyExample(ex.text)}
                      disabled={isCreating}
                      className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm transition-all hover:border-[#bba27d] hover:bg-[#fdfaf3] hover:text-[#7a6244] disabled:opacity-50"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference URLs */}
              <div className="mt-6 border-t border-zinc-100 pt-5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Reference URLs
                  </span>
                  <span className="text-[10px] text-zinc-400">Optional · up to 5</span>
                </div>

                <div className="space-y-2">
                  {urls.map((url, i) => (
                    <div key={i} className="group flex items-center gap-2">
                      <div className="relative flex-1">
                        <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => updateUrl(i, e.target.value)}
                          placeholder={`https://example${i + 1}.com`}
                          className={cn(
                            "w-full rounded-xl border border-zinc-200 bg-[#fcfbf8] py-2.5 pl-10 pr-3",
                            "font-mono text-[12.5px] text-zinc-700 placeholder:text-zinc-400 placeholder:font-sans",
                            "transition-all focus:border-[#bba27d] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d8c5a3]/25"
                          )}
                          disabled={isCreating}
                        />
                      </div>
                      {urls.length > 1 && (
                        <button
                          onClick={() => removeUrl(i)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-zinc-400 transition-all hover:border-zinc-200 hover:bg-white hover:text-zinc-700"
                          disabled={isCreating}
                          aria-label="Remove URL"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {urls.length < 5 && (
                  <button
                    onClick={addUrl}
                    disabled={isCreating}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-[#7a6244] disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add another reference
                  </button>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {/* Submit row */}
              <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden text-[11px] text-zinc-400 sm:block">
                  Press <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 shadow-sm">⌘</kbd>{" "}
                  <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 shadow-sm">↵</kbd>{" "}
                  to start
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold transition-all",
                    canSubmit
                      ? "bg-[#1c1c1c] text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)] hover:bg-[#2a2218] hover:shadow-[0_12px_28px_-12px_rgba(122,98,68,0.55)] active:scale-[0.98]"
                      : "cursor-not-allowed bg-zinc-100 text-zinc-400"
                  )}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Initializing computer…
                    </>
                  ) : (
                    <>
                      Start building
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer caption / capability strip */}
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Research", value: "Browses the web" },
              { label: "Plan", value: "Architects the build" },
              { label: "Build", value: "Writes the code" },
              { label: "Deploy", value: "Ships it live" },
            ].map((step, i) => (
              <div
                key={step.label}
                className="rounded-xl border border-[#e6dfd1] bg-[rgba(252,250,246,0.7)] px-3 py-2.5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] text-[#a89578]">0{i + 1}</span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {step.label}
                  </p>
                </div>
                <p className="mt-0.5 text-[11.5px] text-zinc-500">{step.value}</p>
              </div>
            ))}
          </div>

          {!user && (
            <p className="mt-5 text-center text-[11.5px] text-zinc-500">
              <Link href="/login" className="font-semibold text-[#7a6244] underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              to run the agent
            </p>
          )}
        </div>
      </main>
    </div>
  )
}