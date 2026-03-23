"use client"

import type { BlueprintItemStatus, PlanningStatus } from "@/app/project/[id]/types"
import { cn } from "@/lib/utils"

const itemStatusStyles: Record<BlueprintItemStatus, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  suggested: "border-zinc-200 bg-zinc-100 text-zinc-700",
  unknown: "border-amber-200 bg-amber-50 text-amber-800",
}

const planningStatusStyles: Record<PlanningStatus, string> = {
  draft: "border-zinc-200 bg-zinc-100 text-zinc-700",
  "needs-input": "border-amber-200 bg-amber-50 text-amber-800",
  "plan-generated": "border-zinc-200 bg-zinc-100 text-zinc-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  skipped: "border-zinc-200 bg-zinc-100 text-zinc-700",
}

export function BlueprintStatusBadge(props: {
  status: BlueprintItemStatus | PlanningStatus
  label?: string
  className?: string
}) {
  const { status, label, className } = props
  const styles =
    status in itemStatusStyles
      ? itemStatusStyles[status as BlueprintItemStatus]
      : planningStatusStyles[status as PlanningStatus]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]",
        styles,
        className
      )}
    >
      {label || status}
    </span>
  )
}
