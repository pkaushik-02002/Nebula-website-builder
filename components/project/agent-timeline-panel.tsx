"use client"

import { Check } from "lucide-react"

import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"

export type AgentTimelineItem = {
  key: string
  title: string
  description: string
  detail: string
  accent: string
  status: "complete" | "active" | "pending"
}

function getAgentTimelineSummary(steps: AgentTimelineItem[]) {
  const total = steps.length
  const activeStep = steps.find((step) => step.status === "active") ?? null
  const completedCount = steps.filter((step) => step.status === "complete").length
  const currentCount = activeStep ? completedCount + 1 : completedCount
  const progress = total > 0 ? Math.min(currentCount / total, 1) : 0
  return { total, activeStep, completedCount, currentCount, progress }
}

/* ── Live pulse dot ── */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-900" />
    </span>
  )
}

/* ── Spinner for Running badge ── */
function Spinner() {
  return (
    <span className="inline-block h-2 w-2 animate-spin rounded-full border border-white/30 border-t-white" />
  )
}

/* ── Inline file icon ── */
function FilesIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="1.5" width="3.5" height="4" rx="0.8" />
      <rect x="7" y="5.5" width="3.5" height="4" rx="0.8" />
      <rect x="7" y="1.5" width="3.5" height="3" rx="0.8" />
    </svg>
  )
}

/* ── Grid icon for timeline header ── */
function GridIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="4.5" height="4.5" rx="1.2" />
      <rect x="8.5" y="1" width="4.5" height="4.5" rx="1.2" />
      <rect x="1" y="8.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1.2" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Header panel
