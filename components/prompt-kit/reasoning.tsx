"use client"

import { useState, useEffect } from "react"

import { cn } from "@/lib/utils"

import {
  Brain,
  Code,
  FileSearch,
  Sparkles,
  Check,
  Loader2,
  Terminal,
  FileCode,
  Search,
  Wrench,
  ChevronDown,
  ChevronRight,
} from "lucide-react"


type StepStatus = "pending" | "running" | "completed"


interface TimelineStep {
  id: string
  type: "thinking" | "tool_call" | "code" | "search" | "result"
  title: string
  description?: string
  content?: string
  status: StepStatus
  duration?: string
  toolName?: string
  expanded?: boolean
}


interface AgentTimelineProps {
  steps: TimelineStep[]
  isStreaming?: boolean
}


function ShimmerLine({ width = "w-full" }: { width?: string }) {
  return <div className={cn("h-3 rounded shimmer", width)} />
}


function ShimmerBlock() {
  return (
    <div className="space-y-2">
      <ShimmerLine width="w-3/4" />
      <ShimmerLine width="w-full" />
      <ShimmerLine width="w-1/2" />
    </div>
  )
}


function StatusIndicator({ status, type }: { status: StepStatus; type: TimelineStep["type"] }) {
  if (status === "pending") {
    return (
      <div className="size-8 rounded-full bg-muted flex items-center justify-center">
        <div className="size-2 rounded-full bg-muted-foreground/50" />
      </div>
    )
  }

  if (status === "running") {
    return (
      <div className="size-8 rounded-full bg-secondary flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 rounded-full shimmer" />
        <Loader2 className="size-4 text-foreground animate-spin relative z-10" />
      </div>
    )
  }

  const icons = {
    thinking: Brain,
    tool_call: Wrench,
    code: Code,
    search: Search,
    result: Sparkles,
  }

  const Icon = icons[type]

  return (
    <div className="size-8 rounded-full bg-primary flex items-center justify-center">
      <Icon className="size-4 text-primary-foreground" />
    </div>
  )
}


function StepShimmerOverlay() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg">
      <div className="absolute inset-0 shimmer opacity-30" />
    </div>
  )
}


