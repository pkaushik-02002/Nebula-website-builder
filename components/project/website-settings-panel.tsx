"use client"

import { useEffect, useMemo, useState } from "react"
import { doc, updateDoc } from "firebase/firestore"
import { CheckCircle2, ChevronDown, ExternalLink, Globe, Loader2, Save } from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SupabaseConnectModal } from "@/components/project/SupabaseConnectModal"
import { SupabaseProjectSelector } from "@/components/project/SupabaseProjectSelector"
import { SchemaPreviewModal } from "@/components/project/SchemaPreviewModal"
import type { GeneratedFile, WebsiteSettings } from "@/app/project/[id]/types"
import { useAuth } from "@/contexts/auth-context"

type Props = {
  projectId: string
  initialSettings?: WebsiteSettings
  projectName?: string
  projectFiles?: GeneratedFile[]
  databaseIntegration?: {
    provider: "supabase"
    connected: boolean
    projectRef?: string
    projectUrl?: string
  }
  githubIntegration?: {
    repoFullName?: string
    repoUrl?: string
    syncedAt?: string | Date | { toDate: () => Date }
  }
  onSaved?: (next: WebsiteSettings) => void
}

const DEFAULT_SETTINGS: WebsiteSettings = {
  siteName: "",
  envVars: [],
}

function applyMetadataToFiles(files: GeneratedFile[], settings: WebsiteSettings): GeneratedFile[] {
  const nextTitle = (settings.siteName || "").trim()

  return files.map((file) => {
    if (file.path !== "index.html") return file
    let content = file.content

    if (nextTitle) {
      if (/<title>.*<\/title>/i.test(content)) {
        content = content.replace(/<title>.*<\/title>/i, `<title>${nextTitle}</title>`)
      } else {
        content = content.replace(/<\/head>/i, `  <title>${nextTitle}</title>\n</head>`)
      }
    }

    return { ...file, content }
  })
}

