"use client"

import { Loader2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = {
  open: boolean
  loading?: boolean
  hasOAuthConnection?: boolean
  error?: string
  onClose: () => void
  onConnect: () => void
  onProjectsReady?: () => void
}

export function SupabaseSetupModal({ open, loading, hasOAuthConnection, error, onClose, onConnect, onProjectsReady }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center">
            <div className="rounded-full bg-blue-50 p-3">
              <Database className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Connect Your Database</DialogTitle>
          <DialogDescription className="text-center">
            {hasOAuthConnection
              ? "Your website needs a Supabase backend. Choose an existing project or create a new one next."
              : "Your website needs a Supabase backend. Connect Supabase first, then we will help you choose or create the project."}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#e8e1d6] bg-[#faf7f2] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Simple flow</p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
              <li>1. Connect your Supabase account.</li>
              <li>2. Pick an existing project or create a new one.</li>
              <li>3. We continue the backend setup for this website.</li>
            </ol>
          </div>

          <Button
            type="button"
            onClick={onConnect}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {hasOAuthConnection ? "Select Project" : "Connect Supabase"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-full border-zinc-300">
            Skip for Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
