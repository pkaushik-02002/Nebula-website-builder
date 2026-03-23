"use client"

import type { BlueprintSection } from "@/app/project/[id]/types"
import { BlueprintStatusBadge } from "@/components/project/blueprint-status-badge"

export function BlueprintSectionCard({ section }: { section: BlueprintSection }) {
  return (
    <article className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900">{section.title}</h3>
        {section.description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-500">{section.description}</p>
        ) : null}
      </div>

      <div className="space-y-3">
        {section.items.map((item) => (
          <div key={item.key} className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  {item.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-800">{item.value}</p>
              </div>
              <BlueprintStatusBadge status={item.status} />
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
