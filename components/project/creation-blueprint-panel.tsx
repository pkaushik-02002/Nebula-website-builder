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
      title: "Foundation",
      detail: `Set up core structure and navigation for version one. Initial surface: ${normalizeSentence(pages?.value, "Core screens and routes to be finalized")}`,
    },
    {
      title: "Core user flow",
      detail: `Implement the highest-impact journey first. Priority capabilities: ${normalizeSentence(features?.value, "Core feature flow to be defined")}`,
    },
    {
      title: "Systems and data",
      detail: `Integrate essential backend requirements for launch. Systems plan: ${normalizeSentence(systems?.value, "No backend dependencies confirmed yet")}`,
    },
    {
      title: "Content and visual polish",
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
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-5 pb-4 pt-5">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">Version-one build plan</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{introCopy}</p>
      </div>

      <div className="divide-y divide-zinc-100 px-5 py-1">
        {visibleItems.map((item) => (
          <SummaryRow key={`${item.label}-${item.value}`} label={item.label} value={item.value} muted={item.muted} />
        ))}
      </div>

      <div className="border-t border-zinc-100 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Implementation sequence</p>
        <ol className="mt-3 space-y-3">
          {planSteps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
                {index + 1}
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700">{step.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-zinc-600">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {blockingMessage ? (
        <div className="border-t border-zinc-100 px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Needs your input</p>
          <p className="mt-1 text-sm leading-6 text-zinc-700">{blockingMessage}</p>
        </div>
      ) : null}
    </section>
  )
}
