"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type ProjectItem = { id: string; name: string; region?: string }

type Props = {
  open: boolean
  projects: ProjectItem[]
  selectedId: string
  loading?: boolean
  onClose: () => void
  onChange: (id: string) => void
  onConfirm: () => void
  onCreateNew?: () => void
}

export function SupabaseProjectSelector({
  open,
  projects,
  selectedId,
  loading,
  onClose,
  onChange,
  onConfirm,
  onCreateNew,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Supabase Project</DialogTitle>
          <DialogDescription>
            Choose which Supabase project this Builder project should use.
          </DialogDescription>
        </DialogHeader>
        {projects.length > 0 ? (
          <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === p.id
                    ? "border-zinc-400 bg-white text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.region || "Unknown region"}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-[1.5rem] border border-[#e7dfd3] bg-[#faf7f2] p-5">
            <div>
              <p className="text-sm font-semibold text-zinc-900">No Supabase projects yet</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Create one here and we will link it automatically, or create it in Supabase first and then come back to refresh this list.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-[#ece3d7] bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Simple steps</p>
              <ol className="space-y-2 text-sm leading-6 text-zinc-700">
                <li>1. Create a Supabase project here and we will keep the flow moving.</li>
                <li>2. We automatically link it to this website.</li>
                <li>3. If the app needs backend setup, we continue automatically.</li>
              </ol>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-zinc-300">
            Cancel
          </Button>
          {projects.length === 0 && onCreateNew ? (
            <Button type="button" variant="outline" onClick={onCreateNew} className="border-zinc-300 text-zinc-700">
              Create New Project
            </Button>
          ) : null}
          <Button type="button" onClick={onConfirm} disabled={!selectedId || loading} className="bg-zinc-900 text-white hover:bg-black">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Link Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

