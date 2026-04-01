"use client"

import { useEffect, useRef } from "react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"
import { AlertTriangle, Brain, CheckCircle, Zap } from "lucide-react"

export type ThinkingPhase = "analysis" | "planning" | "generation" | "validation"

export interface ThinkingStep {
  id: string
  phase: ThinkingPhase
  title: string
  description: string
  status: "pending" | "active" | "complete" | "error"
  details?: string[]
  timestamp: number
}

interface AgentThinkingStreamProps {
  steps: ThinkingStep[]
  isStreaming: boolean
  currentPhase?: ThinkingPhase
  className?: string
  expandedView?: boolean
}

const phaseConfig: Record<ThinkingPhase, { label: string; icon: React.ReactNode; color: string }> = {
  analysis: {
    label: "Analyzing",
    icon: <Brain className="h-4 w-4" />,
    color: "bg-[#f5f3ef] border-[#e7dfd2] text-zinc-700",
  },
  planning: {
    label: "Planning",
    icon: <Zap className="h-4 w-4" />,
    color: "bg-[#f5f3ef] border-[#e7dfd2] text-zinc-700",
  },
  generation: {
    label: "Generating",
    icon: <Zap className="h-4 w-4" />,
    color: "bg-[#f5f3ef] border-[#e7dfd2] text-zinc-700",
  },
  validation: {
    label: "Validating",
    icon: <CheckCircle className="h-4 w-4" />,
    color: "bg-[#f5f3ef] border-[#e7dfd2] text-zinc-700",
  },
}

function ThinkingStepCard({ step, isLast }: { step: ThinkingStep; isLast: boolean }) {
  const config = phaseConfig[step.phase]
  const isActive = step.status === "active"
  const isComplete = step.status === "complete"
  const isPending = step.status === "pending"
  const isError = step.status === "error"

  return (
    <div className="relative">
      {/* Connecting line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[19px] top-[45px] w-0.5 h-6",
            isComplete ? "bg-zinc-300" : isError ? "bg-red-200" : "bg-zinc-200"
          )}
        />
      )}

      <div
        className={cn(
          "relative flex gap-3 p-3 rounded-lg border transition-all duration-200",
          isActive && "border-zinc-300 bg-[#f7f4ee] shadow-md shadow-zinc-200/50",
          isComplete && "border-zinc-200 bg-[#f5f3ef]",
          isPending && "border-zinc-100 bg-zinc-50/50 opacity-60",
          isError && "border-red-200 bg-red-50/50"
        )}
      >
        {/* Phase badge icon */}
        <div
          className={cn(
            "flex shrink-0 h-8 w-8 items-center justify-center rounded-full border",
            isActive && "border-zinc-300 bg-zinc-100 text-zinc-700 animate-pulse",
            isComplete && "border-zinc-300 bg-zinc-100 text-zinc-700",
            isPending && "border-zinc-200 bg-zinc-100 text-zinc-400",
            isError && "border-red-300 bg-red-100 text-red-600"
          )}
        >
          {isError ? <AlertTriangle className="h-4 w-4" /> : config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isActive ? (
              <TextShimmer className="bg-gradient-to-r from-zinc-900 via-zinc-500 to-zinc-900 text-sm font-semibold">
                {step.title}
              </TextShimmer>
            ) : (
              <h4
                className={cn(
                  "text-sm font-semibold",
                  isComplete ? "text-zinc-800" : isError ? "text-red-700" : "text-zinc-600"
                )}
              >
                {step.title}
              </h4>
            )}

            {isActive && (
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                thinking
              </span>
            )}

            {isComplete && (
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                done
              </span>
            )}
          </div>

          <p className="text-sm text-zinc-600 mb-2">{step.description}</p>

          {/* Details list */}
          {step.details && step.details.length > 0 && (
            <div className="space-y-1 mt-2 pl-3 border-l-2 border-zinc-200">
              {step.details.map((detail, idx) => (
                <p key={idx} className="text-xs text-zinc-500">
                  • {detail}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Agent Thinking Stream - Claude-like real-time reasoning display
 * Shows agent's thinking process with structured phases and live updates
 */
export function AgentThinkingStream({
  steps,
  isStreaming,
  currentPhase,
  className,
  expandedView = true,
}: AgentThinkingStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to active step
  useEffect(() => {
    if (expandedView && containerRef.current) {
      const activeStep = containerRef.current.querySelector("[data-active='true']")
      if (activeStep) {
        activeStep.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    }
  }, [steps, expandedView])

  if (steps.length === 0) return null

  const activeStep = steps.find((s) => s.status === "active")
  const completedCount = steps.filter((s) => s.status === "complete").length
  const totalCount = steps.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#e7dfd2] bg-white",
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-[#eee6da] bg-[#f8f5ef] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-zinc-700" />
            <span className="text-sm font-semibold text-zinc-900">Reasoning</span>
          </div>

          {isStreaming && (
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" />
              <span className="text-xs font-medium text-zinc-700">Thinking</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-medium">Progress</span>
            <span className="text-xs font-mono text-zinc-400">
              {completedCount} / {totalCount}
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Thinking steps */}
      <div
        ref={containerRef}
        className={cn("px-4 py-3 space-y-2 overflow-y-auto", expandedView ? "max-h-96" : "max-h-64")}
      >
        {steps.map((step, idx) => (
          <div
            key={step.id}
            data-active={step.status === "active"}
            className={step.status === "active" ? "animate-in fade-in duration-300" : ""}
          >
            <ThinkingStepCard step={step} isLast={idx === steps.length - 1} />
          </div>
        ))}
      </div>

      {/* Footer - current phase info */}
      {activeStep && (
        <div className="border-t border-[#eee6da] bg-[#faf8f4] px-4 py-2.5 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" />
            <span>
              <strong className="text-zinc-700">{activeStep.title}</strong> — {activeStep.description}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for inline display
 */
export function AgentThinkingStreamCompact({
  steps,
  isStreaming,
  className,
}: {
  steps: ThinkingStep[]
  isStreaming: boolean
  className?: string
}) {
  const activeStep = steps.find((s) => s.status === "active")
  const completedCount = steps.filter((s) => s.status === "complete").length
  const totalCount = steps.length

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      {isStreaming && (
        <>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" />
            <span className="text-zinc-600">
              Agent thinking: <strong>{activeStep?.title || "analyzing"}</strong>
            </span>
          </div>
          <span className="text-zinc-400">
            {completedCount}/{totalCount}
          </span>
        </>
      )}
    </div>
  )
}
