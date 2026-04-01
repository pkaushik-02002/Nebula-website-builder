"use client"

import { AgentTimelineItem } from "@/components/project/agent-timeline-panel"
import {
  AgentThinkingStream,
  ThinkingStep,
} from "@/components/project/agent-thinking-stream"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"
import { Check, Zap } from "lucide-react"

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
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
        Live
      </span>
    </div>
  )
}

/**
 * Dynamic Agent Timeline - Shows both high-level progress and real-time thinking
 * Like Claude Artifacts but for agent mode - displays the agent's reasoning alongside execution
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
  const { activeStep, currentCount, total, progress } = getTimelineSummary(timelineSteps)
  const pct = Math.round(progress * 100)
  const activeThinkingStep = thinkingSteps.find((s) => s.status === "active")

  if (mode === "agent" && showThinking) {
    // AGENT MODE: Two-panel layout - thinking + timeline
    return (
      <div className={cn("space-y-3", className)}>
        {/* Thinking Stream - Primary focus for agent mode */}
        <AgentThinkingStream
          steps={thinkingSteps}
          isStreaming={isStreaming}
          currentPhase={activeThinkingStep?.phase}
          expandedView={true}
        />

        {/* Agent Execution Timeline - Secondary view */}
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-zinc-50/50">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-zinc-900">
                  Execution Progress
                </span>
              </div>
              {isStreaming && <LiveIndicator />}
            </div>

            {/* Current task */}
            {activeStep && (
              <div className="mb-2.5">
                <TextShimmer className="bg-gradient-to-r from-amber-900 via-amber-500 to-amber-900 text-sm font-semibold">
                  {activeStep.title}
                </TextShimmer>
                {currentGeneratingFile && (
                  <p className="text-xs text-zinc-500 font-mono mt-1">
                    {currentGeneratingFile}
                  </p>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Execution</span>
                <span className="text-xs font-mono text-zinc-400">
                  {currentCount} / {total}
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Files counter */}
          <div className="px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-xs">
            <span className="text-zinc-600">Files touched</span>
            <span className="font-semibold text-zinc-900">{generatedFileCount}</span>
          </div>
        </div>
      </div>
    )
  }

  // BUILD MODE: Single unified timeline (traditional view)
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-green-50/30">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-zinc-900">Build Progress</span>
          {isStreaming && <LiveIndicator />}
        </div>

        {/* Current step */}
        {activeStep && (
          <div className="mb-2.5">
            <TextShimmer className="bg-gradient-to-r from-zinc-950 via-zinc-500 to-zinc-950 text-sm font-semibold">
              {activeStep.title}
            </TextShimmer>
            {currentGeneratingFile && (
              <p className="text-xs text-zinc-500 font-mono mt-1">{currentGeneratingFile}</p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-medium">Progress</span>
            <span className="text-xs font-mono text-zinc-400">
              {currentCount} / {total}
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Timeline steps */}
      <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
        {timelineSteps.map((step, idx) => {
          const isComplete = step.status === "complete"
          const isActive = step.status === "active"
          const isPending = step.status === "pending"

          return (
            <div key={step.key} className="relative flex gap-2.5">
              {/* Connecting line */}
              {idx < timelineSteps.length - 1 && (
                <div
                  className={cn(
                    "absolute left-[10px] top-[26px] w-px h-6",
                    isComplete ? "bg-green-200" : "bg-zinc-100"
                  )}
                />
              )}

              {/* Marker */}
              <div className="relative z-10 flex shrink-0 flex-col items-center pt-[3px]">
                {isComplete && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
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
                  "mb-2 min-w-0 flex-1 rounded-lg border px-3 py-2.5 transition-all duration-200",
                  isComplete && "border-green-100 bg-green-50/70",
                  isActive && "border-zinc-200 bg-white shadow-md",
                  isPending && "border-zinc-100 bg-zinc-50/60 opacity-55"
                )}
              >
                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isActive ? (
                      <TextShimmer className="bg-gradient-to-r from-zinc-950 via-zinc-500 to-zinc-950 text-sm font-semibold">
                        {step.title}
                      </TextShimmer>
                    ) : (
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          isComplete ? "text-green-700" : "text-zinc-400"
                        )}
                      >
                        {step.title}
                      </p>
                    )}
                  </div>

                  {isComplete && (
                    <span className="shrink-0 rounded text-xs font-bold uppercase text-green-700">
                      Done
                    </span>
                  )}
                </div>

                {/* Description */}
                {step.description && (
                  <p className="mt-1 text-xs text-zinc-500">{step.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Files counter */}
      <div className="px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-xs">
        <span className="text-zinc-600">Files touched</span>
        <span className="font-semibold text-zinc-900">{generatedFileCount}</span>
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
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
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
