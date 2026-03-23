"use client"

import type { PlanningStatus, ProjectBlueprint } from "@/app/project/[id]/types"
import { getBlueprintItem } from "@/lib/project-blueprint"
import { cn } from "@/lib/utils"

function shorten(value?: string) {
  if (!value) return value
  const trimmed = value.trim()
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 137).trimEnd()}...`
}

function SummaryRow(props: {
  label: string
  value?: string
  muted?: boolean
  multiline?: boolean
}) {
  const { label, value, muted = false, multiline = false } = props

  return (
    <div className="py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm leading-6",
          muted ? "text-zinc-500" : "text-zinc-900",
          multiline && "whitespace-pre-wrap"
        )}
      >
        {value || "Not defined yet"}
      </p>
    </div>
  )
}

export function CreationBlueprintPanel(props: {
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
}) {
  const { blueprint, planningStatus } = props

  const goal = shorten(getBlueprintItem(blueprint, "goal")?.value)
  const audience = getBlueprintItem(blueprint, "audience")
  const pages = getBlueprintItem(blueprint, "pages")
  const features = getBlueprintItem(blueprint, "features")
  const style = getBlueprintItem(blueprint, "style")
  const primaryNeed = blueprint.openQuestions[0] || blueprint.assumptions[0]
  const introCopy =
    planningStatus === "approved"
      ? "This is the reviewed plan the build will follow."
      : "A simple version-one plan you can review before building."

  return (
    <section className="rounded-[2rem] bg-white/88 p-6 ring-1 ring-[#e6dfd3] shadow-[0_24px_50px_-40px_rgba(24,24,27,0.3)]">
      <div className="border-b border-[#ece6db] pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Blueprint</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">Before I build</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{introCopy}</p>
      </div>

      <div className="divide-y divide-[#eee8de]">
        <SummaryRow label="Goal" value={goal} />
        <SummaryRow
          label="Audience"
          value={audience?.value}
          muted={audience?.status !== "confirmed"}
        />
        <SummaryRow
          label="Pages included"
          value={pages?.value}
          muted={pages?.status !== "confirmed"}
        />
        <SummaryRow
          label="Core features"
          value={features?.value}
          muted={features?.status === "unknown"}
        />
        <SummaryRow
          label="Style direction"
          value={style?.value}
          muted={style?.status !== "confirmed"}
        />
        <SummaryRow
          label="Needs your input"
          value={primaryNeed || "Nothing major is blocking the first build."}
          muted={!primaryNeed}
          multiline
        />
      </div>
    </section>
  )
}
