"use client"

import type { PlanningStatus, ProjectBlueprint } from "@/app/project/[id]/types"
import { cn } from "@/lib/utils"

function shorten(value?: string) {
  if (!value) return value
  const trimmed = value.trim()
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 137).trimEnd()}...`
}

function SummaryRow(props: { label: string; value?: string; muted?: boolean; multiline?: boolean }) {
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

  const visibleItems = blueprint.sections
    .flatMap((section) =>
      section.items.map((item) => ({
        label: item.label,
        value: item.key === "goal" ? shorten(item.value) : item.value,
        muted: item.status !== "confirmed",
      }))
    )
    .filter((item) => item.value)
    .slice(0, 6)

  const blockingMessage =
    blueprint.openQuestions[0] ||
    blueprint.assumptions[0] ||
    (blueprint.openQuestions.length > 0 ? "Confirm a few more details before we build" : "")

  const introCopy =
    planningStatus === "approved"
      ? "This is the reviewed plan the build will follow."
      : "A living version-one plan shaped by the conversation."

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#e7dfd3] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,245,238,0.92))] shadow-[0_28px_70px_-48px_rgba(24,24,27,0.38)]">
      <div className="border-b border-[#ece6db] px-6 pb-5 pt-6">
        <div className="inline-flex rounded-full border border-[#e6ddcf] bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          Live plan
        </div>
        <h2 className="mt-4 text-[1.4rem] font-semibold tracking-tight text-zinc-900">Before I build</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{introCopy}</p>
      </div>

      <div className="divide-y divide-[#eee8de] px-6 py-2">
        {visibleItems.map((item) => (
          <SummaryRow key={`${item.label}-${item.value}`} label={item.label} value={item.value} muted={item.muted} />
        ))}
        <SummaryRow
          label="Needs your input"
          value={blockingMessage || "Good to go - we can start building."}
          muted={!blockingMessage}
          multiline
        />
      </div>
    </section>
  )
}
