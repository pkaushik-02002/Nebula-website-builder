"use client"

import * as React from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

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
        "group flex items-center gap-2 text-xs sm:text-sm text-zinc-500 hover:text-zinc-300 transition-colors",
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
          "mt-2 overflow-hidden text-xs sm:text-sm text-zinc-500 whitespace-pre-wrap",
          className
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}