function TimelineStepItem({
  step,
  isLast,
  onToggle,
}: {
  step: TimelineStep
  isLast: boolean
  onToggle: () => void
}) {
  const isExpandable = step.content || step.type === "code" || step.type === "tool_call"
  const isRunning = step.status === "running"

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className={cn(
          "absolute left-4 top-10 bottom-0 w-px -translate-x-1/2",
          isRunning ? "bg-gradient-to-b from-primary/40 to-border" : "bg-border"
        )} />
      )}

      {/* Status indicator */}
      <div className="relative z-10 shrink-0">
        <StatusIndicator status={step.status} type={step.type} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <div
          onClick={isExpandable ? onToggle : undefined}
          className={cn(
            "w-full text-left relative rounded-lg transition-all duration-300",
            isExpandable && "cursor-pointer hover:bg-secondary/50 -mx-2 px-2 py-1",
            isRunning && "bg-secondary/30 -mx-2 px-2 py-2"
          )}
        >
          {isRunning && <StepShimmerOverlay />}
          
          <div className="flex items-center gap-2 relative z-10">
            {isExpandable && (
              step.expanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )
            )}
            <span className={cn(
              "font-medium text-sm",
              isRunning && "animate-shimmer bg-[length:200%_100%] bg-clip-text text-transparent bg-gradient-to-r from-primary/60 via-primary/20 to-primary/60 font-semibold",
              step.status === "completed" && "text-foreground",
              step.status === "pending" && "text-muted-foreground"
            )}>
              {step.title}
            </span>
            {step.duration && step.status === "completed" && (
              <span className="text-xs text-muted-foreground ml-auto">
                {step.duration}
              </span>
            )}
            {step.status === "completed" && (
              <Check className="size-3 text-emerald-500 ml-1" />
            )}
          </div>

          {step.description && (
            <p className={cn(
              "text-xs mt-1 ml-6 relative z-10",
              isRunning ? "text-muted-foreground/80" : "text-muted-foreground"
            )}>
              {step.description}
            </p>
          )}
        </div>

        {/* Expanded content */}
        {step.expanded && step.status !== "pending" && (
          <div className="mt-3 ml-6">
            {isRunning ? (
              <div className="bg-secondary/50 rounded-lg p-4 border border-border relative overflow-hidden">
                <div className="absolute inset-0 shimmer opacity-20" />
                <div className="relative z-10">
                  <ShimmerBlock />
                </div>
              </div>
            ) : step.content ? (
              <div className="bg-secondary/50 rounded-lg border border-border overflow-hidden">
                {step.type === "code" && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                    <FileCode className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-mono">
                      {step.toolName || "output"}
                    </span>
                  </div>
                )}
                {step.type === "tool_call" && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                    <Terminal className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-mono">
                      {step.toolName || "tool"}
                    </span>
                  </div>
                )}
                <pre className="p-4 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                  {step.content}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}


export function AgentTimeline({ steps, isStreaming = false }: AgentTimelineProps) {
  return (
    <div className="w-full">
      {steps.map((step, index) => (
        <TimelineStepItem
          key={step.id}
          step={step}
          isLast={index === steps.length - 1}
          onToggle={() => {}}
        />
      ))}

      {isStreaming && (
        <div className="flex items-center gap-3 mt-2 ml-1">
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce" />
          </div>
          <span className="text-xs text-muted-foreground">Processing...</span>
        </div>
      )}
    </div>
  )
}


// Demo component with interactive state
export function AgentTimelineDemo() {
  const [steps, setSteps] = useState<TimelineStep[]>([
    {
      id: "1",
      type: "thinking",
      title: "Analyzing request",
      description: "Understanding the user's requirements for the landing page",
      status: "running",
      expanded: true,
    },
    {
      id: "2",
      type: "search",
      title: "Searching codebase",
      description: "Looking for existing components and patterns",
      status: "pending",
      content: `Found 12 relevant files:

├── components/ui/button.tsx
├── components/ui/card.tsx
├── components/hero-section.tsx
├── lib/utils.ts
└── ... 8 more files`,
      expanded: false,
    },
    {
      id: "3",
      type: "tool_call",
      title: "Reading file: components/ui/button.tsx",
      toolName: "Read",
      status: "pending",
      content: `import * as React from "react"

import { Slot } from "@radix-ui/react-slot"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"


const buttonVariants = cva(
  "inline-flex items-center justify-center...",
  { variants: { ... } }
)`,
      expanded: false,
    },
    {
      id: "4",
      type: "thinking",
      title: "Planning implementation",
      description: "Designing the component architecture and layout",
      status: "pending",
      expanded: false,
    },
    {
      id: "5",
      type: "code",
      title: "Writing code: app/page.tsx",
      toolName: "app/page.tsx",
      status: "pending",
      content: `export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <FeaturesGrid />
      <CTASection />
    </main>
  )
}`,
      expanded: false,
    },
    {
      id: "6",
      type: "tool_call",
      title: "Creating component: HeroSection",
      toolName: "Write",
      status: "pending",
      expanded: false,
    },
    {
      id: "7",
      type: "result",
      title: "Generating preview",
      status: "pending",
      expanded: false,
    },
  ])


  const [isStreaming, setIsStreaming] = useState(true)

  const toggleStep = (id: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, expanded: !step.expanded } : step
      )
    )
  }

  // Simulate progress
  useEffect(() => {
    const durations = ["0.8s", "1.2s", "0.3s", "1.5s", "2.1s", "1.8s", "0.5s"]
    
    const timer = setTimeout(() => {
      setSteps((prev) => {
        const updated = [...prev]
        const runningIndex = updated.findIndex((s) => s.status === "running")
        if (runningIndex !== -1) {
          updated[runningIndex] = {
            ...updated[runningIndex],
            status: "completed",
            duration: durations[runningIndex] || "1.0s",
          }
          if (runningIndex + 1 < updated.length) {
            updated[runningIndex + 1] = {
              ...updated[runningIndex + 1],
              status: "running",
              expanded: true,
            }
          }
        }
        return updated
      })
    }, 2000)

    return () => clearTimeout(timer)
  }, [steps])

  useEffect(() => {
    const allCompleted = steps.every((s) => s.status === "completed")
    if (allCompleted) {
      setIsStreaming(false)
    }
  }, [steps])

  return (
    <div className="w-full">
      {steps.map((step, index) => (
        <TimelineStepItem
          key={step.id}
          step={step}
          isLast={index === steps.length - 1}
          onToggle={() => toggleStep(step.id)}
        />
      ))}

      {isStreaming && (
        <div className="flex items-center gap-3 mt-2 ml-1">
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
            <div className="size-1.5 rounded-full bg-primary/60 animate-bounce" />
          </div>
          <span className="text-xs text-muted-foreground">Processing...</span>
        </div>
      )}
    </div>
  )
}

// Original Reasoning Components for backward compatibility
import * as React from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export interface ReasoningProps {
  children: React.ReactNode
  isStreaming?: boolean
  className?: string
}

export function Reasoning({ children, isStreaming, className }: ReasoningProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      {children}
    </Collapsible>
  )
}

export interface ReasoningTriggerProps {
  children: React.ReactNode
  className?: string
}

export function ReasoningTrigger({ children, className }: ReasoningTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "group flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
    >
      <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      {children}
    </CollapsibleTrigger>
  )
}

export interface ReasoningContentProps {
  children: React.ReactNode
  className?: string
}

export function ReasoningContent({ children, className }: ReasoningContentProps) {
  return (
    <CollapsibleContent>
      <div
        className={cn(
          "mt-2 overflow-hidden text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap",
          className
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}