───────────────────────────────────────────── */
function AgentRunHeader({
  steps,
  generatedFileCount,
  currentGeneratingFile,
}: {
  steps: AgentTimelineItem[]
  generatedFileCount: number
  currentGeneratingFile: string | null
}) {
  const { activeStep, currentCount, total, progress } = getAgentTimelineSummary(steps)
  const pct = Math.round(progress * 100)

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Top row */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
          <LiveDot />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Live run
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-400">
          <FilesIcon />
          <span className="text-[10px] font-semibold text-zinc-500">
            {generatedFileCount} files touched
          </span>
        </div>
      </div>

      {/* Current step name + mono detail */}
      <div className="px-4 pt-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
          Currently running
        </p>

        {activeStep ? (
          <TextShimmer className="bg-gradient-to-r from-zinc-950 via-zinc-500 to-zinc-950 text-[15px] font-semibold leading-snug tracking-tight">
            {activeStep.title}
          </TextShimmer>
        ) : (
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-950">
            Wrapping up
          </p>
        )}

        {(currentGeneratingFile ?? activeStep?.detail) && (
          <p className="mt-1 font-mono text-[11px] text-zinc-400">
            {currentGeneratingFile ?? activeStep?.detail}
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="mt-3 border-t border-zinc-100 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Progress
          </span>
          <span className="font-mono text-[10px] font-semibold tabular-nums text-zinc-500">
            {currentCount} / {total}
          </span>
        </div>

        <div className="h-[3px] w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {activeStep?.accent && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md border border-[#e7dfd2] bg-[#f4f1ea] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#57534e]">
              {activeStep.accent}
            </span>
            <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">
              {generatedFileCount} files touched
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Individual step row
───────────────────────────────────────────── */
function TimelineStep({
  step,
  isLast,
}: {
  step: AgentTimelineItem
  isLast: boolean
}) {
  const isComplete = step.status === "complete"
  const isActive = step.status === "active"
  const isPending = step.status === "pending"

  return (
    <div className="relative flex gap-2.5">
      {/* Vertical rail */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[10px] top-[26px] bottom-[-8px] w-px",
            isComplete ? "bg-emerald-200" : "bg-zinc-100"
          )}
        />
      )}

      {/* Marker */}
      <div className="relative z-10 flex shrink-0 flex-col items-center pt-[3px]">
        {isComplete && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-2.5 w-2.5 stroke-[3] text-white" />
          </div>
        )}

        {isActive && (
          <div className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-900">
            <span className="absolute inset-[-4px] animate-ping rounded-full border border-zinc-900/20" />
            <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-white" />
          </div>
        )}

        {isPending && (
          <div className="mt-[7px] h-2 w-2 rounded-full border-[1.5px] border-zinc-300 bg-white" />
        )}
      </div>

      {/* Step card */}
      <div
        className={cn(
          "mb-2 min-w-0 flex-1 rounded-xl border px-3 py-2.5 transition-all duration-200",
          isComplete && "border-emerald-100 bg-emerald-50/70",
          isActive && "border-zinc-200 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]",
          isPending && "border-zinc-100 bg-zinc-50/60 opacity-55"
        )}
      >
        {/* Title + badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isActive ? (
              <TextShimmer className="bg-gradient-to-r from-zinc-950 via-zinc-500 to-zinc-950 text-[13px] font-semibold leading-snug">
                {step.title}
              </TextShimmer>
            ) : (
              <p
                className={cn(
                  "text-[13px] font-semibold leading-snug",
                  isComplete ? "text-emerald-700" : "text-zinc-400"
                )}
              >
                {step.title}
              </p>
            )}
          </div>

          {isComplete && (
            <span className="shrink-0 rounded-[5px] bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700">
              Done
            </span>
          )}
          {isActive && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-zinc-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
              <Spinner />
              Running
            </span>
          )}
          {isPending && (
            <span className="shrink-0 rounded-[5px] bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-400">
              Queued
            </span>
          )}
        </div>

        {/* Accent tag */}
        {step.accent && (
          <div className="mt-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
                isComplete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isActive
                    ? "border-[#e7dfd2] bg-[#f4f1ea] text-[#57534e]"
                    : "border-zinc-200 bg-zinc-100 text-zinc-400"
              )}
            >
              {step.accent}
            </span>
          </div>
        )}

        {/* Description */}
        {step.description && (
          <div className="mt-1.5">
            {isActive ? (
              <TextShimmer className="bg-gradient-to-r from-zinc-600 via-zinc-400 to-zinc-600 text-[11px] leading-relaxed">
                {step.description}
              </TextShimmer>
            ) : (
              <p
                className={cn(
                  "text-[11px] leading-relaxed",
                  isComplete ? "text-emerald-600/80" : "text-zinc-400"
                )}
              >
                {step.description}
              </p>
            )}
          </div>
        )}

        {/* Detail / mono path */}
        {step.detail && (
          <p
            className={cn(
              "mt-1 font-mono text-[10px]",
              isComplete ? "text-emerald-500/70" : isActive ? "text-zinc-400" : "text-zinc-300"
            )}
          >
            {step.detail}
          </p>
        )}
      </div>
    </div>
  )
}


function AgentTimelineRail({ steps }: { steps: AgentTimelineItem[] }) {
  const completedCount = steps.filter((s) => s.status === "complete").length

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <GridIcon />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Steps</span>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-zinc-500">
          {completedCount} / {steps.length} done
        </span>
      </div>

      {/* Steps */}
      <div className="px-3.5 pb-1.5 pt-3">
        {steps.map((step, idx) => (
          <TimelineStep
            key={step.key}
            step={step}
            isLast={idx === steps.length - 1}
          />
        ))}
      </div>
    </div>
  )
}


export function AgentTimelinePanel({
  steps,
  generatedFileCount,
  currentGeneratingFile,
}: {
  steps: AgentTimelineItem[]
  generatedFileCount: number
  currentGeneratingFile: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4">
      <AgentRunHeader
        steps={steps}
        generatedFileCount={generatedFileCount}
        currentGeneratingFile={currentGeneratingFile}
      />
      <AgentTimelineRail steps={steps} />
    </div>
  )
}
