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

function getItemValue(blueprint: ProjectBlueprint, key: string) {
  return blueprint.sections.flatMap((section) => section.items).find((item) => item.key === key)
}

function normalizeSentence(value?: string, fallback = "TBD") {
  if (!value) return fallback
  const cleaned = value.trim()
  if (!cleaned) return fallback
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`
}

function buildPlanSteps(blueprint: ProjectBlueprint) {
  const pages = getItemValue(blueprint, "pages")
  const features = getItemValue(blueprint, "features")
  const systems = getItemValue(blueprint, "systems")
  const content = getItemValue(blueprint, "content")
  const style = getItemValue(blueprint, "style")

  return [
    {
      title: "Step 1: Foundation",
      detail: `Set up core structure and navigation for version one. Initial surface: ${normalizeSentence(pages?.value, "Core screens and routes to be finalized")}`,
    },
    {
      title: "Step 2: Core user flow",
      detail: `Implement the highest-impact journey first. Priority capabilities: ${normalizeSentence(features?.value, "Core feature flow to be defined")}`,
    },
    {
      title: "Step 3: Systems and data",
      detail: `Integrate essential backend requirements for launch. Systems plan: ${normalizeSentence(systems?.value, "No backend dependencies confirmed yet")}`,
    },
    {
      title: "Step 4: Content and visual polish",
      detail: `Apply content model and final presentation pass. Content: ${normalizeSentence(content?.value, "Content source still open")} Style: ${normalizeSentence(style?.value, "Visual direction still open")}`,
    },
  ]
}

export function CreationBlueprintPanel(props: {
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
}) {
  const { blueprint, planningStatus } = props

  const goal = getItemValue(blueprint, "goal")
  const audience = getItemValue(blueprint, "audience")
  const type = getItemValue(blueprint, "type")
  const scope = getItemValue(blueprint, "scope")
  const visibleItems = [
    {
      label: "Primary brief",
      value: shorten(goal?.value),
      muted: goal?.status !== "confirmed",
    },
    {
      label: "Target audience",
      value: audience?.value,
      muted: audience?.status !== "confirmed",
    },
    {
      label: "Product type",
      value: type?.value,
      muted: type?.status !== "confirmed",
    },
    {
      label: "Launch scope",
      value: scope?.value,
      muted: scope?.status !== "confirmed",
    },
  ].filter((item) => item.value)

  const planSteps = buildPlanSteps(blueprint)

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
        <h2 className="mt-4 text-[1.4rem] font-semibold tracking-tight text-zinc-900">Version-one build plan</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{introCopy}</p>
      </div>

      <div className="divide-y divide-[#eee8de] px-6 py-2">
        {visibleItems.map((item) => (
          <SummaryRow key={`${item.label}-${item.value}`} label={item.label} value={item.value} muted={item.muted} />
        ))}
      </div>

      <div className="border-t border-[#eee8de] px-6 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Implementation sequence</p>
        <div className="mt-3 space-y-3">
          {planSteps.map((step) => (
            <div key={step.title} className="rounded-xl border border-[#ece6db] bg-white/70 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-700">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#eee8de] px-6 py-2">
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
