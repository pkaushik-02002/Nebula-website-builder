"use client"

import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"
import { useState } from "react"

interface PromptSuggestionProps {
  children: React.ReactNode
  onClick?: () => void
  highlight?: string
  className?: string
}

export function PromptSuggestion({
  children,
  onClick,
  highlight,
  className,
}: PromptSuggestionProps) {
  const [isHovered, setIsHovered] = useState(false)

  const renderContent = () => {
    if (!highlight) return children

    const text = children?.toString() || ""
    const parts = text.split(new RegExp(`(${highlight})`, "gi"))

    return parts.map((part, index) => {
      if (part.toLowerCase() === highlight.toLowerCase()) {
        return (
          <span key={index} className="text-primary font-medium">
            {part}
          </span>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full",
        "px-3 py-1.5 text-xs transition-all duration-200",
        "bg-secondary/50 hover:bg-secondary border border-border",
        "text-muted-foreground hover:text-foreground",
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-95",
        className
      )}
    >
      <Sparkles
        className={cn(
          "size-2.5 transition-all duration-200",
          isHovered ? "text-primary scale-110" : "text-muted-foreground/60"
        )}
      />
      <span className="whitespace-nowrap">{renderContent()}</span>
    </button>
  )
}
