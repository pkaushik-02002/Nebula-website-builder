"use client"

import React from "react"

import { cn } from "@/lib/utils"

interface TextShimmerProps {
  children: React.ReactNode
  className?: string
  duration?: number
  /** Use warm amber gradient matching the Lotus brand palette */
  warm?: boolean
}

export function TextShimmer({
  children,
  className,
  duration = 2,
  warm = false,
}: TextShimmerProps) {
  return (
    <span
      className={cn(
        "inline-flex animate-shimmer bg-[length:200%_100%] bg-clip-text text-transparent",
        warm ? "" : "bg-gradient-to-r from-zinc-400 via-zinc-100 to-zinc-400",
        className
      )}
      style={{
        animationDuration: `${duration}s`,
        ...(warm
          ? { backgroundImage: "linear-gradient(to right, #6a5240, #d4a060, #c8905a, #d4a060, #6a5240)" }
          : {}),
      }}
    >
      {children}
    </span>
  )
}
