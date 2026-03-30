"use client"

import { Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = {
  open: boolean
  loading?: boolean
  error?: string
  regions?: Array<{ value: string; label: string }>
  onClose: () => void
  onCreate: (name: string, region: string, password: string) => Promise<void>
}

export function SupabaseCreateProjectModal({ open, loading, error, regions = [], onClose, onCreate }: Props) {
  const [projectName, setProjectName] = useState("")
  const [region, setRegion] = useState(regions[0]?.value || "us-east-1")
  const [dbPassword, setDbPassword] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!projectName.trim() || !region || !dbPassword.trim()) return
    
    setIsCreating(true)
    try {
      await onCreate(projectName, region, dbPassword)
      setProjectName("")
      setDbPassword("")
      setRegion(regions[0]?.value || "us-east-1")
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setProjectName("")
    setDbPassword("")
    setRegion(regions[0]?.value || "us-east-1")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? handleClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center">
            <div className="rounded-full bg-green-50 p-3">
              <Plus className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Create Supabase Project</DialogTitle>
          <DialogDescription className="text-center">
            Create a Supabase project here, then we will link it and continue setup for this website automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs font-medium text-zinc-700">
              Project Name
            </Label>
            <Input
              id="project-name"
              type="text"
              placeholder="My Website Backend"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isCreating}
              className="border-zinc-200 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-[#e8e1d6] bg-[#faf7f2] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What happens next</p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
              <li>1. We create the Supabase project in your account.</li>
              <li>2. We link it to this website.</li>
              <li>3. If the app needs backend setup, we continue automatically.</li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="region" className="text-xs font-medium text-zinc-700">
              Region
            </Label>
            <Select value={region} onValueChange={setRegion} disabled={isCreating}>
              <SelectTrigger id="region" className="border-zinc-200 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {regions.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="db-password" className="text-xs font-medium text-zinc-700">
              Database Password
            </Label>
            <Input
              id="db-password"
              type="password"
              placeholder="••••••••"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              disabled={isCreating}
              className="border-zinc-200 text-sm"
            />
            <p className="text-[11px] text-zinc-500">
              This will be used to access your database. Store it securely.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 border-zinc-300"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              className="flex-1 bg-green-600 text-white hover:bg-green-700"
              disabled={isCreating || !projectName.trim() || !dbPassword.trim()}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
