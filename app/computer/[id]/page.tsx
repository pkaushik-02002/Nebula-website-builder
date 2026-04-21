"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { doc, onSnapshot } from "firebase/firestore"
import { AnimatePresence, motion } from "framer-motion"
import Editor from "@monaco-editor/react"
import { db } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { ProjectFileTree, getLanguageFromPath } from "@/components/project/file-tree"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import type {
  Computer,
  ComputerAction,
  ComputerClarificationQuestion,
  ComputerPlan,
  ComputerStep,
} from "@/lib/computer-types"
import type { GeneratedFile } from "@/app/project/[id]/types"
import {
  AlertCircle,
  BookOpen,
  Check,
  Code2,
  Cpu,
  ExternalLink,
  Globe,
  Menu,
  Monitor,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  researching: "Researching",
  planning: "Planning",
  building: "Building",
  verifying: "Verifying",
  fixing: "Fixing",
  deploying: "Deploying",
  complete: "Complete",
  error: "Error",
}

const STATUS_CONFIG: Record<string, { pill: string; dot: string }> = {
  idle:        { pill: "border-zinc-200 bg-zinc-50 text-zinc-500", dot: "bg-zinc-300" },
  researching: { pill: "border-sky-100 bg-sky-50 text-sky-700", dot: "bg-sky-400" },
  planning:    { pill: "border-indigo-100 bg-indigo-50 text-indigo-700", dot: "bg-indigo-400" },
  building:    { pill: "border-amber-100 bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  verifying:   { pill: "border-cyan-100 bg-cyan-50 text-cyan-700", dot: "bg-cyan-400" },
  fixing:      { pill: "border-orange-100 bg-orange-50 text-orange-700", dot: "bg-orange-400" },
  deploying:   { pill: "border-emerald-100 bg-emerald-50 text-emerald-700", dot: "bg-emerald-400" },
  complete:    { pill: "border-green-100 bg-green-50 text-green-700", dot: "bg-green-500" },
  error:       { pill: "border-red-100 bg-red-50 text-red-700", dot: "bg-red-400" },
}

type Tab = "browser" | "preview" | "code" | "research"

let lastAutostartKey: string | null = null
let lastAutoPreviewSandboxUrl: string | null = null

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", color)} />
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  )
}

function FeedLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{children}</span>
}

function SidebarStatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[1rem] border border-[#e3dbcf] bg-white/85 px-3 py-2 shadow-[0_8px_20px_-24px_rgba(0,0,0,0.2)]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <div className="mt-1 text-[12px] font-medium text-zinc-700">{value}</div>
    </div>
  )
}

function FeedTimelineCard({
  label,
  meta,
  accentClassName,
  shellClassName,
  bodyClassName,
  children,
}: {
  label: string
  meta?: ReactNode
  accentClassName: string
  shellClassName?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <div className="relative max-w-[92%] pl-7">
      <span className={cn("absolute left-[10px] top-4 h-2.5 w-2.5 rounded-full ring-[5px] ring-[#fcfaf6]", accentClassName)} />
      <div
        className={cn(
          "overflow-hidden rounded-[1.25rem] border bg-white/95 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.28)]",
          shellClassName
        )}
      >
        <div className="flex items-center gap-2 border-b border-black/5 px-3.5 py-2.5">
          <FeedLabel>{label}</FeedLabel>
          {meta ? <span className="truncate text-[10px] font-medium text-zinc-500">{meta}</span> : null}
        </div>
        <div className={cn("px-3.5 py-3", bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}

function summarizeFilesForDisplay(value: unknown): { count: number; paths: string[] } | null {
  if (!Array.isArray(value)) return null

  const paths = value.flatMap((item): string[] => {
    if (!item || typeof item !== "object") return []
    const path = (item as { path?: unknown }).path
    return typeof path === "string" ? [path] : []
  })

  return paths.length > 0 ? { count: paths.length, paths } : null
}

function sanitizeToolPayloadForDisplay<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
      if (key === "files") {
        const summary = summarizeFilesForDisplay(entryValue)
        if (summary) return [key, summary]
      }

      return [key, entryValue]
    })
  ) as T
}

function humanizeTool(name?: string) {
  const map: Record<string, string> = {
    browserbase_research: "Researching",
    browserbase_navigate: "Browsing",
    plan_project: "Planning",
    generate_files: "Writing files",
    run_sandbox: "Starting sandbox",
    verify_preview: "Verifying",
    fix_errors: "Fixing errors",
    deploy_site: "Deploying",
  }
  return map[name ?? ""] ?? name ?? "Tool"
}

function prettyResult(action: ComputerAction): string {
  try {
    if (!action.toolOutput) return action.content
    const raw: unknown = JSON.parse(action.toolOutput)
    if (Array.isArray(raw)) {
      if (action.toolName === "browserbase_research") {
        const n = raw.length
        return `Read ${n} source${n === 1 ? "" : "s"}`
      }
      return action.content
    }
    const out = raw as Record<string, unknown>
    if (out.error) return `Error: ${String(out.error)}`
    switch (action.toolName) {
      case "generate_files": {
        const path = out.path as string | undefined
        if (path) return `Wrote ${path}`
        const files = out.files
        if (Array.isArray(files)) return `${files.length} files generated`
        if (files && typeof files === "object" && typeof (files as { count?: number }).count === "number")
          return `${(files as { count: number }).count} files generated`
        return "Files generated"
      }
      case "run_sandbox": return "Sandbox ready"
      case "verify_preview": {
        const issues = out.issues as string[] | undefined
        const n = issues?.length ?? 0
        return n > 0 ? `Found ${n} issue${n === 1 ? "" : "s"}` : "Verified — no issues"
      }
      case "deploy_site": return "Deployed"
      default: return action.content
    }
  } catch {
    return action.content
  }
}

