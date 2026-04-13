"use client"

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { Loader2, Check, Sparkles, AlertCircle } from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { AnimatePresence, motion } from "framer-motion"

type StepStatus = "pending" | "running" | "complete" | "error"
type StepPhase = "Planning" | "Building" | "Validating" | "Finalizing"

type ThinkingStep = {
  id: string
  label: string
  status: StepStatus
  phase: StepPhase
}

export interface ThinkingBarProps {
  text: string
  steps: string[]
  isGenerating?: boolean
  currentFile?: string | null
  className?: string
}

function resolvePhase(label: string, index: number, total: number): StepPhase {
  const lower = label.toLowerCase()
  if (/plan|scope|analy|reason|understand|design/.test(lower)) return "Planning"
  if (/build|create|write|implement|refactor|update|code/.test(lower)) return "Building"
  if (/validat|test|check|verify|lint|review/.test(lower)) return "Validating"
  if (/final|finish|complete|done|ship|deploy/.test(lower)) return "Finalizing"
  if (total <= 1) return "Building"
  const bucket = Math.floor((index / Math.max(total - 1, 1)) * 3)
  return bucket === 0 ? "Planning" : bucket === 1 ? "Building" : bucket === 2 ? "Validating" : "Finalizing"
}

function statusStyles(status: StepStatus, phase: StepPhase) {
  const phaseTone =
    phase === "Planning"
      ? "from-zinc-200/85"
      : phase === "Building"
        ? "from-zinc-100/90"
        : phase === "Validating"
          ? "from-[#ecece6]/90"
          : "from-[#e8e7df]/90"

  if (status === "complete") {
    return {
      dot: "border-zinc-700 bg-zinc-700 text-white shadow-[0_0_0_2px_rgba(63,63,70,0.1)]",
      card: `border-zinc-300 bg-gradient-to-r ${phaseTone} to-white opacity-85`,
      title: "text-zinc-800",
      line: "bg-zinc-300",
      phase: "text-zinc-500",
    }
  }
  if (status === "running") {
    return {
      dot: "border-zinc-700 bg-zinc-700 text-white shadow-[0_0_0_6px_rgba(63,63,70,0.14)]",
      card: `border-zinc-400 bg-gradient-to-r ${phaseTone} to-white shadow-[0_0_24px_rgba(24,24,27,0.08)]`,
      title: "text-zinc-900",
      line: "bg-gradient-to-b from-zinc-500/90 via-zinc-400/70 to-zinc-300",
      phase: "text-zinc-600",
    }
  }
  if (status === "error") {
    return {
      dot: "border-rose-500 bg-rose-500 text-white",
      card: "border-rose-200 bg-rose-50/85",
      title: "text-rose-700",
      line: "bg-rose-300",
      phase: "text-rose-500",
    }
  }
  return {
    dot: "border-zinc-300 bg-white text-zinc-400",
    card: "border-zinc-200 bg-white/80",
    title: "text-zinc-500",
    line: "bg-zinc-200",
    phase: "text-zinc-400",
  }
}

export function ThinkingBar({
  text,
  steps,
  isGenerating = false,
  currentFile,
  className,
}: ThinkingBarProps) {
  const timelineSteps = useMemo<ThinkingStep[]>(() => {
    const normalized = steps.length > 0 ? steps : [text || "Preparing update"]
    const activeIndex = isGenerating ? Math.max(normalized.length - 1, 0) : -1

    return normalized.map((label, index) => {
      const lower = label.toLowerCase()
      const failed = /error|failed|failure/.test(lower)
      const status: StepStatus =
        failed ? "error" : activeIndex === -1 ? "complete" : index < activeIndex ? "complete" : index === activeIndex ? "running" : "pending"
      return { id: String(index), label, status, phase: resolvePhase(label, index, normalized.length) }
    })
  }, [steps, text, isGenerating])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-2xl border border-zinc-200 bg-white/75 p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.45)] backdrop-blur-md", className)}
    >
      {isGenerating ? (
        <div className="mb-4">
          <TextShimmer className="text-xs uppercase tracking-widest text-zinc-500">Lotus.build Agent Orchestrating Build</TextShimmer>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white">
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-700" /> : <Sparkles className="h-3.5 w-3.5 text-zinc-700" />}
          </div>
          {isGenerating ? (
            <TextShimmer className="text-sm font-medium tracking-tight text-zinc-900">{text || "Making updates"}</TextShimmer>
          ) : (
            <p className="text-sm font-medium tracking-tight text-zinc-900">{text || "Build complete"}</p>
          )}
        </div>
        {currentFile ? <p className="truncate text-xs text-zinc-500">{currentFile}</p> : <Check className="h-4 w-4 text-zinc-600" />}
      </div>

      <motion.div
        className="relative space-y-2 pl-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.02 } },
        }}
      >
        <motion.div
          aria-hidden
          className={cn("absolute bottom-1 left-[9px] top-1 w-px rounded-full", isGenerating ? "bg-gradient-to-b from-zinc-500 via-zinc-300 to-zinc-200" : "bg-zinc-300")}
          animate={isGenerating ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.8 }}
          transition={isGenerating ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.25 }}
        />
        {timelineSteps.map((step) => {
          const styles = statusStyles(step.status, step.phase)
          const isActive = step.status === "running" && isGenerating
          return (
            <motion.div
              key={step.id}
              layout
              variants={{
                hidden: { opacity: 0, y: 8, x: -8 },
                show: { opacity: 1, y: 0, x: 0, transition: { duration: 0.28, ease: "easeOut" } },
              }}
            >
              <div className={cn("relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors", styles.card)}>
                <div className={cn("absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2", styles.line)} />
                <motion.div
                  className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", styles.dot)}
                  animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={isActive ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                >
                  {step.status === "complete" ? <Check className="h-3 w-3" /> : step.status === "error" ? <AlertCircle className="h-3 w-3" /> : <div className={cn("rounded-full", isActive ? "h-2 w-2 bg-white animate-pulse" : "h-1.5 w-1.5 bg-zinc-400")} />}
                </motion.div>
                <div className="min-w-0">
                  <p className={cn("mb-0.5 text-[11px] uppercase tracking-wide", styles.phase)}>{step.phase}</p>
                  <AnimatePresence mode="wait" initial={false}>
                    {isActive ? (
                      <motion.div key={`${step.id}-shimmer`} initial={{ opacity: 0.75 }} animate={{ opacity: 1 }} exit={{ opacity: 0.9 }}>
                        <TextShimmer className="text-sm font-medium tracking-tight">{step.label}</TextShimmer>
                      </motion.div>
                    ) : (
                      <motion.p key={`${step.id}-static`} initial={{ opacity: 0.75 }} animate={{ opacity: 1 }} exit={{ opacity: 0.95 }} className={cn("text-sm font-medium tracking-tight", styles.title)}>
                        {step.label}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