export function WebsiteSettingsPanel({ projectId, initialSettings, projectName, projectFiles, databaseIntegration, githubIntegration, onSaved }: Props) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<WebsiteSettings>({
    ...DEFAULT_SETTINGS,
    siteName: initialSettings?.siteName || projectName || "",
    ...(initialSettings || {}),
  })
  const [saving, setSaving] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [supabaseConnectLoading, setSupabaseConnectLoading] = useState(false)
  const [supabaseChecking, setSupabaseChecking] = useState(false)
  const [supabaseProjects, setSupabaseProjects] = useState<Array<{ ref: string; name: string; region?: string }>>([])
  const [selectedSupabaseRef, setSelectedSupabaseRef] = useState("")
  const [supabaseLinking, setSupabaseLinking] = useState(false)
  const [supabaseAccountConnected, setSupabaseAccountConnected] = useState(false)
  const [supabaseError, setSupabaseError] = useState("")
  const [supabaseConnectModalOpen, setSupabaseConnectModalOpen] = useState(false)
  const [supabaseProjectModalOpen, setSupabaseProjectModalOpen] = useState(false)
  const [schemaModalOpen, setSchemaModalOpen] = useState(false)
  const [schemaSql, setSchemaSql] = useState("")
  const [schemaTables, setSchemaTables] = useState<string[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaPushLoading, setSchemaPushLoading] = useState(false)
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubSyncing, setGithubSyncing] = useState(false)
  const [githubError, setGithubError] = useState("")
  const [githubSuccess, setGithubSuccess] = useState("")

  const envVars = useMemo(() => settings.envVars || [], [settings.envVars])
  const databaseConnected = !!databaseIntegration?.connected || !!databaseIntegration?.projectRef
  const githubSyncedLabel = useMemo(() => {
    const raw = githubIntegration?.syncedAt
    if (!raw) return ""
    const date =
      typeof raw === "object" && raw && "toDate" in raw && typeof raw.toDate === "function"
        ? raw.toDate()
        : raw instanceof Date
          ? raw
          : new Date(String(raw))
    if (Number.isNaN(date.getTime())) return ""
    return `Last synced ${date.toLocaleString()}`
  }, [githubIntegration?.syncedAt])

  const update = <K extends keyof WebsiteSettings>(key: K, value: WebsiteSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const addEnvVar = () => {
    update("envVars", [...envVars, { key: "", value: "" }])
  }

  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const next = envVars.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    update("envVars", next)
  }

  const removeEnvVar = (index: number) => {
    update("envVars", envVars.filter((_, i) => i !== index))
  }

  const getEnv = (key: string) => envVars.find((item) => item.key === key)?.value || ""

  const setEnv = (key: string, value: string) => {
    const existingIndex = envVars.findIndex((item) => item.key === key)
    if (existingIndex === -1) {
      update("envVars", [...envVars, { key, value }])
      return
    }
    const next = envVars.map((item, i) => (i === existingIndex ? { ...item, value } : item))
    update("envVars", next)
  }

  const getAuthHeader = async () => {
    if (!user) throw new Error("Please sign in.")
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }

  const refreshGitHubState = async () => {
    try {
      setGithubLoading(true)
      setGithubError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/status", { headers: authHeader })
      const json = await res.json().catch(() => ({}))
      setGithubConnected(!!json?.connected)
    } catch (e) {
      setGithubConnected(false)
      setGithubError(e instanceof Error ? e.message : "Failed to check GitHub connection.")
    } finally {
      setGithubLoading(false)
    }
  }

  const handleConnectGitHub = async () => {
    try {
      setGithubLoading(true)
      setGithubError("")
      setGithubSuccess("")
      const authHeader = await getAuthHeader()
      const res = await fetch(`/api/github/oauth/start?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) throw new Error(json?.error || "Failed to start GitHub connection.")
      window.location.href = json.url
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : "Failed to connect GitHub.")
      setGithubLoading(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    try {
      setGithubLoading(true)
      setGithubError("")
      setGithubSuccess("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/disconnect", { method: "POST", headers: authHeader })
      if (!res.ok) throw new Error("Failed to disconnect GitHub.")
      await refreshGitHubState()
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : "Failed to disconnect GitHub.")
    } finally {
      setGithubLoading(false)
    }
  }

  const handleSyncToGitHub = async () => {
    try {
      setGithubSyncing(true)
      setGithubError("")
      setGithubSuccess("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to sync project to GitHub.")
      setGithubSuccess("Project synced to GitHub.")
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : "Failed to sync to GitHub.")
    } finally {
      setGithubSyncing(false)
    }
  }

  const handleConnectAndPublish = async () => {
    if (!githubConnected) {
      await handleConnectGitHub()
      return
    }
    await handleSyncToGitHub()
  }

  const refreshSupabaseState = async () => {
    try {
      setSupabaseChecking(true)
      setSupabaseError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/supabase/projects", { headers: authHeader })
      const json = await res.json().catch(() => ({}))
      const connected = !!json?.connected
      setSupabaseAccountConnected(connected)
      const projects = Array.isArray(json?.projects)
        ? json.projects
            .map((p: any) => ({
              ref: (p?.ref || p?.id || "").toString(),
              name: (p?.name || p?.ref || "").toString(),
              region: (p?.region || "").toString(),
            }))
            .filter((p: { ref: string; name: string }) => !!p.ref)
        : []
      setSupabaseProjects(projects)
      if (!selectedSupabaseRef && projects[0]?.ref) setSelectedSupabaseRef(projects[0].ref)
      if (!connected && json?.error) setSupabaseError(String(json.error))
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to check Supabase connection.")
    } finally {
      setSupabaseChecking(false)
    }
  }

  const handleConnectSupabase = async () => {
    try {
      setSupabaseConnectLoading(true)
      setSupabaseError("")
      const authHeader = await getAuthHeader()
      const res = await fetch(`/api/integrations/supabase/authorize?builderProjectId=${encodeURIComponent(projectId)}`, {
        headers: authHeader,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) throw new Error(json?.error || "Failed to start Supabase connection.")
      window.open(json.url, "supabase-oauth", "width=560,height=760,menubar=no,toolbar=no")
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to connect Supabase.")
    } finally {
      setSupabaseConnectLoading(false)
    }
  }

  const handleLinkSupabaseProject = async () => {
    if (!selectedSupabaseRef) return
    try {
      setSupabaseLinking(true)
      setSupabaseError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/integrations/supabase/link-project", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ builderProjectId: projectId, supabaseProjectRef: selectedSupabaseRef }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to link Supabase project.")
      await refreshSupabaseState()
      setSupabaseProjectModalOpen(false)
      await generateSchemaPreview()
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to link Supabase project.")
    } finally {
      setSupabaseLinking(false)
    }
  }

  const generateSchemaPreview = async () => {
    try {
      setSchemaLoading(true)
      setSupabaseError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/supabase/generate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to generate schema")
      setSchemaSql((json?.sql || "").toString())
      setSchemaTables(Array.isArray(json?.tables) ? json.tables.map((t: any) => String(t)) : [])
      setSchemaModalOpen(true)
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to generate schema.")
    } finally {
      setSchemaLoading(false)
    }
  }

  const pushSchemaToSupabase = async () => {
    try {
      if (!schemaSql.trim()) return
      setSchemaPushLoading(true)
      setSupabaseError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/supabase/push-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId, sql: schemaSql }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to push schema")
      setSchemaModalOpen(false)
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to push schema.")
    } finally {
      setSchemaPushLoading(false)
    }
  }

  useEffect(() => {
    refreshSupabaseState()
    refreshGitHubState()
  }, [])

  useEffect(() => {
    if (!settings.siteName?.trim() && projectName?.trim()) {
      setSettings((prev) => ({ ...prev, siteName: projectName.trim() }))
    }
  }, [projectName, settings.siteName])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; ok?: boolean; message?: string }
      if (data?.type !== "supabase-oauth") return
      if (!data.ok) {
        setSupabaseError(data?.message || "Supabase connection failed.")
        return
      }
      setSupabaseConnectModalOpen(false)
      refreshSupabaseState()
      setSupabaseProjectModalOpen(true)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const ref = doc(db, "projects", projectId)
      const payload: { websiteSettings: WebsiteSettings; files?: GeneratedFile[] } = {
        websiteSettings: settings,
      }
      if (Array.isArray(projectFiles) && projectFiles.length > 0) {
        payload.files = applyMetadataToFiles(projectFiles, settings)
      }
      await updateDoc(ref, payload)
      onSaved?.(settings)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900">General</h3>
        <div className="mt-4 grid gap-4">
          <div>
            <Label className="text-zinc-700">Site Name</Label>
            <Input value={settings.siteName || ""} onChange={(e) => update("siteName", e.target.value)} className="mt-1 border-zinc-200 bg-white" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900">GitHub</h3>
        <p className="mt-1 text-xs text-zinc-500">Connect once, then publish your full project files to GitHub in one click.</p>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <span className="text-sm text-zinc-700">Account</span>
          <span className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700">
            {githubConnected ? "CONNECTED" : "NOT CONNECTED"}
          </span>
        </div>
        {githubIntegration?.repoFullName ? (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Linked Repository</p>
            <p className="mt-1 text-sm text-zinc-800">{githubIntegration.repoFullName}</p>
            {githubSyncedLabel ? <p className="mt-1 text-xs text-zinc-500">{githubSyncedLabel}</p> : null}
            {githubIntegration.repoUrl ? (
              <a
                href={githubIntegration.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-700 underline underline-offset-2"
              >
                Open Repository
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleConnectAndPublish}
            disabled={githubLoading || githubSyncing}
            className="bg-zinc-900 text-white hover:bg-black disabled:opacity-60"
          >
            {githubLoading || githubSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {!githubConnected ? "Connect & Publish" : githubIntegration?.repoFullName ? "Sync Latest Changes" : "Publish to GitHub"}
          </Button>
          {githubConnected ? (
            <Button type="button" variant="outline" onClick={handleDisconnectGitHub} disabled={githubLoading || githubSyncing} className="border-zinc-300 text-zinc-700">
              Disconnect GitHub
            </Button>
          ) : null}
        </div>
        {githubError ? <p className="mt-2 text-xs text-red-600">{githubError}</p> : null}
        {githubSuccess ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {githubSuccess}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900">Stripe</h3>
        <div className="mt-4 grid gap-4">
          <div>
            <Label className="text-zinc-700">Publishable Key</Label>
            <Input value={getEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")} onChange={(e) => setEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", e.target.value)} className="mt-1 border-zinc-200 bg-white" />
          </div>
          <div>
            <Label className="text-zinc-700">Secret Key</Label>
            <Input type="password" value={getEnv("STRIPE_SECRET_KEY")} onChange={(e) => setEnv("STRIPE_SECRET_KEY", e.target.value)} className="mt-1 border-zinc-200 bg-white" />
          </div>
          <div>
            <Label className="text-zinc-700">Webhook Secret</Label>
            <Input type="password" value={getEnv("STRIPE_WEBHOOK_SECRET")} onChange={(e) => setEnv("STRIPE_WEBHOOK_SECRET", e.target.value)} className="mt-1 border-zinc-200 bg-white" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900">Database</h3>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <span className="text-sm text-zinc-700">Supabase</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700">
            <Globe className="h-3 w-3" />
            {databaseConnected ? "CONNECTED" : supabaseAccountConnected ? "ACCOUNT CONNECTED" : "NOT CONNECTED"}
          </span>
        </div>
        {!databaseConnected && (
          <div className="mt-3 space-y-3">
            {!supabaseAccountConnected ? (
              <Button type="button" variant="outline" onClick={() => setSupabaseConnectModalOpen(true)} disabled={supabaseConnectLoading || supabaseChecking} className="border-zinc-300 text-zinc-700">
                {supabaseConnectLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Connect Supabase
              </Button>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-zinc-700">Select Supabase Project</Label>
                  <select
                    value={selectedSupabaseRef}
                    onChange={(e) => setSelectedSupabaseRef(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {supabaseProjects.map((p) => (
                      <option key={p.ref} value={p.ref}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setSupabaseProjectModalOpen(true)} disabled={supabaseLinking} className="border-zinc-300 text-zinc-700">
                    Select Supabase Project
                  </Button>
                  <Button type="button" variant="outline" onClick={handleLinkSupabaseProject} disabled={!selectedSupabaseRef || supabaseLinking} className="border-zinc-300 text-zinc-700">
                    {supabaseLinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Link Project
                  </Button>
                  <Button type="button" variant="outline" onClick={generateSchemaPreview} disabled={schemaLoading} className="border-zinc-300 text-zinc-700">
                    {schemaLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Generate Schema
                  </Button>
                </div>
              </div>
            )}
            {supabaseError ? <p className="text-xs text-red-600">{supabaseError}</p> : null}
          </div>
        )}
        {databaseIntegration?.projectRef ? (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Project Ref</p>
            <p className="mt-1 text-sm text-zinc-800">{databaseIntegration.projectRef}</p>
          </div>
        ) : null}
        {databaseIntegration?.projectUrl ? (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Endpoint</p>
            <p className="mt-1 truncate text-sm text-zinc-800">{databaseIntegration.projectUrl}</p>
          </div>
        ) : null}
      </section>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <section className="rounded-2xl border border-zinc-200 bg-white">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Advanced</h3>
              <p className="text-xs text-zinc-500">Environment Variables</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-zinc-200 px-5 py-4">
              <div className="space-y-3">
                {envVars.length === 0 && <p className="text-xs text-zinc-500">No advanced variables added yet.</p>}
                {envVars.map((envVar, index) => (
                  <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                      className="border-zinc-200 bg-white"
                    />
                    <Input
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                      className="border-zinc-200 bg-white"
                    />
                    <Button type="button" variant="outline" className="border-zinc-300 text-zinc-700" onClick={() => removeEnvVar(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" className="mt-3 border-zinc-300 text-zinc-700" onClick={addEnvVar}>
                Add Variable
              </Button>
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      <div className="flex justify-end">
        <Button type="button" onClick={saveSettings} disabled={saving} className="bg-zinc-900 text-white hover:bg-black">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Website Settings"}
        </Button>
      </div>

      <SupabaseConnectModal
        open={supabaseConnectModalOpen}
        loading={supabaseConnectLoading}
        error={supabaseError}
        onClose={() => setSupabaseConnectModalOpen(false)}
        onConnect={handleConnectSupabase}
      />

      <SupabaseProjectSelector
        open={supabaseProjectModalOpen}
        projects={supabaseProjects.map((p) => ({ id: p.ref, name: p.name, region: p.region }))}
        selectedId={selectedSupabaseRef}
        loading={supabaseLinking}
        onClose={() => setSupabaseProjectModalOpen(false)}
        onChange={setSelectedSupabaseRef}
        onConfirm={handleLinkSupabaseProject}
      />

      <SchemaPreviewModal
        open={schemaModalOpen}
        sql={schemaSql}
        tables={schemaTables}
        generating={schemaLoading}
        pushing={schemaPushLoading}
        error={supabaseError}
        onClose={() => setSchemaModalOpen(false)}
        onPush={pushSchemaToSupabase}
      />
    </div>
  )
}