function ActionCard({
  action,
  isLatest,
}: {
  action: ComputerAction
  isLatest?: boolean
}) {
  if (action.actor === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[84%]">
          <div className="rounded-2xl bg-[#1f1f1f] px-3.5 py-3">
            <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-white">{action.content}</p>
          </div>
        </div>
      </div>
    )
  }

  if (action.actor === "system") {
    return (
      <div className="flex justify-center py-0.5">
        <span className="rounded-full border border-[#e6e0d6] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,243,237,0.98))] px-3 py-1.5 text-[10px] font-medium text-zinc-500 shadow-[0_10px_22px_-24px_rgba(0,0,0,0.28)]">
          {action.content}
        </span>
      </div>
    )
  }

  if (action.type === "thinking") {
    return (
      <div>
        {isLatest ? (
          <TextShimmer className="text-[13px] leading-6 text-zinc-700" duration={2}>
            {action.content}
          </TextShimmer>
        ) : (
          <p className="px-1 py-1 text-[13px] leading-6 text-zinc-600">{action.content}</p>
        )}
      </div>
    )
  }

  if (action.type === "tool_call") {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-1">
        <span className="h-1 w-1 rounded-full bg-zinc-400" />
        {isLatest ? (
          <TextShimmer className="font-mono text-[11px] text-zinc-500" duration={2}>
            {humanizeTool(action.toolName)}
          </TextShimmer>
        ) : (
          <span className="font-mono text-[11px] text-zinc-500">
            {humanizeTool(action.toolName)}
          </span>
        )}
        {action.toolInput?.url ? (
          <span className="font-mono text-[11px] text-zinc-400 truncate">{String(action.toolInput.url)}</span>
        ) : action.toolInput?.path ? (
          <span className="font-mono text-[11px] text-zinc-400 truncate">{String(action.toolInput.path)}</span>
        ) : null}
      </div>
    )
  }

  if (action.type === "tool_result" && action.toolName === "plan_project") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let plan: any = null
    try { plan = JSON.parse(action.toolOutput || "{}") } catch {}
    if (!plan) return null

    return (
      <div className="my-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Plan</p>

        {plan.domain && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">Domain</p>
            <p className="mt-0.5 text-[13px] text-zinc-800">{plan.domain}</p>
          </div>
        )}

        {Array.isArray(plan.pages) && plan.pages.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-400">Pages</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.pages.map((p: string) => (
                <span key={p} className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">{p}</span>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(plan.features) && plan.features.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-400">Features</p>
            <ul className="space-y-1">
              {plan.features.map((f: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-zinc-700">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.techChoices && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-400">Stack</p>
            <div className="flex flex-wrap gap-1.5">
              {(Array.isArray(plan.techChoices)
                ? plan.techChoices as string[]
                : Object.values(plan.techChoices as Record<string, string>).filter(Boolean)
              ).map((t: string, i: number) => (
                <span key={i} className="rounded-md border border-zinc-200 px-2 py-0.5 font-mono text-[11px] text-zinc-600">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (action.type === "tool_result") {
    return (
      <div className="flex items-center gap-2 py-1 pl-1">
        <Check className="h-3 w-3 text-zinc-400" />
        <span className="text-[12px] text-zinc-600">{prettyResult(action)}</span>
      </div>
    )
  }

  if (action.type === "decision") {
    return (
      <div>
        {isLatest && action.actor === "agent" ? (
          <TextShimmer className="text-[13px] leading-6 text-zinc-700" duration={2}>
            {action.content}
          </TextShimmer>
        ) : (
          <p className="px-1 py-1 text-[13px] font-medium leading-6 text-zinc-900">{action.content}</p>
        )}
      </div>
    )
  }

  return (
    <FeedTimelineCard
      label="agent"
      accentClassName="bg-[#6f665d]"
      shellClassName="border-[#e4ddd2] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(250,247,242,0.97))]"
    >
      <p className="whitespace-pre-wrap text-[13px] leading-[1.7] text-zinc-700">{action.content}</p>
    </FeedTimelineCard>
  )
}

function normalizeClarificationQuestions(value: unknown): ComputerClarificationQuestion[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index): ComputerClarificationQuestion[] => {
    if (typeof item === "string") {
      return [{
        id: `legacy-${index + 1}`,
        prompt: item,
        options: [],
      }]
    }

    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const prompt = typeof record.prompt === "string"
      ? record.prompt
      : typeof record.question === "string"
        ? record.question
        : null

    if (!prompt) return []

    const options = Array.isArray(record.options)
      ? record.options.flatMap((option, optionIndex) => {
          if (!option || typeof option !== "object") return []
          const optionRecord = option as Record<string, unknown>
          if (typeof optionRecord.label !== "string" || typeof optionRecord.answer !== "string") return []

          return [{
            id: typeof optionRecord.id === "string" ? optionRecord.id : `${index + 1}-${optionIndex + 1}`,
            label: optionRecord.label,
            answer: optionRecord.answer,
            recommended: optionRecord.recommended === true,
          }]
        })
      : []

    return [{
      id: typeof record.id === "string" ? record.id : `question-${index + 1}`,
      prompt,
      options,
    }]
  })
}

function buildClarificationReply(
  questions: ComputerClarificationQuestion[],
  selectedAnswers: Record<string, string>
): string {
  const answeredQuestions = questions.filter((question) => selectedAnswers[question.id])

  if (answeredQuestions.length === 0) return ""

  return [
    "Answers to your clarification questions:",
    ...answeredQuestions.map(
      (question, index) =>
        `${index + 1}. ${question.prompt}\nAnswer: ${selectedAnswers[question.id]}`
    ),
  ].join("\n\n")
}

function PlanChipRow({ items }: { items: string[] }) {
  if (items.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.slice(0, 6).map((item) => (
        <span
          key={item}
          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium text-zinc-600"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function ClarificationPanel({
  questions,
  selectedAnswers,
  isSubmitting,
  onSelectAnswer,
  onSubmitAnswers,
  onOpenPermissions,
}: {
  questions: ComputerClarificationQuestion[]
  selectedAnswers: Record<string, string>
  isSubmitting: boolean
  onSelectAnswer: (questionId: string, answer: string) => void
  onSubmitAnswers: () => void
  onOpenPermissions: () => void
}) {
  if (questions.length === 0) return null

  const selectableQuestions = questions.filter((question) => question.options.length > 0)
  const selectedCount = selectableQuestions.filter((question) => selectedAnswers[question.id]).length
  const canSubmitSelections = selectableQuestions.length > 0 && selectedCount === selectableQuestions.length && !isSubmitting

  return (
    <div className="rounded-[1.25rem] border border-amber-200 bg-[#fffaf1] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Before I build</p>
          <p className="mt-1 text-[13px] font-semibold text-zinc-900">Choose the missing details so I can continue.</p>
        </div>
        <button
          type="button"
          onClick={onOpenPermissions}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Permissions
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {questions.map((question, index) => (
          <div key={question.id} className="rounded-2xl border border-amber-200 bg-white px-3.5 py-3">
            <p className="text-[12px] font-medium leading-relaxed text-zinc-800">
              <span className="mr-2 text-amber-700">{index + 1}.</span>
              {question.prompt}
            </p>

            {question.options.length > 0 ? (
              <div className="mt-3 space-y-2">
                {question.options.map((option) => {
                  const isSelected = selectedAnswers[question.id] === option.answer

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectAnswer(question.id, option.answer)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                        isSelected
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-[#faf8f3] text-zinc-700 hover:border-zinc-300 hover:bg-white"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-semibold leading-relaxed">{option.label}</span>
                          {option.recommended ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]",
                                isSelected ? "bg-white/15 text-white" : "bg-amber-100 text-amber-700"
                              )}
                            >
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        {option.answer !== option.label ? (
                          <p className={cn(
                            "mt-1 text-[11px] leading-relaxed",
                            isSelected ? "text-zinc-100/90" : "text-zinc-500"
                          )}>
                            {option.answer}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          isSelected ? "border-white/25 bg-white/10 text-white" : "border-zinc-300 bg-white text-transparent"
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-zinc-500">Reply in chat with your answer for this one.</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {selectableQuestions.length > 0 ? (
          <button
            type="button"
            onClick={onSubmitAnswers}
            disabled={!canSubmitSelections}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {isSubmitting ? "Sending..." : "Continue with selected answers"}
          </button>
        ) : null}
        <p className="text-[12px] leading-relaxed text-zinc-500">
          Or reply in chat below if you want to answer in your own words.
        </p>
      </div>
    </div>
  )
}

function PlanningPanel({
  plan,
  planningStatus,
  requirePlanApproval,
  isApproving,
  onApprove,
  onOpenPermissions,
}: {
  plan: ComputerPlan | null | undefined
  planningStatus: Computer["planningStatus"]
  requirePlanApproval: boolean
  isApproving: boolean
  onApprove: () => void
  onOpenPermissions: () => void
}) {
  if (!plan) return null

  if (plan.intent === "website-clone") return null

  const isReadyForApproval = planningStatus === "ready-for-approval" && requirePlanApproval
  const isApproved = planningStatus === "approved" || !requirePlanApproval

  return (
    <div className="shrink-0 border-b border-[#ede8e0] bg-[#f7f5ef] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Plan</p>
          <p className="mt-1 text-[13px] font-semibold text-zinc-900">{plan.summary}</p>
        </div>
        <button
          type="button"
          onClick={onOpenPermissions}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Permissions
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Pages</p>
          <PlanChipRow items={plan.pages} />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Features</p>
          <PlanChipRow items={plan.features} />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            {plan.buildScope === "frontend-only" ? "Frontend only" : "Full stack"}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            {plan.techChoices.framework}
          </span>
          {plan.sourceUrls.length > 0 ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              {plan.sourceUrls.length} reference{plan.sourceUrls.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {plan.assumptions.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Assumptions</p>
            <div className="mt-2 space-y-1.5">
              {plan.assumptions.slice(0, 4).map((item) => (
                <p key={item} className="text-[12px] leading-relaxed text-zinc-600">
                  - {item}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isReadyForApproval ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onApprove}
            disabled={isApproving}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {isApproving ? "Approving..." : "Approve plan"}
          </button>
          <div className="flex min-h-10 items-center rounded-xl border border-zinc-200 bg-white px-3 text-[12px] text-zinc-500">
            Send changes below if you want the plan revised first.
          </div>
        </div>
      ) : isApproved ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-800">
          {requirePlanApproval ? "Plan approved. The agent can continue from this brief." : "Plan approval is off, so the agent can continue from this brief."}
        </div>
      ) : null}
    </div>
  )
}

function EmptyPane({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-300 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        {icon}
      </div>
      <div className="max-w-xs">
        <p className="text-[13px] font-semibold text-zinc-700">{title}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{subtitle}</p>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-all",
        active
          ? "bg-zinc-900 text-white shadow-sm"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function DeployLogConsole({ step, logs, isRunning }: { step: string; logs: string[]; isRunning: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs.length])

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0e0e0e]">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#161616] px-3.5 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Build Log</span>
        {step ? <span className="font-mono text-[10px] text-zinc-600">{step}</span> : null}
        {isRunning ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        ) : null}
      </div>
      <div ref={ref} className="max-h-44 overflow-auto p-3 font-mono text-[10.5px] leading-[1.7] [scrollbar-width:thin]">
        {logs.length === 0 ? (
          <span className="text-zinc-600">$ starting...</span>
        ) : (
          logs.slice(-120).map((line, i) => (
            <p
              key={i}
              className={cn(
                "whitespace-pre-wrap break-words",
                /\berror\b|failed|ERR!/i.test(line) ? "text-red-400" :
                /\bwarn\b|warning/i.test(line) ? "text-amber-400" :
                /success|complete|published|ready|added \d+/i.test(line) ? "text-emerald-400" :
                "text-zinc-400"
              )}
            >
              <span className="mr-2 text-zinc-700">$</span>{line}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

export default function ComputerPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const [computer, setComputer] = useState<Computer | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("browser")
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [restartAfterStop, setRestartAfterStop] = useState(false)

  // Deploy state
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployTab, setDeployTab] = useState<"netlify" | "vercel">("netlify")
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [permissionsDraft, setPermissionsDraft] = useState(true)
  const [isSavingPermissions, setIsSavingPermissions] = useState(false)
  const [isApprovingPlan, setIsApprovingPlan] = useState(false)
  const [selectedClarificationAnswers, setSelectedClarificationAnswers] = useState<Record<string, string>>({})
  const [isSubmittingClarificationAnswers, setIsSubmittingClarificationAnswers] = useState(false)
  const [netlifyConnected, setNetlifyConnected] = useState<boolean | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState("")
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployLinks, setDeployLinks] = useState<{ siteUrl?: string | null; siteId?: string | null } | null>(null)
  const [netlifySiteName, setNetlifySiteName] = useState("")
  const [vercelConnected, setVercelConnected] = useState<boolean | null>(null)
  const [vercelTokenInput, setVercelTokenInput] = useState("")
  const [isVercelDeploying, setIsVercelDeploying] = useState(false)
  const [vercelDeployStep, setVercelDeployStep] = useState("")
  const [vercelDeployLogs, setVercelDeployLogs] = useState<string[]>([])
  const [vercelDeployError, setVercelDeployError] = useState<string | null>(null)
  const [vercelDeployLinks, setVercelDeployLinks] = useState<{ siteUrl?: string | null } | null>(null)

  const feedRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoStarted = useRef(false)
  const sidebarInitialized = useRef(false)
  const id = params.id

  // Firestore subscription — no selectedFile in deps to prevent churn
  useEffect(() => {
    if (!id) return
    const unsubscribe = onSnapshot(doc(db, "computers", id), (snapshot) => {
      if (!snapshot.exists()) return
      const data = snapshot.data() as Omit<Computer, "id">
      setComputer((prev) => {
        const incoming = { id: snapshot.id, ...data } as Computer
        if (!prev) return incoming
        const serverIds = new Set(incoming.actions?.map(a => a.id))
        const optimistic = (prev.actions || []).filter(
          a => a.actor === "user" && !serverIds.has(a.id)
        )
        return { ...incoming, actions: [...(incoming.actions || []), ...optimistic] }
      })
    })
    return unsubscribe
  }, [id])

  // Keep selectedFile content in sync with latest Firestore data
  useEffect(() => {
    const files = computer?.files
    if (!files?.length) return
    setSelectedFile(prev => {
      if (!prev) return files[0] as GeneratedFile
      const match = (files as GeneratedFile[]).find(f => f.path === prev.path)
      return match ?? prev
    })
  }, [computer?.files])

  useEffect(() => {
    const feedEl = feedRef.current
    if (feedEl) feedEl.scrollTop = feedEl.scrollHeight
  }, [computer?.actions?.length])

  useEffect(() => {
    const sandboxUrl = computer?.sandboxUrl ?? null
    if (!sandboxUrl) return
    if (lastAutoPreviewSandboxUrl === sandboxUrl) return

    lastAutoPreviewSandboxUrl = sandboxUrl
    setActiveTab("preview")
  }, [computer?.sandboxUrl])

  useEffect(() => {
    if (typeof window === "undefined" || sidebarInitialized.current) return
    setSidebarOpen(window.matchMedia("(min-width: 1024px)").matches)
    sidebarInitialized.current = true
  }, [])

  // Netlify / Vercel status on deploy modal open
  useEffect(() => {
    if (!deployOpen || !user) return
    const checkNetlify = async () => {
      try {
        const token = await user.getIdToken()
        const res = await fetch("/api/netlify/status", { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => null)
        setNetlifyConnected(!!json?.connected)
      } catch { setNetlifyConnected(false) }
    }
    const checkVercel = async () => {
      if (!id) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/vercel/status?projectId=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const json = await res.json().catch(() => null)
        setVercelConnected(!!json?.connected)
      } catch { setVercelConnected(false) }
    }
    checkNetlify()
    checkVercel()
  }, [deployOpen, user, id])

  useEffect(() => {
    setPermissionsDraft(computer?.permissions?.requirePlanApproval ?? true)
  }, [computer?.permissions?.requirePlanApproval])

  const startRun = useCallback(async () => {
    if (!user || isRunning) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsRunning(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/computer/${id}/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error ?? "Failed to start agent")
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "error") setError(event.error)
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message ?? "Stream error")
    } finally {
      setIsRunning(false)
    }
  }, [id, isRunning, user])

  const stopRun = useCallback(async () => {
    if (user) {
      try {
        const token = await user.getIdToken()
        await fetch(`/api/computer/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ intent: "stop" }),
        })
      } catch {}
    }
    abortRef.current?.abort()
    setIsRunning(false)
  }, [id, user])

  // Derived early so callbacks can reference them
  const status = computer?.status ?? "idle"
  const isActive = isRunning || (status !== "idle" && status !== "complete" && status !== "error")
  const planningStatus = computer?.planningStatus ?? "draft"
  const requirePlanApproval = computer?.permissions?.requirePlanApproval ?? true
  const clarificationQuestions = normalizeClarificationQuestions(computer?.clarificationQuestions)
  const activePlan = computer?.plan ?? null
  const isClonePlan = activePlan?.intent === "website-clone"
  const requiresPlanApproval = planningStatus === "ready-for-approval" && requirePlanApproval && !isClonePlan
  const isWaitingForUser =
    planningStatus === "needs-input" ||
    requiresPlanApproval
  const inputPlaceholder =
    planningStatus === "needs-input"
      ? "Answer the open questions..."
      : requiresPlanApproval
        ? "Ask for plan changes or approve the plan..."
        : "Send instructions..."

  useEffect(() => {
    const nextQuestions = normalizeClarificationQuestions(computer?.clarificationQuestions)

    setSelectedClarificationAnswers((current) => {
      const next: Record<string, string> = {}
      for (const question of nextQuestions) {
        if (current[question.id]) next[question.id] = current[question.id]
      }
      return next
    })
  }, [computer?.clarificationQuestions])

  useEffect(() => {
    const autostartKey = id ? `${id}:${searchParams.get("autostart")}` : null
    if (
      !autoStarted.current && autostartKey && lastAutostartKey !== autostartKey &&
      searchParams.get("autostart") === "1" && computer?.status === "idle" && user && !isRunning && !isWaitingForUser
    ) {
      autoStarted.current = true
      lastAutostartKey = autostartKey
      startRun()
    }
  }, [computer?.status, id, isRunning, isWaitingForUser, searchParams, startRun, user])

  useEffect(() => {
    if (!restartAfterStop || isRunning || computer?.status !== "idle" || isWaitingForUser) return
    setRestartAfterStop(false)
    startRun()
  }, [computer?.status, isRunning, isWaitingForUser, restartAfterStop, startRun])

  const submitChatMessage = useCallback(async (value: string) => {
    if (!user || !id) return
    const message = value.trim()
    if (!message) return

    const actionId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `user-${Date.now()}`

    const optimisticAction: ComputerAction = {
      id: actionId,
      timestamp: new Date().toISOString(),
      type: "message",
      actor: "user",
      content: message,
    }

    setComputer((prev) =>
      prev ? { ...prev, actions: [...(prev.actions ?? []), optimisticAction] } : prev
    )
    setSidebarOpen(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const intent = isRunning || isActive ? "interrupt" : "message"
      const response = await fetch(`/api/computer/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ intent, message, actionId }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Failed to send message")
      }
      if (intent === "interrupt") {
        setRestartAfterStop(true)
        abortRef.current?.abort()
        setIsRunning(false)
      } else {
        startRun()
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to send message")
    }
  }, [id, isActive, isRunning, startRun, user])

  const selectClarificationAnswer = useCallback((questionId: string, answer: string) => {
    setSelectedClarificationAnswers((current) => ({
      ...current,
      [questionId]: answer,
    }))
  }, [])

  const submitClarificationAnswers = useCallback(async () => {
    const reply = buildClarificationReply(clarificationQuestions, selectedClarificationAnswers)
    if (!reply || isSubmittingClarificationAnswers) return

    setIsSubmittingClarificationAnswers(true)

    try {
      await submitChatMessage(reply)
    } finally {
      setIsSubmittingClarificationAnswers(false)
    }
  }, [clarificationQuestions, isSubmittingClarificationAnswers, selectedClarificationAnswers, submitChatMessage])

  const approvePlan = useCallback(async () => {
    if (!user || !id || isApprovingPlan) return

    setIsApprovingPlan(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/computer/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ intent: "approve_plan" }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Failed to approve plan")
      }

      setSidebarOpen(true)
      await startRun()
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve plan")
    } finally {
      setIsApprovingPlan(false)
    }
  }, [id, isApprovingPlan, startRun, user])

  const savePermissions = useCallback(async () => {
    if (!user || !id || isSavingPermissions) return

    setIsSavingPermissions(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/computer/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          intent: "update_permissions",
          permissions: { requirePlanApproval: permissionsDraft },
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Failed to save permissions")
      }

      setPermissionsOpen(false)
    } catch (err: any) {
      setError(err?.message ?? "Failed to save permissions")
    } finally {
      setIsSavingPermissions(false)
    }
  }, [id, isSavingPermissions, permissionsDraft, user])

  const handleDeployToNetlify = useCallback(async () => {
    if (!user || !id) return
    if (!netlifyConnected) {
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/netlify/oauth/start?projectId=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const json = await res.json()
        if (json?.url) window.location.href = json.url
      } catch {}
      return
    }
    setIsDeploying(true)
    setDeployError(null)
    setDeployLogs([])
    setDeployStep("Starting")
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/netlify/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          computerId: id,
          siteId: deployLinks?.siteId || null,
          siteName: netlifySiteName || computer?.name || "",
        }),
      })
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Deploy failed"))
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        while (true) {
          const idx = buffer.indexOf("\n")
          if (idx === -1) break
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          let payload: any
          try { payload = JSON.parse(line) } catch { continue }
          if (payload.type === "step") setDeployStep(payload.step)
          if (payload.type === "log") {
            const msg = String(payload.message || "")
            if (!/CommandExitError|exit\s+status\s+1/i.test(msg))
              setDeployLogs(prev => { const n = [...prev, msg]; return n.length > 500 ? n.slice(-500) : n })
          }
          if (payload.type === "error") setDeployError(payload.error)
          if (payload.type === "success") {
            setDeployLinks({ siteUrl: payload.siteUrl || null, siteId: payload.siteId || null })
            setDeployStep("ready")
          }
        }
      }
    } catch (err: any) {
      setDeployError(err?.message || "Deploy failed")
    } finally {
      setIsDeploying(false)
    }
  }, [user, id, netlifyConnected, deployLinks?.siteId, netlifySiteName, computer?.name])

  const handleSaveVercelToken = useCallback(async () => {
    if (!user || !id || !vercelTokenInput.trim()) return
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/vercel/save-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: id, token: vercelTokenInput.trim() }),
      })
      if (!res.ok) throw new Error("Failed to save token")
      setVercelConnected(true)
      setVercelTokenInput("")
    } catch {}
  }, [user, id, vercelTokenInput])

  const handleDeployToVercel = useCallback(async () => {
    if (!user || !id || !vercelConnected) return
    setIsVercelDeploying(true)
    setVercelDeployError(null)
    setVercelDeployLogs([])
    setVercelDeployStep("Starting")
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/vercel/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ computerId: id }),
      })
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Deploy failed"))
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        while (true) {
          const idx = buffer.indexOf("\n")
          if (idx === -1) break
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          let payload: any
          try { payload = JSON.parse(line) } catch { continue }
          if (payload.type === "step") setVercelDeployStep(payload.step)
          if (payload.type === "log") {
            const msg = String(payload.message || "")
            if (!/CommandExitError|exit\s+status\s+1/i.test(msg))
              setVercelDeployLogs(prev => { const n = [...prev, msg]; return n.length > 500 ? n.slice(-500) : n })
          }
          if (payload.type === "error") setVercelDeployError(payload.error)
          if (payload.type === "success") {
            setVercelDeployLinks({ siteUrl: payload.siteUrl || null })
            setVercelDeployStep("ready")
          }
        }
      }
    } catch (err: any) {
      setVercelDeployError(err?.message || "Deploy failed")
    } finally {
      setIsVercelDeploying(false)
    }
  }, [user, id, vercelConnected])

  const actions: ComputerAction[] = computer?.actions ?? []
  const visibleActions =
    planningStatus === "needs-input" && clarificationQuestions.length > 0
      ? actions.filter((action) => !(action.type === "decision" && action.actor === "agent"))
      : actions
  const steps: ComputerStep[] = computer?.steps ?? []
  const currentGeneratingFile = computer?.currentGeneratingFile ?? null
  const files: GeneratedFile[] = ((computer?.files ?? []) as GeneratedFile[]).map((file) => ({
    ...file,
    isGenerating: file.path === currentGeneratingFile,
  }))
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const stepsCompleteCount = steps.filter(s => s.status === "complete").length
  const hasFiles = files.length > 0
  const activeStepItem =
    steps.find((step) => step.status === "active") ??
    [...steps].reverse().find((step) => step.status === "complete" || step.status === "failed") ??
    null
  const sidebarStateLabel =
    planningStatus === "needs-input"
      ? "Awaiting your input"
      : requiresPlanApproval
        ? "Plan ready to review"
        : isActive
          ? "Execution in progress"
          : status === "complete"
            ? "Preview ready"
            : "Standing by"
  const sidebarFocusLabel =
    planningStatus === "needs-input"
      ? "Clarify the remaining details"
      : requiresPlanApproval
        ? "Approve or revise the plan"
        : activeStepItem?.title ?? "Ready for the next instruction"

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: "browser", label: "Browser", icon: <Globe className="h-3.5 w-3.5" /> },
    { id: "preview", label: "Preview", icon: <Monitor className="h-3.5 w-3.5" /> },
    { id: "code", label: "Code", icon: <Code2 className="h-3.5 w-3.5" /> },
    { id: "research", label: "Research", icon: <BookOpen className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f0ece4] text-[#1c1c1c]">
      {/* ambient light */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(210,200,182,0.22),transparent)]" />

      {/* ── Header ── */}
      <header className="relative z-10 shrink-0 px-3 pt-3 pb-2.5 sm:px-4 sm:pt-4 sm:pb-3">
        <div className="mx-auto max-w-[1800px]">
          <div className="flex items-center gap-2.5 rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.92)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_32px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md sm:rounded-[1.6rem] sm:px-5 sm:py-3.5">
            {/* identity */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm">
                <Cpu className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  <span>Computer</span>
                  <span className="text-zinc-300">/</span>
                  <span className="truncate text-zinc-600">{computer?.name ?? "Loading…"}</span>
                </div>
                {computer?.prompt ? (
                  <p className="mt-0.5 max-w-xl truncate text-[12px] text-zinc-500 sm:text-[13px]">
                    {computer.prompt.split("\n")[0]}
                  </p>
                ) : null}
              </div>
            </div>

            {/* actions */}
            <div className="flex shrink-0 items-center gap-2">
              {/* status pill */}
              <div className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline-flex",
                statusCfg.pill
              )}>
                {isActive
                  ? <PulseDot color={statusCfg.dot} />
                  : <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />}
                {STATUS_LABEL[status] ?? status}
              </div>

              <button
                type="button"
                onClick={() => setPermissionsOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 sm:h-9"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Permissions</span>
              </button>

              {/* deploy button — only when files exist */}
              {hasFiles && (
                <button
                  type="button"
                  onClick={() => setDeployOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:h-9"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Deploy</span>
                </button>
              )}

              {/* live site */}
              {computer?.deployUrl ? (
                <a
                  href={computer.deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-80 sm:h-9"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Live</span>
                </a>
              ) : null}

              {/* run / stop */}
              {(status === "idle" || status === "error" || status === "complete") && !isRunning && !isWaitingForUser ? (
                <button
                  type="button"
                  onClick={startRun}
                  disabled={!user}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40 sm:h-9"
                >
                  <Play className="h-3 w-3 fill-zinc-800" />
                  <span className="hidden sm:inline">Run</span>
                </button>
              ) : null}

              {!isRunning && requiresPlanApproval ? (
                <button
                  type="button"
                  onClick={approvePlan}
                  disabled={!user || isApprovingPlan}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 sm:h-9"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isApprovingPlan ? "Approving..." : "Approve"}</span>
                </button>
              ) : null}

              {isRunning ? (
                <button
                  type="button"
                  onClick={stopRun}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-[12px] font-semibold text-red-600 transition hover:bg-red-100 sm:h-9"
                >
                  <span className="h-2 w-2 rounded-sm bg-red-500" />
                  Stop
                </button>
              ) : null}

              {/* agent toggle (mobile) */}
              <button
                type="button"
                onClick={() => setSidebarOpen(v => !v)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 lg:hidden sm:h-9"
              >
                {sidebarOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4">
        {/* mobile backdrop */}
        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.button
              type="button"
              aria-label="Close sidebar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 z-20 bg-black/15 backdrop-blur-[2px] lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
        </AnimatePresence>

        {/* ── Sidebar ── */}
        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.aside
              key="sidebar"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-3 bottom-3 top-auto z-30 flex h-[min(78dvh,740px)] flex-col overflow-hidden rounded-[1.4rem] border border-[#e4dfd5] bg-[#faf9f6] shadow-[0_16px_48px_-24px_rgba(0,0,0,0.22)] sm:inset-x-4 sm:bottom-4 sm:h-[min(80dvh,780px)] sm:rounded-[1.5rem] lg:relative lg:inset-auto lg:mr-3 lg:h-auto lg:w-[380px] lg:shrink-0 lg:rounded-[1.4rem] lg:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.10)] xl:w-[420px]"
            >
              {/* sidebar header */}
              <div className="shrink-0 border-b border-[#ede8e0] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.88),rgba(248,244,238,0.98))] px-4 py-4">
                <div className="rounded-[1.35rem] border border-[#e4ddd2] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,241,233,0.96))] p-4 shadow-[0_24px_48px_-38px_rgba(0,0,0,0.34)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Agent runtime</p>
                      <div className="mt-2 flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#dfd6c8] bg-white text-[#7a6650] shadow-[0_12px_28px_-26px_rgba(0,0,0,0.3)]">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-zinc-900">BuildKit Agent</p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{sidebarStateLabel}</p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        statusCfg.pill
                      )}
                    >
                      {isActive ? (
                        <PulseDot color={statusCfg.dot} />
                      ) : (
                        <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                      )}
                      {STATUS_LABEL[status] ?? status}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SidebarStatPill
                      label="Progress"
                      value={
                        steps.length > 0
                          ? `${stepsCompleteCount}/${steps.length} steps complete`
                          : "No steps yet"
                      }
                    />
                    <SidebarStatPill
                      label="Focus"
                      value={<span className="line-clamp-2 leading-relaxed">{sidebarFocusLabel}</span>}
                    />
                  </div>
                </div>

              </div>

              {/* error banner */}
              {error ? (
                <div className="shrink-0 border-b border-zinc-200 bg-red-50 px-4 py-2.5">
                  <div className="flex gap-2">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-red-500" />
                    <p className="text-[12px] leading-relaxed text-red-700">{error}</p>
                  </div>
                </div>
              ) : null}

              <PlanningPanel
                plan={activePlan}
                planningStatus={planningStatus}
                requirePlanApproval={requirePlanApproval}
                isApproving={isApprovingPlan}
                onApprove={approvePlan}
                onOpenPermissions={() => setPermissionsOpen(true)}
              />

              {/* feed */}
              <div
                ref={feedRef}
                className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#fffefb,#f8f4ed)] px-4 py-4 [scrollbar-width:thin] sm:px-5 sm:py-5"
              >
                {visibleActions.length === 0 && !isRunning && !(planningStatus === "needs-input" && clarificationQuestions.length > 0) ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="rounded-[1.5rem] border border-[#e4ddd2] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.96))] px-6 py-7 text-center shadow-[0_24px_52px_-40px_rgba(0,0,0,0.28)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Session feed</p>
                      <p className="mt-3 text-[13px] font-medium text-zinc-700">
                        {status === "idle" ? "Ready to build" : "No messages yet"}
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                        {status === "idle" ? "Run the agent or send instructions below." : "Messages will appear here."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative space-y-3.5 before:absolute before:bottom-3 before:left-[14px] before:top-2 before:w-px before:bg-[linear-gradient(180deg,rgba(180,164,138,0),rgba(180,164,138,0.42),rgba(180,164,138,0))]">
                    <AnimatePresence initial={false}>
                      {visibleActions.map((action, i) => {
                        const isLatest = i === visibleActions.length - 1 && isRunning
                        return (
                          <motion.div
                            key={action.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.14 }}
                          >
                            <ActionCard
                              action={action}
                              isLatest={isLatest}
                            />
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>

                    {planningStatus === "needs-input" && clarificationQuestions.length > 0 ? (
                      <ClarificationPanel
                        questions={clarificationQuestions}
                        selectedAnswers={selectedClarificationAnswers}
                        isSubmitting={isSubmittingClarificationAnswers}
                        onSelectAnswer={selectClarificationAnswer}
                        onSubmitAnswers={submitClarificationAnswers}
                        onOpenPermissions={() => setPermissionsOpen(true)}
                      />
                    ) : null}

                    {isRunning ? (
                      <div className="px-1 py-2">
                        <TextShimmer className="text-[13px] text-zinc-500" duration={1.8}>
                          Thinking
                        </TextShimmer>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* input */}
              <div className="shrink-0 border-t border-[#ede8e0] bg-[#faf9f6] p-3 sm:p-4">
                <AnimatedAIInput
                  mode="chat"
                  compact
                  surface="code"
                  placeholder={inputPlaceholder}
                  isLoading={isRunning}
                  onStop={stopRun}
                  onSubmit={submitChatMessage}
                />
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* ── Main viewport ── */}
        <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:rounded-[1.6rem]">
          {/* tab bar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-[#faf9f5] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              {tabs.map(tab => (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2 text-[11px]">
              {steps.length > 0 && !isActive && status === "complete" ? (
                <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                  Done
                </span>
              ) : steps.length > 0 && isActive ? (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                  <PulseDot color="bg-amber-400" />
                  {stepsCompleteCount}/{steps.length}
                </span>
              ) : !isActive && status !== "idle" && hasFiles ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                  {files.length} file{files.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>

          {/* content */}
          <div className="relative min-h-0 flex-1 bg-[#f7f5f1]">
            <AnimatePresence mode="wait">
              {/* ── Browser ── */}
              {activeTab === "browser" && (
                <motion.div
                  key="browser"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex h-full items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.7),rgba(240,236,228,0.8))] p-4 sm:p-6"
                >
                  {computer?.browserbaseLiveViewUrl ? (
                    <div className="flex h-full w-full max-w-[720px] flex-col items-center">
                      {/* monitor shell */}
                      <div className="w-full rounded-[1.4rem] border border-[#7a7060] bg-[linear-gradient(160deg,#cec3b0,#a89880)] p-2.5 shadow-[0_32px_80px_-40px_rgba(0,0,0,0.4)] sm:rounded-[1.6rem]">
                        <div className="rounded-[1.1rem] border border-[#8e8070] bg-[linear-gradient(180deg,#c4b8a4,#a89880)] px-3 pb-3 pt-5 sm:rounded-[1.2rem] sm:px-5 sm:pb-5 sm:pt-7">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#706254]">BuildKit</span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8a7a68]">Live</span>
                          </div>
                          <div className="overflow-hidden rounded-[0.85rem] border-[8px] border-[#282a2d] shadow-[inset_0_3px_14px_rgba(0,0,0,0.35)]">
                            <div className="aspect-[4/3] w-full bg-white">
                              <iframe
                                src={computer.browserbaseLiveViewUrl}
                                className="h-[117.65%] w-[117.65%] origin-top-left scale-[0.85] border-0 bg-white"
                                title="Browserbase live view"
                                sandbox="allow-scripts allow-same-origin allow-forms"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* base */}
                      <div className="mt-1.5 w-[88%] rounded-b-[1rem] rounded-t-lg border border-t-0 border-[#7a7060] bg-[linear-gradient(180deg,#b0a490,#9a8c7c)] px-4 py-2.5 shadow-[0_20px_48px_-30px_rgba(0,0,0,0.3)]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-[#6a6050]" />
                            <div className="h-2 w-2 rounded-full bg-[#80756a]" />
                          </div>
                          <div className="h-1.5 flex-1 rounded-full bg-[#857870]" />
                          <div className="h-4 w-10 rounded border border-[#7a7060] bg-[#d0c4b0]" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyPane
                      icon={<Globe className="h-6 w-6" />}
                      title="No browser session"
                      subtitle="A live view appears here once the agent starts researching."
                    />
                  )}
                </motion.div>
              )}

              {/* ── Preview ── */}
              {activeTab === "preview" && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="h-full"
                >
                  {computer?.sandboxUrl ? (
                    <div className="flex h-full flex-col">
                      {/* address bar */}
                      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2">
                        <div className="flex gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                          <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
                        </div>
                        <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                          <Globe className="h-3 w-3 shrink-0 text-zinc-400" />
                          <span className="truncate font-mono text-[11px] text-zinc-500">{computer.sandboxUrl}</span>
                        </div>
                        <a
                          href={computer.sandboxUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <iframe
                        key={computer.sandboxUrl}
                        src={computer.sandboxUrl}
                        className="min-h-0 flex-1 border-0"
                        title="Preview"
                        allow="same-origin"
                      />
                    </div>
                  ) : (
                    <EmptyPane
                      icon={<Monitor className="h-6 w-6" />}
                      title="Preview not ready"
                      subtitle="The live preview appears once the dev sandbox is running."
                    />
                  )}
                </motion.div>
              )}

              {/* ── Code ── */}
              {activeTab === "code" && (
                <motion.div
                  key="code"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="h-full"
                >
                  {files.length === 0 ? (
                    isActive ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[0, 1, 2].map(i => (
                              <motion.span
                                key={i}
                                className="h-1.5 w-1.5 rounded-full bg-zinc-300"
                                animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
                                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                              />
                            ))}
                          </div>
                          <TextShimmer className="text-[12px] text-zinc-400">Generating files…</TextShimmer>
                        </div>
                      </div>
                    ) : (
                      <EmptyPane
                        icon={<Code2 className="h-6 w-6" />}
                        title="No files yet"
                        subtitle="Generated files appear here once the agent starts building."
                      />
                    )
                  ) : (
                    <div className="flex h-full flex-col bg-white md:flex-row">
                      <ProjectFileTree
                        files={files}
                        selectedFile={selectedFile}
                        onSelectFile={setSelectedFile}
                        isGenerating={Boolean(currentGeneratingFile)}
                        className="w-full border-b border-zinc-100 bg-[#fafaf7] md:h-full md:w-56 md:border-b-0 md:border-r"
                      />
                      <div className="min-h-0 min-w-0 flex-1">
                        {selectedFile ? (
                          <div className="flex h-full flex-col">
                            <div className="flex items-center gap-2 border-b border-zinc-100 bg-[#fafaf7] px-3 py-2 sm:px-4">
                              <Code2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                              <span className="truncate font-mono text-[11px] text-zinc-500">{selectedFile.path}</span>
                            </div>
                            <div className="min-h-0 flex-1">
                              <Editor
                                height="100%"
                                language={getLanguageFromPath(selectedFile.path)}
                                value={selectedFile.content}
                                theme="vs-light"
                                options={{
                                  readOnly: true,
                                  minimap: { enabled: false },
                                  fontSize: 12,
                                  lineNumbers: "on",
                                  scrollBeyondLastLine: false,
                                  wordWrap: "on",
                                  automaticLayout: true,
                                  padding: { top: 14 },
                                  renderLineHighlight: "line",
                                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-[12px] text-zinc-400">
                            Select a file to view the code.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Research ── */}
              {activeTab === "research" && (
                <motion.div
                  key="research"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="h-full overflow-y-auto p-4 [scrollbar-width:thin] sm:p-6"
                >
                  {!computer?.researchSources?.length ? (
                    <EmptyPane
                      icon={<BookOpen className="h-6 w-6" />}
                      title="No research yet"
                      subtitle="Pages visited by the agent will appear here."
                    />
                  ) : (
                    <div className="mx-auto max-w-5xl">
                      <div className="mb-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Research Library</p>
                        <p className="mt-1 text-[12px] text-zinc-500">
                          {computer.researchSources.length} source{computer.researchSources.length === 1 ? "" : "s"} visited
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {computer.researchSources.map((source, i) => (
                          <article
                            key={`${source.url}-${i}`}
                            className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                          >
                            {source.screenshotUrl ? (
                              <div className="aspect-[16/9] overflow-hidden bg-zinc-100">
                                <img src={source.screenshotUrl} alt={source.title} className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div className="flex aspect-[16/9] items-center justify-center bg-[#f7f5f1]">
                                <Globe className="h-7 w-7 text-zinc-200" />
                              </div>
                            )}
                            <div className="p-4">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="line-clamp-1 text-[13px] font-semibold text-zinc-900 hover:underline"
                              >
                                {source.title || source.url}
                              </a>
                              <p className="mt-0.5 truncate text-[10px] text-zinc-400">{source.url}</p>
                              <p className="mt-2.5 line-clamp-4 text-[12px] leading-relaxed text-zinc-500">
                                {source.extractedContent}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ── Deploy Modal ── */}
      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent className="max-w-lg border-zinc-200 bg-[#f8f7f4]">
          <DialogHeader>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              <ShieldCheck className="h-2.5 w-2.5" />
              Permissions
            </div>
            <DialogTitle className="mt-3 text-[18px] font-semibold text-zinc-900">
              Agent permissions
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-zinc-500">
              Keep the planning checkpoint on when you want a review before code generation. Turn it off only when you want the agent to continue with more autonomy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">Require plan approval before build</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                    When enabled, the agent researches and drafts a plan, then pauses for your approval before it generates files.
                  </p>
                </div>
                <Switch
                  checked={permissionsDraft}
                  onCheckedChange={setPermissionsDraft}
                  className="data-[state=checked]:bg-zinc-900 data-[state=unchecked]:bg-zinc-200"
                />
              </div>
            </div>

            {!permissionsDraft ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <p className="text-[12px] font-semibold text-amber-900">Heads up</p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                  With plan approval off, the agent can move faster, but it may continue from reasonable assumptions after planning instead of waiting for you to confirm the direction.
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5">
              <p className="text-[12px] font-semibold text-zinc-900">Clone work stays frontend-only</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                When the brief is to clone or recreate an existing site, the agent only reproduces the frontend experience. It does not attempt backend cloning.
              </p>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setPermissionsDraft(requirePlanApproval)
                setPermissionsOpen(false)
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePermissions}
              disabled={isSavingPermissions}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {isSavingPermissions ? "Saving..." : "Save permissions"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-2xl overflow-hidden border-zinc-200 bg-[#f8f7f4] p-0">
          <DialogHeader>
            <div className="border-b border-zinc-200 bg-[#faf9f6] px-5 py-5 sm:px-6">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                <Rocket className="h-2.5 w-2.5" />
                Publish
              </div>
              <DialogTitle className="mt-3 text-[18px] font-semibold text-zinc-900 sm:text-xl">
                Deploy your site
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-zinc-500">
                Publish to Netlify or Vercel. Your Netlify account must be connected first.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-5 py-5 [scrollbar-width:thin] sm:px-6">
            {/* provider tabs */}
            <div className="mb-4 inline-flex rounded-xl border border-zinc-200 bg-white p-1">
              {(["netlify", "vercel"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDeployTab(p)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-[12px] font-semibold capitalize transition-colors",
                    deployTab === p ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* netlify panel */}
            {deployTab === "netlify" && (
              <div className="space-y-4">
                {deployLinks?.siteUrl && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-green-600">Live</p>
                    <a
                      href={deployLinks.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-white px-3 py-3 transition-colors hover:bg-green-50"
                    >
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{deployLinks.siteUrl}</p>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    </a>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1.5">Site name (optional)</label>
                  <Input
                    value={netlifySiteName}
                    onChange={e => setNetlifySiteName(e.target.value)}
                    placeholder={computer?.name || "my-site"}
                    className="rounded-xl border-zinc-200 text-[13px]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDeployToNetlify}
                  disabled={isDeploying || netlifyConnected === null}
                  className="w-full rounded-xl bg-zinc-900 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
                >
                  {isDeploying ? "Publishing…" :
                   netlifyConnected === null ? "Checking…" :
                   !netlifyConnected ? "Connect Netlify" :
                   deployLinks?.siteUrl ? "Republish" : "Publish with Netlify"}
                </button>

                {deployError && (
                  <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-[12px] text-red-700">{deployError}</p>
                  </div>
                )}

                {(isDeploying || deployLogs.length > 0) && (
                  <DeployLogConsole step={deployStep} logs={deployLogs} isRunning={isDeploying} />
                )}
              </div>
            )}

            {/* vercel panel */}
            {deployTab === "vercel" && (
              <div className="space-y-4">
                {vercelDeployLinks?.siteUrl && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-green-600">Live</p>
                    <a
                      href={vercelDeployLinks.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-white px-3 py-3 transition-colors hover:bg-green-50"
                    >
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{vercelDeployLinks.siteUrl}</p>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    </a>
                  </div>
                )}

                {!vercelConnected && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[12px] font-semibold text-amber-800">Vercel access token required</p>
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      Create a token at{" "}
                      <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="font-bold underline">
                        vercel.com/account/tokens
                      </a>
                    </p>
                    <Input
                      value={vercelTokenInput}
                      onChange={e => setVercelTokenInput(e.target.value)}
                      placeholder="Token"
                      className="mt-3 rounded-xl border-amber-200 text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveVercelToken}
                      disabled={!vercelTokenInput.trim()}
                      className="mt-2 w-full rounded-xl bg-zinc-900 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      Save token
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDeployToVercel}
                  disabled={isVercelDeploying || !vercelConnected}
                  className="w-full rounded-xl border border-zinc-300 bg-white py-3 text-[13px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-40"
                >
                  {isVercelDeploying ? "Publishing…" : vercelDeployLinks?.siteUrl ? "Republish" : "Publish with Vercel"}
                </button>

                {vercelDeployError && (
                  <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-[12px] text-red-700">{vercelDeployError}</p>
                  </div>
                )}

                {(isVercelDeploying || vercelDeployLogs.length > 0) && (
                  <DeployLogConsole step={vercelDeployStep} logs={vercelDeployLogs} isRunning={isVercelDeploying} />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
