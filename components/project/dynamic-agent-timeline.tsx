"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentTimelineItem } from "@/components/project/agent-timeline-panel"
import {
  ThinkingStep,
} from "@/components/project/agent-thinking-stream"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface DynamicAgentTimelineProps {
  /** Timeline steps (overall progress) */
  timelineSteps: AgentTimelineItem[]

  /** Real-time thinking/reasoning steps */
  thinkingSteps: ThinkingStep[]

  /** Currently generating file path */
  currentGeneratingFile: string | null

  /** Number of files touched/generated */
  generatedFileCount: number

  /** Is actively streaming */
  isStreaming: boolean

  /** Agent status text (what it's doing now) */
  agentStatus?: string

  /** "agent" | "build" - differentiates display style */
  mode?: "agent" | "build"

  /** Show reasoning/thinking panel */
  showThinking?: boolean

  className?: string
}

function getTimelineSummary(steps: AgentTimelineItem[]) {
  const total = steps.length
  const activeStep = steps.find((step) => step.status === "active") ?? null
  const completedCount = steps.filter((step) => step.status === "complete").length
  const currentCount = activeStep ? completedCount + 1 : completedCount
  const progress = total > 0 ? Math.min(currentCount / total, 1) : 0
  return { total, activeStep, completedCount, currentCount, progress }
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-700" />
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
        Live
      </span>
    </div>
  )
}

/**
 * Dynamic Agent Timeline — Cursor-style live log stream.
 * Steps render as a flowing terminal log, not boxed cards.
 * Agent thinking is inlined as a subtitle under the active step (no separate panel).
 */
export function DynamicAgentTimeline({
  timelineSteps,
  thinkingSteps,
  currentGeneratingFile,
  generatedFileCount,
  isStreaming,
  agentStatus,
  mode = "agent",
  showThinking = true,
  className,
}: DynamicAgentTimelineProps) {
  const { currentCount, total } = getTimelineSummary(timelineSteps)
  const activeThinkingStep = thinkingSteps.find((s) => s.status === "active")
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the latest active step
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const activeEl = container.querySelector("[data-active='true']")
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [timelineSteps, thinkingSteps, currentGeneratingFile])

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[#e7dfd2] bg-white", className)}>
      {/* Header — LiveIndicator + "Step X of Y", no progress bar */}
      <div className="flex items-center justify-between border-b border-[#eee6da] bg-[#f8f5ef] px-4 py-2.5">
        {isStreaming ? (
          <LiveIndicator />
        ) : (
          <span className="text-xs font-medium text-zinc-500">Complete</span>
        )}
        <span className="font-mono text-xs text-zinc-500">
          Step {currentCount} of {total}
        </span>
      </div>

      {/* Log stream — flowing vertical list, no boxed cards */}
      <div ref={containerRef} className="relative max-h-72 overflow-y-auto px-4 py-3">
        {/* Thin vertical connector line (git-log style) */}
        {timelineSteps.length > 0 && (
          <div className="pointer-events-none absolute inset-y-3 left-[22px] w-px bg-zinc-100" />
        )}

        <AnimatePresence initial={false}>
          {timelineSteps.map((step) => {
            const isComplete = step.status === "complete"
            const isActive = step.status === "active"
            const isPending = step.status === "pending"

            return (
              <motion.div
                key={step.key}
                data-active={isActive ? "true" : undefined}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cn("py-[5px]", isPending && "opacity-35")}
              >
                {/* Single-line row: dot + label */}
                <div className="flex items-center gap-2.5">
                  {/* Dot/icon — sits over the connector line */}
                  <div className="relative z-10 flex h-3 w-3 shrink-0 items-center justify-center bg-white">
                    {isComplete && (
                      <Check className="h-3 w-3 stroke-[2.5] text-zinc-400" />
                    )}
                    {isActive && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inset-0 animate-ping rounded-full bg-zinc-600 opacity-50" />
                        <span className="relative h-2 w-2 rounded-full bg-zinc-900" />
                      </span>
                    )}
                    {/* pending: empty column for alignment, no icon */}
                  </div>

                  {/* Label */}
                  {isActive ? (
                    <TextShimmer className="text-sm font-medium bg-gradient-to-r from-zinc-900 via-zinc-500 to-zinc-900">
                      {step.title}
                    </TextShimmer>
                  ) : isComplete ? (
                    <span className="text-sm text-zinc-400">{step.title}</span>
                  ) : (
                    <span className="text-sm text-zinc-300">{step.title}</span>
                  )}
                </div>

                {/* Extras under active step only */}
                {isActive && (
                  <div className="ml-[22px] mt-0.5 space-y-0.5">
                    {/* Inline thinking phase — no separate AgentThinkingStream panel */}
                    {mode === "agent" && showThinking && activeThinkingStep && (
                      <p className="text-xs italic text-zinc-400">
                        {activeThinkingStep.title}
                        {activeThinkingStep.phase
                          ? ` — ${activeThinkingStep.phase}`
                          : ""}
                      </p>
                    )}
                    {/* File being written */}
                    {currentGeneratingFile && (
                      <p className="font-mono text-xs text-zinc-500">
                        → {currentGeneratingFile}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Files counter — monospace, like a terminal output line */}
      <div className="border-t border-[#eee6da] bg-[#faf8f4] px-4 py-2.5">
        <span className="font-mono text-xs text-zinc-500">
          → {generatedFileCount} files written
        </span>
      </div>
    </div>
  )
}

/**
 * Compact inline version for chat/message display
 */
export function DynamicAgentTimelineCompact({
  timelineSteps,
  thinkingSteps,
  currentGeneratingFile,
  isStreaming,
  mode = "agent",
}: {
  timelineSteps: AgentTimelineItem[]
  thinkingSteps: ThinkingStep[]
  currentGeneratingFile: string | null
  isStreaming: boolean
  mode?: "agent" | "build"
}) {
  const { activeStep } = getTimelineSummary(timelineSteps)
  const activeThinking = thinkingSteps.find((s) => s.status === "active")

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-600">
      {isStreaming && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" />
          {mode === "agent" && activeThinking ? (
            <span>
              <strong>{activeThinking.title}</strong> — {activeThinking.phase}
            </span>
          ) : (
            <span>
              <strong>{activeStep?.title || "generating"}</strong>
              {currentGeneratingFile && ` — ${currentGeneratingFile}`}
            </span>
          )}
        </>
      )}
    </div>
  )
}
