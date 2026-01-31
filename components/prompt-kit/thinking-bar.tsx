"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Loader2, ChevronDown, Square } from "lucide-react"

export interface ThinkingBarProps {
  text: string
  stopLabel?: string
  onStop?: () => void
  onClick?: () => void
  className?: string
}

export function ThinkingBar({
  text,
  stopLabel = "Skip thinking",
  onStop,
  onClick,
  className,
}: ThinkingBarProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-zinc-700/60 bg-zinc-800/50 px-3 py-2.5 sm:px-4 sm:py-3",
        onClick && "cursor-pointer hover:bg-zinc-800/70 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Loader2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-zinc-400 animate-spin shrink-0" />
        <span className="text-xs sm:text-sm text-zinc-300 truncate">{text}</span>
        {onClick && (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 opacity-70" aria-hidden />
        )}
      </div>
      {onStop && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStop()
          }}
          className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"
        >
          <Square className="w-3 h-3" />
          {stopLabel}
        </button>
      )}
    </div>
  )
}
