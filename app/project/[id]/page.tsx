"use client"

import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp, deleteField } from "firebase/firestore"
import { db } from "@/lib/firebase"
import JSZip from "jszip"
import { 
  Code2, 
  Eye, 
  MessageSquare,
  Settings, 
  Download, 
  ExternalLink, 
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FileCode,
  FolderOpen,
  Folder as FolderIcon,
  Sparkles,
  Coins,
  Copy,
  Check,
  Bot,
  User,
  Zap,
  ArrowRight,
  Paperclip,
  Loader2,
  Menu,
  ArrowLeft,
  Plug,
  Github,
  Edit2,
  FileText,
  Crown,
  TrendingUp,
  HelpCircle,
  Rocket,
  Share,
  Lightbulb,
  Database,
  Plus,
  X,
  LayoutGrid,
  Key
} from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/prompt-kit/reasoning"
import { Steps, StepsContent, StepsItem, StepsTrigger } from "@/components/prompt-kit/steps"
import { Tool } from "@/components/prompt-kit/tool"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { BuildTimeline, type TimelineStep } from "@/components/preview/build-timeline"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "@/hooks/use-toast"
import { useIsLg } from "@/hooks/use-is-lg"
import { motion, AnimatePresence } from "framer-motion"
import { applyPatch } from "diff"
import type { GeneratedFile, Message, Project, ProjectVisibility } from "./types"
import { extractAgentMessage } from "./utils"
import { ProjectErrorBoundary, ChatMessage, CodePanel, ResponsivePreview, BrowserNavigator } from "@/components/project"

// Persists across Strict Mode remounts so only one sandbox run can update logs
let sandboxRunIdCounter = 0
// Prevents auto-preview from running twice when effect runs twice (e.g. Strict Mode remount)
let lastAutoPreviewKey: string | null = null

function ProjectContent() {
  const params = useParams()
  const projectId = params?.id as string

  const { user, userData, hasTokens, remainingTokens, updateTokensUsed, getOptionalAuthHeader, workspaces, switchWorkspace, loading: authLoading } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"preview" | "code">("code")
  const [chatInput, setChatInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingFiles, setGeneratingFiles] = useState<GeneratedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [previewPath, setPreviewPath] = useState("/")
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "phone">("desktop")
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isPreviewReady, setIsPreviewReady] = useState(false)
  const [currentGeneratingFile, setCurrentGeneratingFile] = useState<string | null>(null)
  const [isSandboxLoading, setIsSandboxLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState("")
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const sandboxAbortRef = useRef<AbortController | null>(null)
  const sandboxRunIdRef = useRef(0)
  const [buildSteps, setBuildSteps] = useState<TimelineStep[]>([
    { key: "write", label: "Writing files", status: "idle" },
    { key: "install", label: "Installing dependencies", status: "idle" },
    { key: "dev", label: "Starting dev server", status: "idle" },
  ])
  const [buildError, setBuildError] = useState<string | null>(null)
  const [buildLogs, setBuildLogs] = useState<{ install?: string; dev?: string }>({})
  const [buildFailureCategory, setBuildFailureCategory] = useState<
    "infra" | "env" | "deps" | "build" | "unknown" | undefined
  >(undefined)
  const [buildFailureReason, setBuildFailureReason] = useState<string | null>(null)
  const [buildTimer, setBuildTimer] = useState(0)
  const [logsTail, setLogsTail] = useState("")
  const [isFixing, setIsFixing] = useState(false)
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false)
  const [previewRefreshHint, setPreviewRefreshHint] = useState<string | null>(null)
  const [editingTarget, setEditingTarget] = useState<{ kind: "prompt" } | { kind: "message"; index: number } | null>(null)
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat")
  const [visualEditActive, setVisualEditActive] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [integrationsOpen, setIntegrationsOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<"all" | "github" | "netlify" | "vercel" | "supabase" | "vars">("all")
  const [requiredEnvVars, setRequiredEnvVars] = useState<string[]>([])
  const [envVarNames, setEnvVarNames] = useState<string[]>([])
  const [envFormVars, setEnvFormVars] = useState<Record<string, string>>({})
  const [envFormEntries, setEnvFormEntries] = useState<{ name: string; value: string }[]>([])
  const [envVarsLoading, setEnvVarsLoading] = useState(false)
  const [envVarsSaving, setEnvVarsSaving] = useState(false)
  const [envVarsBannerDismissed, setEnvVarsBannerDismissed] = useState(false)
  const [netlifyConnected, setNetlifyConnected] = useState<boolean | null>(null)
  const [deployStep, setDeployStep] = useState<string>("")
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployLinks, setDeployLinks] = useState<{ siteUrl?: string | null; deployUrl?: string | null; adminUrl?: string | null; siteId?: string | null; deployId?: string | null } | null>(null)
  const [netlifySiteName, setNetlifySiteName] = useState("")
  const [netlifyDeployState, setNetlifyDeployState] = useState<string | null>(null)
  const [netlifyLogUrl, setNetlifyLogUrl] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployTab, setDeployTab] = useState<"netlify" | "vercel">("netlify")
  const [vercelConnected, setVercelConnected] = useState<boolean | null>(null)
  const [vercelTokenInput, setVercelTokenInput] = useState("")
  const [vercelDeployStep, setVercelDeployStep] = useState<string>("")
  const [vercelDeployLogs, setVercelDeployLogs] = useState<string[]>([])
  const [vercelDeployError, setVercelDeployError] = useState<string | null>(null)
  const [vercelDeployLinks, setVercelDeployLinks] = useState<{ siteUrl?: string | null; deployUrl?: string | null; adminUrl?: string | null; deploymentId?: string | null } | null>(null)
  const [vercelDeployState, setVercelDeployState] = useState<string | null>(null)
  const [vercelLogUrl, setVercelLogUrl] = useState<string | null>(null)
  const [isVercelDeploying, setIsVercelDeploying] = useState(false)
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [supabaseConnectOpen, setSupabaseConnectOpen] = useState(false)
  const [supabaseFormUrl, setSupabaseFormUrl] = useState("")
  const [supabaseFormAnonKey, setSupabaseFormAnonKey] = useState("")
  const [supabaseInjecting, setSupabaseInjecting] = useState(false)
  const [suggestBackendDismissed, setSuggestBackendDismissed] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [shareVisibility, setShareVisibility] = useState<ProjectVisibility>("private")
  const [shareSaving, setShareSaving] = useState(false)
  const [accessError, setAccessError] = useState<"private" | "forbidden" | null>(null)
  const [tokenLimitModalOpen, setTokenLimitModalOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const isLg = useIsLg()
  const lastAutoPreviewSignatureRef = useRef<string | null>(null)
  /** Prevents double generation when status is "pending" (e.g. Strict Mode remount resets isGenerating) */
  const pendingGenerationStartedRef = useRef<string | null>(null)
  /** Prevents duplicate generateCode/createSandbox in Strict Mode; cleared when projectId changes or operation finishes */
  const generationGuardRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Expand build timeline whenever a new sandbox run starts so users always see live progress
  useEffect(() => {
    if (isSandboxLoading) {
      setIsTimelineCollapsed(false)
    }
  }, [isSandboxLoading])

  const hasSuccessfulPreview =
    project?.status === "complete" && !!project?.sandboxUrl && !buildError

  // When preview is ready (all build steps success), hide the overlay so users see the preview
  const allBuildSuccess =
    buildSteps.length > 0 && buildSteps.every((s) => s.status === "success")

  // When preview becomes ready (all steps success), collapse timeline so the overlay doesn't block the preview
  useEffect(() => {
    if (project?.sandboxUrl && allBuildSuccess) {
      setIsTimelineCollapsed(true)
    }
  }, [project?.sandboxUrl, allBuildSuccess])

  const runSteps = reasoningSteps.length > 0
    ? reasoningSteps
    : [
        "Analyzing your request and understanding scope.",
        "Planning updates across relevant components.",
        "Applying changes and validating output.",
        "Finalizing and preparing preview.",
      ]

  const reasoningText = runSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")

  const getAuthHeader = useCallback(async () => {
    if (!user) throw new Error("Not authenticated")
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }, [user])

  // Cleanup on unmount: abort any in-flight generation or sandbox streams to prevent memory leaks
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      sandboxAbortRef.current?.abort()
    }
  }, [])

  const router = useRouter()

  const duplicateProject = async () => {
    if (!project || !user) return
    try {
      const projectData = { ...project }
      delete (projectData as any).id
      ;(projectData as any).createdAt = serverTimestamp()
      ;(projectData as any).ownerId = user.uid
      ;(projectData as any).visibility = "private"
      const col = collection(db, "projects")
      const ref = await addDoc(col, projectData as any)
      router.push(`/project/${ref.id}`)
    } catch (e) {
      console.error("Duplicate failed", e)
      alert("Failed to duplicate project")
    }
  }

  const remixProject = async () => {
    if (!project || !user) return
    try {
      const projectData = { ...project }
      delete (projectData as any).id
      projectData.name = (projectData.name || "Untitled Project") + " (remix)"
      ;(projectData as any).createdAt = serverTimestamp()
      ;(projectData as any).ownerId = user.uid
      ;(projectData as any).visibility = "private"
      const col = collection(db, "projects")
      const ref = await addDoc(col, projectData as any)
      router.push(`/project/${ref.id}`)
    } catch (e) {
      console.error("Remix failed", e)
      alert("Failed to remix project")
    }
  }

  const handleOpenIntegrations = () => {
    setIntegrationsOpen(true)
    refreshGitHubStatus()
    refreshNetlifyStatus()
  }

  const refreshGitHubStatus = useCallback(async () => {
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/status", { headers: authHeader })
      const json = await res.json().catch(() => null)
      setGithubConnected(!!json?.connected)
    } catch {
      setGithubConnected(false)
    }
  }, [getAuthHeader])

  const handleConnectGitHub = useCallback(async () => {
    const authHeader = await getAuthHeader()
    const res = await fetch(`/api/github/oauth/start?projectId=${encodeURIComponent(projectId)}`, {
      headers: authHeader,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || "Failed to start GitHub OAuth")
    if (!json?.url) throw new Error("Missing OAuth URL")
    window.location.href = json.url
  }, [getAuthHeader, projectId])

  const handleSyncToGitHub = useCallback(async () => {
    if (!projectId || !project?.files?.length) return
    setIsSyncing(true)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Sync failed")
      // Project doc will update via Firestore listener with githubRepoUrl, etc.
    } catch (e) {
      console.error("GitHub sync failed", e)
      alert(e instanceof Error ? e.message : "GitHub sync failed")
    } finally {
      setIsSyncing(false)
    }
  }, [getAuthHeader, projectId, project?.files?.length])

  const handleDisconnectGitHub = useCallback(async () => {
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/github/disconnect", { method: "POST", headers: authHeader })
      if (!res.ok) throw new Error("Failed to disconnect")
      setGithubConnected(false)
    } catch (e) {
      console.error("Disconnect GitHub failed", e)
      alert("Failed to disconnect GitHub")
    }
  }, [getAuthHeader])

  const supabaseConnected = !!project?.supabaseUrl

  const handleConnectSupabase = useCallback(
    async (url: string, anonKey: string, serviceRoleKey?: string) => {
      if (!projectId) return
      try {
        const authHeader = await getAuthHeader()
        const res = await fetch("/api/supabase/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ projectId, url, anonKey, serviceRoleKey: serviceRoleKey || undefined }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Connect failed")
        setSupabaseConnectOpen(false)
        // Project will update via Firestore listener
      } catch (e) {
        console.error("Supabase connect failed", e)
        throw e
      }
    },
    [getAuthHeader, projectId]
  )

  const handleInjectSupabase = useCallback(async () => {
    if (!projectId) return
    setSupabaseInjecting(true)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/supabase/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || "Inject failed")
      }
      // Project files updated in Firestore; listener will refresh
    } catch (e) {
      console.error("Supabase inject failed", e)
      alert(e instanceof Error ? e.message : "Failed to add Supabase client")
    } finally {
      setSupabaseInjecting(false)
    }
  }, [getAuthHeader, projectId])

  const projectUrl = typeof window !== "undefined" ? `${window.location.origin}/project/${projectId}` : ""
  const canEdit = !!user && !!project && (!project.ownerId || project.ownerId === user.uid || (Array.isArray(project.editorIds) && project.editorIds.includes(user.uid)))

  const handleShare = () => {
    setShareVisibility(project?.visibility ?? "private")
    setShareOpen(true)
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(projectUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error("Copy failed", e)
      alert("Failed to copy link")
    }
  }

  const handleSaveShare = async () => {
    if (!projectId || !project) return
    setShareSaving(true)
    try {
      const projectRef = doc(db, "projects", projectId)
      await updateDoc(projectRef, { visibility: shareVisibility })
      setProject((p) => (p ? { ...p, visibility: shareVisibility } : p))
      setShareOpen(false)
    } catch (e) {
      console.error("Save share failed", e)
      alert("Failed to update share settings")
    } finally {
      setShareSaving(false)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!user || !newWorkspaceName.trim()) return
    setCreatingWorkspace(true)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          name: newWorkspaceName.trim(),
          slug: `workspace-${Date.now()}`
        })
      })
      if (!res.ok) throw new Error('Failed to create workspace')
      const data = await res.json()
      const workspaceId = data.workspaceId || data.id
      setCreateWorkspaceOpen(false)
      setNewWorkspaceName("")
      await switchWorkspace(workspaceId)
    } catch (e) {
      console.error('Create workspace failed', e)
      alert('Failed to create workspace')
    } finally {
      setCreatingWorkspace(false)
    }
  }

  const refreshNetlifyStatus = useCallback(async () => {
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/netlify/status", { headers: authHeader })
      const json = await res.json().catch(() => null)
      setNetlifyConnected(!!json?.connected)
    } catch {
      setNetlifyConnected(false)
    }
  }, [getAuthHeader])

  const refreshVercelStatus = useCallback(async () => {
    if (!projectId) return
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch(`/api/vercel/status?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
      const json = await res.json().catch(() => null)
      setVercelConnected(!!json?.connected)
    } catch {
      setVercelConnected(false)
    }
  }, [getAuthHeader, projectId])

  const handleConnectNetlify = useCallback(async () => {
    const authHeader = await getAuthHeader()
    const res = await fetch(`/api/netlify/oauth/start?projectId=${encodeURIComponent(projectId)}`, {
      headers: authHeader,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || "Failed to start Netlify OAuth")
    if (!json?.url) throw new Error("Missing OAuth URL")
    window.location.href = json.url
  }, [getAuthHeader, projectId])

  const handleDeployToNetlify = useCallback(async () => {
    if (!projectId) return
    setIsDeploying(true)
    setDeployError(null)
    setDeployLinks(null)
    setDeployLogs([])
    setDeployStep("Starting")

    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/netlify/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          projectId,
          siteId: deployLinks?.siteId || null,
          siteName: netlifySiteName || (project?.name ? project.name : ""),
        }),
      })

      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "")
        throw new Error(t || "Deploy request failed")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const idx = buffer.indexOf("\n")
          if (idx === -1) break
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue

          let payload: any
          try {
            payload = JSON.parse(line)
          } catch {
            continue
          }

          if (payload.type === "step") {
            setDeployStep(payload.step)
          }

          if (payload.type === "log") {
            setDeployLogs((prev) => {
              const next = [...prev, String(payload.message || "")]
              return next.length > 500 ? next.slice(next.length - 500) : next
            })
          }

          if (payload.type === "error") {
            setDeployError(String(payload.error || "Deploy failed"))
          }

          if (payload.type === "success") {
            setDeployLinks({
              siteUrl: payload.siteUrl || null,
              deployUrl: payload.deployUrl || null,
              adminUrl: payload.adminUrl || null,
              siteId: payload.siteId || null,
              deployId: payload.deployId || null,
            })
            setNetlifyDeployState(null)
            setNetlifyLogUrl(null)
            setDeployStep("ready")
          }
        }
      }
    } catch (err: any) {
      setDeployError(err?.message || "Deploy failed")
    } finally {
      setIsDeploying(false)
      refreshNetlifyStatus()
    }
  }, [deployLinks?.siteId, getAuthHeader, netlifySiteName, project?.name, projectId, refreshNetlifyStatus])

  const handleSaveVercelToken = useCallback(async () => {
    if (!projectId || !vercelTokenInput.trim()) return
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/vercel/save-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId, token: vercelTokenInput.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to save token")
      setVercelConnected(true)
      setVercelTokenInput("")
    } catch (e) {
      console.error("Save Vercel token failed", e)
      alert(e instanceof Error ? e.message : "Failed to save token")
    }
  }, [getAuthHeader, projectId, vercelTokenInput])

  const handleDeployToVercel = useCallback(async () => {
    if (!projectId) return
    setIsVercelDeploying(true)
    setVercelDeployError(null)
    setVercelDeployLinks(null)
    setVercelDeployLogs([])
    setVercelDeployStep("Starting")

    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/vercel/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ projectId }),
      })

      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "")
        throw new Error(t || "Deploy request failed")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const idx = buffer.indexOf("\n")
          if (idx === -1) break
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue

          let payload: any
          try {
            payload = JSON.parse(line)
          } catch {
            continue
          }

          if (payload.type === "step") {
            setVercelDeployStep(payload.step)
          }

          if (payload.type === "log") {
            setVercelDeployLogs((prev) => {
              const next = [...prev, String(payload.message || "")]
              return next.length > 500 ? next.slice(next.length - 500) : next
            })
          }

          if (payload.type === "error") {
            setVercelDeployError(String(payload.error || "Deploy failed"))
          }

          if (payload.type === "success") {
            setVercelDeployLinks({
              siteUrl: payload.siteUrl || null,
              deployUrl: payload.deployUrl || null,
              adminUrl: payload.adminUrl || null,
              deploymentId: payload.deploymentId || null,
            })
            setVercelDeployState(null)
            setVercelLogUrl(null)
            setVercelDeployStep("ready")
          }
        }
      }
    } catch (err: any) {
      setVercelDeployError(err?.message || "Deploy failed")
    } finally {
      setIsVercelDeploying(false)
      refreshVercelStatus()
    }
  }, [getAuthHeader, projectId, refreshVercelStatus])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [project?.messages, isGenerating, scrollToBottom])

  useEffect(() => {
    if (!deployOpen) return
    refreshNetlifyStatus()
    refreshVercelStatus()
  }, [deployOpen, refreshNetlifyStatus, refreshVercelStatus])

  useEffect(() => {
    refreshGitHubStatus()
  }, [refreshGitHubStatus])

  // Fetch required env vars when project has files (for banner and vars panel)
  useEffect(() => {
    if (!projectId || !project?.files?.length) return
    let cancelled = false
    getAuthHeader()
      .then((authHeader) =>
        fetch(`/api/env-vars/required?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
      )
      .then((res) => (cancelled ? null : res.json()))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.requiredEnvVars)) setRequiredEnvVars(json.requiredEnvVars)
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getAuthHeader stable
  }, [projectId, project?.files?.length])

  // When opening Vars panel, fetch required + stored names and init form entries
  useEffect(() => {
    if (!integrationsOpen || selectedIntegration !== "vars" || !projectId) return
    setEnvVarsLoading(true)
    let cancelled = false
    Promise.all([
      getAuthHeader().then((h) => fetch(`/api/env-vars/required?projectId=${encodeURIComponent(projectId)}`, { headers: h }).then((r) => r.json())),
      getAuthHeader().then((h) => fetch(`/api/env-vars/names?projectId=${encodeURIComponent(projectId)}`, { headers: h }).then((r) => r.json())),
    ])
      .then(([reqRes, namesRes]) => {
        if (cancelled) return
        const required = Array.isArray(reqRes?.requiredEnvVars) ? reqRes.requiredEnvVars : []
        const names = Array.isArray(namesRes?.envVarNames) ? namesRes.envVarNames : []
        setRequiredEnvVars(required)
        setEnvVarNames(names)
        const allNames = [...new Set([...required, ...names])]
        setEnvFormEntries(
          allNames.map((name) => ({ name, value: "" })).concat([{ name: "", value: "" }])
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEnvVarsLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getAuthHeader stable
  }, [integrationsOpen, selectedIntegration, projectId])

  const handleSaveEnvVars = useCallback(async () => {
    if (!projectId) return
    const record: Record<string, string> = {}
    for (const { name, value } of envFormEntries) {
      const k = name.trim()
      if (k) record[k] = value
    }
    setEnvVarsSaving(true)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/env-vars/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId, envVars: record }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Save failed")
      setEnvVarNames(Object.keys(record))
    } catch (e) {
      console.error("Save env vars failed", e)
      alert(e instanceof Error ? e.message : "Failed to save env vars")
    } finally {
      setEnvVarsSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getAuthHeader stable
  }, [projectId, envFormEntries])

  const handleSaveRename = async () => {
    if (!projectId) return
    try {
      const projectRef = doc(db, 'projects', projectId)
      await updateDoc(projectRef, { name: renameValue })
      setProject(prev => prev ? { ...prev, name: renameValue } : prev)
      setRenameOpen(false)
    } catch (e) {
      console.error('Rename failed', e)
      alert('Failed to rename project')
    }
  }

  useEffect(() => {
    if (!deployOpen) return
    const deployId = deployLinks?.deployId
    if (!deployId) return

    let cancelled = false
    let t: any

    const poll = async () => {
      try {
        const authHeader = await getAuthHeader()
        const res = await fetch(`/api/netlify/deploy/${encodeURIComponent(deployId)}`, { headers: authHeader })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (json?.state) setNetlifyDeployState(String(json.state))
        if (json?.logAccessUrl) setNetlifyLogUrl(String(json.logAccessUrl))
      } catch {
        // ignore
      } finally {
        if (!cancelled) t = setTimeout(poll, 3000)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (t) clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getAuthHeader stable
  }, [deployOpen, deployLinks?.deployId])

  // Poll Vercel deployment status when deploy modal open and we have a deployment id
  useEffect(() => {
    if (!deployOpen) return
    const deploymentId = vercelDeployLinks?.deploymentId
    if (!deploymentId) return

    let cancelled = false
    let t: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const authHeader = await getAuthHeader()
        const res = await fetch(
          `/api/vercel/deploy/${encodeURIComponent(deploymentId)}?projectId=${encodeURIComponent(projectId)}`,
          { headers: authHeader }
        )
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (json?.state) setVercelDeployState(String(json.state))
        if (json?.siteUrl) setVercelDeployLinks((prev) => (prev ? { ...prev, siteUrl: json.siteUrl } : { siteUrl: json.siteUrl, deployUrl: null, adminUrl: null, deploymentId }))
      } catch {
        // ignore
      } finally {
        if (!cancelled) t = setTimeout(poll, 3000)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (t) clearTimeout(t)
    }
  }, [deployOpen, vercelDeployLinks?.deploymentId, projectId, getAuthHeader])

  // Edit message handlers
  const handleEditSubmit = async (newContent: string) => {
    if (!project) return
    if (!editingTarget) return
    
    const projectRef = doc(db, "projects", projectId)
    
    if (editingTarget.kind === "prompt") {
      await updateDoc(projectRef, { prompt: newContent })
      setProject(prev => prev ? { ...prev, prompt: newContent } : null)
    } else {
      const messages = project.messages || []
      const idx = editingTarget.index
      if (idx >= 0 && idx < messages.length) {
        const updatedMessages = [...messages]
        updatedMessages[idx] = { ...updatedMessages[idx], content: newContent }
        await updateDoc(projectRef, { messages: updatedMessages })
        setProject(prev => prev ? { ...prev, messages: updatedMessages } : null)
      }
    }
    
    setEditingTarget(null)
    
    // Regenerate with new prompt
    const fullPrompt = newContent
    await generateCode(fullPrompt, project.model)
  }

  const handleCancelEdit = () => {
    setEditingTarget(null)
  }

  const getPreviewUrl = useCallback(() => {
    if (!project?.sandboxUrl) return null
    const base = project.sandboxUrl.replace(/\/$/, "")
    // Validate previewPath to prevent XSS (only allow safe URL path characters)
    const safePath = /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(previewPath) && previewPath.startsWith("/")
      ? previewPath
      : "/"
    const url = `${base}${safePath}`
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}__reload=${previewReloadNonce}`
  }, [project?.sandboxUrl, previewPath, previewReloadNonce])

  const handlePreviewNavigate = useCallback((nextPath: string) => {
    const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`
    setPreviewPath(normalized)
  }, [])

  const handlePreviewReload = useCallback(() => {
    setPreviewReloadNonce(Date.now())
    setPreviewKey((k) => k + 1)
  }, [])

  // Update build steps when project sandbox URL changes
  useEffect(() => {
    if (project?.sandboxUrl && project.status === "complete") {
      setBuildSteps([
        { key: "write", label: "Writing files", status: "success", startedAt: Date.now() - 3000, finishedAt: Date.now() - 2500 },
        { key: "install", label: "Installing dependencies", status: "success", startedAt: Date.now() - 2500, finishedAt: Date.now() - 1500 },
        { key: "dev", label: "Starting dev server", status: "success", startedAt: Date.now() - 1500, finishedAt: Date.now() - 500 },
      ])
      setIsSandboxLoading(false)
      setBuildError(null)
    }
  }, [project?.sandboxUrl, project?.status])

  // Auto-retry iframe load at 5s and 15s when preview URL is set (tunnel/server may not be ready on first load)
  const previewRetryCountRef = useRef<number>(0)
  useEffect(() => {
    if (!project?.sandboxUrl) {
      previewRetryCountRef.current = 0
      return
    }
    const url = project.sandboxUrl
    const t1 = setTimeout(() => {
      if (previewRetryCountRef.current < 1) {
        previewRetryCountRef.current = 1
        setPreviewKey((k) => k + 1)
      }
    }, 5000)
    const t2 = setTimeout(() => {
      if (previewRetryCountRef.current < 2) {
        previewRetryCountRef.current = 2
        setPreviewKey((k) => k + 1)
      }
    }, 15000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [project?.sandboxUrl])

  useEffect(() => {
    if (!isSandboxLoading) return
    setBuildTimer(0)
    const interval = setInterval(() => {
      setBuildTimer(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isSandboxLoading])

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "48px"
    const newHeight = Math.min(Math.max(48, textarea.scrollHeight), 150)
    textarea.style.height = `${newHeight}px`
  }, [])

  // Fetch project data: real-time when user, one-time API when no user (public/link-only)
  // Intentionally omit selectedFile from deps to avoid loop: snapshot sets selectedFile, which would re-run this effect
  useEffect(() => {
    if (!projectId) return
    if (authLoading) return
    setAccessError(null)

    if (user) {
      const projectRef = doc(db, "projects", projectId)
      const unsubscribe = onSnapshot(projectRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data()
          const visibility = data.visibility ?? "private"
          const ownerId = data.ownerId
          const editorIds = Array.isArray(data.editorIds) ? data.editorIds : []
          const isOwner = user.uid === ownerId
          const isEditor = editorIds.includes(user.uid)
          if (visibility === "private" && !isOwner && !isEditor) {
            setAccessError("forbidden")
            setProject(null)
            setLoading(false)
            return
          }
          setAccessError(null)
          const projectData = { id: docSnap.id, ...data } as Project
          setProject(projectData)
          setSelectedFile((prev) => {
            if (data.files && data.files.length > 0 && !prev) return data.files[0]
            return prev
          })
          if (projectData.sandboxUrl && projectData.status === "complete") {
            setActiveTab("preview")
          }
        } else {
          setProject(null)
        }
        setLoading(false)
      }, (error) => {
        console.error("Error fetching project:", error)
        setLoading(false)
      })
      return () => unsubscribe()
    }

    // No user (or auth state not yet in React): fetch via API with optional token so private projects work after OAuth redirect
    let cancelled = false
    setLoading(true)
    getOptionalAuthHeader()
      .then((headers) => (cancelled ? null : fetch(`/api/projects/${projectId}`, { headers })))
      .then((res) => {
        if (cancelled || !res) return res
        if (res.status === 403) {
          setAccessError("private")
          setProject(null)
          return
        }
        if (res.status === 404) {
          setProject(null)
          return
        }
        if (!res.ok) {
          setLoading(false)
          return
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setLoading(false)
          return
        }
        const projectData: Project = {
          ...data,
          id: data.id || projectId,
          createdAt: typeof data.createdAt === "string" ? new Date(data.createdAt) : (data.createdAt || new Date()),
        }
        setProject(projectData)
        setSelectedFile((prev) => {
          if (data.files?.length > 0 && !prev) return data.files[0]
          return prev
        })
        if (projectData.sandboxUrl && projectData.status === "complete") {
          setActiveTab("preview")
        }
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getOptionalAuthHeader stable
  }, [projectId, user, authLoading])

  // Claim legacy projects: set ownerId when current user opens a project with no owner
  useEffect(() => {
    if (!projectId || !user || !project || project.ownerId) return
    const projectRef = doc(db, "projects", projectId)
    updateDoc(projectRef, { ownerId: user.uid, visibility: "private" }).then(() => {
      setProject((p) => (p ? { ...p, ownerId: user.uid, visibility: "private" } : p))
    }).catch(() => {})
  }, [projectId, user?.uid, project?.id, project?.ownerId])

  // Clear pending-generation guard when switching projects so new project can auto-start
  useEffect(() => {
    pendingGenerationStartedRef.current = null
    generationGuardRef.current = null
  }, [projectId])

  // Start generation on mount if pending (once per project; ref guards against Strict Mode double-run)
  useEffect(() => {
    if (!project || project.status !== "pending" || isGenerating) return
    if (pendingGenerationStartedRef.current === projectId) return
    pendingGenerationStartedRef.current = projectId
    generateCode(project.prompt, project.model)
  }, [project?.status, projectId, isGenerating, project?.prompt, project?.model])

  /** Merge model output (diffs or full files) into existing project; applies patches when content is unified diff. */
  const mergeWithExistingFiles = (
    existingFiles: GeneratedFile[],
    blocks: GeneratedFile[]
  ): GeneratedFile[] => {
    const result = existingFiles.map(f => ({ ...f }))

    for (const block of blocks) {
      const path = block.path
      let content = block.content.trim()
      // Detect unified diff: full format (--- a/...) or hunk-only (contains @@ and -/+ lines) that got pasted by mistake
      const hasDiffHeader = content.startsWith("--- a/") || content.startsWith("--- a\\")
      const hasDiffSyntax = content.includes("@@") && /^\s*[-+]/m.test(content)
      const isHunkOnly = hasDiffSyntax && !hasDiffHeader
      const isUnifiedDiff = hasDiffHeader || isHunkOnly

      if (isUnifiedDiff) {
        // If model output only the hunk (e.g. @@ -1,5 +1,5 @@) without ---/+++ file header, add it so applyPatch works
        if (!hasDiffHeader && isHunkOnly) {
          content = `--- a/${path}\n+++ b/${path}\n` + content
        }
        const existingIndex = result.findIndex(f => f.path === path)
        const oldContent = existingIndex !== -1 ? result[existingIndex].content : ""
        const patched = applyPatch(oldContent, content)
        if (typeof patched === "string") {
          if (existingIndex !== -1) {
            result[existingIndex] = { ...result[existingIndex], content: patched }
          } else {
            result.push({ path, content: patched })
          }
        }
        // If applyPatch returns false, patch failed; leave existing file unchanged or skip new
      } else {
        // Reject content that looks like raw diff cruft (e.g. @@ or -line at start) so we never write it as source
        const looksLikeRawDiff = /^\s*@@/m.test(content) || (/^\s*-\s*[^\s]/.test(content) && content.includes("@@"))
        if (looksLikeRawDiff) {
          // Don't overwrite with diff text; keep existing file
          continue
        }
        const existingIndex = result.findIndex(f => f.path === path)
        if (existingIndex !== -1) {
          result[existingIndex] = { ...result[existingIndex], content }
        } else {
          result.push({ path, content })
        }
      }
    }

    return result
  }

  const parseStreamingFiles = (content: string): GeneratedFile[] => {
    const files: GeneratedFile[] = []
    const fileRegex = /===FILE: (.+?)===\n([\s\S]*?)(?====END_FILE===|===FILE:|$)/g
    let match

    while ((match = fileRegex.exec(content)) !== null) {
      const path = match[1].trim()
      const fileContent = match[2].trim()
      files.push({ path, content: fileContent })
    }

    return files
  }

  const generateCode = async (prompt: string, model?: string) => {
    if (!project) return
    if (remainingTokens <= 0) {
      setTokenLimitModalOpen(true)
      return
    }

    const guardKey = `gen:${projectId}:${(prompt || "").slice(0, 40)}`
    if (generationGuardRef.current === guardKey) {
      console.warn("Prevented duplicate generation")
      return
    }
    generationGuardRef.current = guardKey

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    setGeneratingFiles([])
    setAgentStatus("Analyzing your request...")
    setReasoningSteps(["Analyzing your request and understanding scope."])

    // Track if we've auto-selected a file during this generation
    let hasAutoSelectedFile = false

    const projectRef = doc(db, "projects", projectId)
    await updateDoc(projectRef, { status: "generating" })

    try {
      setAgentStatus("Generating application structure...")
      setReasoningSteps(prev => [...prev, "Planning application structure and components."])

      // include Firebase ID token so server can authenticate and charge tokens
      const idToken = await user?.getIdToken()
      if (!idToken) {
        throw new Error("Not authenticated - please sign in")
      }

      const body: { prompt: string; model: string; idToken: string; existingFiles?: { path: string; content: string }[] } = {
        prompt,
        model: model || "GPT-4-1 Mini",
        idToken,
      }
      if (project.files && project.files.length > 0) {
        body.existingFiles = project.files
      }
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 402) {
          setTokenLimitModalOpen(true)
        }
        throw new Error(errorData.error || `Generation failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ""
      let lastFileCount = 0
      let lastAllFilesLength = 0
      let lastAllFilesLastPath: string | null = null
      let agentMessage: string | null = null
      let agentMessageTimestamp: string | null = null

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        fullContent += chunk

        // Extract agent conversational message (so file parsing ignores it)
        const { agentMessage: parsedAgent, contentWithoutAgent } = extractAgentMessage(fullContent)
        if (parsedAgent && !agentMessage) {
          agentMessage = parsedAgent
          agentMessageTimestamp = new Date().toISOString()
          await updateDoc(projectRef, {
            messages: [
              ...(project.messages || []),
              { role: "assistant", content: parsedAgent, timestamp: agentMessageTimestamp }
            ]
          })
        }

        // Parse file blocks from stream (each block is full content or unified diff)
        const parsedBlocks = parseStreamingFiles(contentWithoutAgent)

        let allFiles: GeneratedFile[]
        if (project.files && project.files.length > 0) {
          allFiles = mergeWithExistingFiles(project.files, parsedBlocks)
        } else {
          allFiles = [...parsedBlocks]
        }

        // Detect new files being generated
        if (parsedBlocks.length > lastFileCount) {
          const newFile = parsedBlocks[parsedBlocks.length - 1]
          setCurrentGeneratingFile(newFile.path)
          setAgentStatus(`Creating ${newFile.path}...`)
          // Keep reasoning high-level like v0.dev / ChatGPT:
          // show a single "Creating files..." step instead of one entry per file.
          setReasoningSteps((prev) =>
            prev.includes("Creating files...") ? prev : [...prev, "Creating files..."]
          )
          lastFileCount = parsedBlocks.length
        }

        // Only update generating files when the list actually changed (avoids update storm)
        const currentLastPath = allFiles.length > 0 ? allFiles[allFiles.length - 1].path : null
        if (allFiles.length !== lastAllFilesLength || currentLastPath !== lastAllFilesLastPath) {
          lastAllFilesLength = allFiles.length
          lastAllFilesLastPath = currentLastPath
          setGeneratingFiles(allFiles.map((f, i) => ({
            ...f,
            isGenerating: i === allFiles.length - 1
          })))
        }

        // Auto-select first file (only once per generation)
        if (allFiles.length > 0 && !selectedFile && !hasAutoSelectedFile) {
          hasAutoSelectedFile = true
          setSelectedFile(allFiles[0])
        }
      }

      // Final parse (use content without agent block)
      const { contentWithoutAgent: finalContent } = extractAgentMessage(fullContent)
      const finalBlocks = parseStreamingFiles(finalContent)

      let finalFiles: GeneratedFile[]
      if (project.files && project.files.length > 0) {
        finalFiles = mergeWithExistingFiles(project.files, finalBlocks)
      } else {
        finalFiles = [...finalBlocks]
      }
      
      const suggestsBackend = /===META:\s*suggestsBackend\s*=\s*true\s*===/i.test(fullContent)

      setAgentStatus("Finalizing...")
      setReasoningSteps(prev => [...prev, "Finalizing and preparing preview."])

      // Token usage is deducted server-side by the generate API (real usage or fallback); no client update

      // Build messages: existing + optional agent message (if we added it) + completion message
      const baseMessages = project.messages || []
      const withAgent = agentMessage && agentMessageTimestamp
        ? [...baseMessages, { role: "assistant" as const, content: agentMessage, timestamp: agentMessageTimestamp }]
        : baseMessages
      const completionMessage = { role: "assistant" as const, content: `Generated ${finalFiles.length} files successfully. You can view them in the code panel.`, files: finalFiles.map(f => f.path) }

      const nextMessages = [...withAgent, completionMessage]
      await updateDoc(projectRef, {
        status: "complete",
        files: finalFiles,
        ...(suggestsBackend ? { suggestsBackend: true } : {}),
        messages: nextMessages,
      })
      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: "complete",
              files: finalFiles,
              ...(suggestsBackend ? { suggestsBackend: true } : {}),
              messages: nextMessages,
            }
          : prev
      )

      if (finalFiles.length > 0) {
        setSelectedFile(finalFiles[0])
      }

      // Create E2B sandbox (auto-start) — uses finalFiles; project state already updated above
      await createSandbox(finalFiles)

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        await updateDoc(projectRef, { status: "pending" })
        setProject((prev) => (prev ? { ...prev, status: "pending" } : prev))
      } else {
        console.error("Generation error:", error)
        const errorMessage = error instanceof Error ? error.message : "Generation failed"
        await updateDoc(projectRef, {
          status: "error",
          error: errorMessage,
        })
        setProject((prev) => (prev ? { ...prev, status: "error", error: errorMessage } : prev))
      }
    } finally {
      abortControllerRef.current = null
      setIsGenerating(false)
      setGeneratingFiles([])
      setCurrentGeneratingFile("")
      setAgentStatus("")
      setReasoningSteps([])
    }
  }

  // FIXED: Wrapped createSandbox in useCallback with proper dependencies
  const createSandbox = useCallback(async (files: GeneratedFile[], options?: { forceNewSandbox?: boolean }) => {
    if (!project) return

    const forceNewSandbox = options?.forceNewSandbox === true
    const guardKey = `sandbox:${projectId}:${files.length}:${files.map((f) => f.path).join(",")}:${forceNewSandbox}`
    if (generationGuardRef.current === guardKey) {
      console.warn("Prevented duplicate sandbox start")
      return
    }
    generationGuardRef.current = guardKey

    sandboxAbortRef.current?.abort()
    sandboxAbortRef.current = new AbortController()
    const signal = sandboxAbortRef.current.signal
    const thisAbort = sandboxAbortRef.current
    const myRunId = ++sandboxRunIdCounter
    sandboxRunIdRef.current = myRunId

    const isCurrentRun = () => sandboxRunIdRef.current === myRunId

    setProject((prev) => (prev ? { ...prev, sandboxUrl: undefined } : prev))
    setIsSandboxLoading(true)
    setBuildError(null)
    setBuildFailureCategory(undefined)
    setBuildFailureReason(null)
    setBuildLogs({ install: "", dev: "" })
    setLogsTail("")
    setBuildSteps([
      { key: "write", label: "Writing files", status: "running" },
      { key: "install", label: "Installing dependencies", status: "idle" },
      { key: "dev", label: "Starting dev server", status: "idle" },
    ])
    const projectRef = doc(db, "projects", projectId)

    // Client-side safety timeout: if no terminal success/error within ~120s, show clear error
    const CLIENT_TIMEOUT_MS = 120_000
    let clientTimeoutId: ReturnType<typeof setTimeout> | null = null
    clientTimeoutId = setTimeout(() => {
      if (!isCurrentRun()) return
      setBuildError("Preview timed out after 2 minutes. The build may be taking too long or there may be an error.")
      setBuildFailureCategory("build")
      setBuildFailureReason("Client timeout")
      setBuildSteps((prev) =>
        prev.map((step) =>
          step.key === "dev" ? { ...step, status: "failed" as const, finishedAt: Date.now() } : step
        )
      )
      setIsSandboxLoading(false)
    }, CLIENT_TIMEOUT_MS)

    const clearClientTimeout = () => {
      if (clientTimeoutId != null) {
        clearTimeout(clientTimeoutId)
        clientTimeoutId = null
      }
    }

    try {
      await updateDoc(projectRef, { sandboxUrl: deleteField() })
    } catch (e) {
      console.warn("Failed to clear old sandbox URL:", e)
    }

    try {
      const authHeader = await getAuthHeader()
      
      console.log("[createSandbox] Starting sandbox creation with", files.length, "files")

      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ 
          files, 
          projectId, 
          sandboxId: forceNewSandbox ? undefined : (project.sandboxId ?? undefined),
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let terminalEventSeen = false
      let lineBuffer = ""

      if (!reader) {
        throw new Error("No response body")
      }

      // Helper to handle stream data
      const handleStreamData = (data: any) => {
        if (data.type === "step") {
          setBuildSteps((prev) =>
            prev.map((step) =>
              step.key === data.step
                ? {
                    ...step,
                    status: data.status,
                    message: data.message,
                    startedAt: data.status === "running" ? Date.now() : step.startedAt,
                    finishedAt: data.status === "success" || data.status === "failed" ? Date.now() : step.finishedAt,
                  }
                : step
            )
          )
        } else if (data.type === "log") {
          const step = data.step ?? "dev"
          setBuildLogs((prev) => ({
            ...prev,
            [step]: (prev[step as keyof typeof prev] || "") + (data.data ?? ""),
          }))
        } else if (data.type === "error") {
          const errMsg = String(data.error ?? "Preview failed")
          console.error("[createSandbox] Stream error:", errMsg, data)
          
          terminalEventSeen = true
          clearClientTimeout()
          setBuildError(errMsg)
          setBuildFailureCategory(data.failureCategory ?? "unknown")
          setBuildFailureReason(data.failureReason ?? null)
          setBuildLogs((prev) => ({ ...prev, ...(data.logs || {}) }))
          setBuildSteps((prev) =>
            prev.map((step) =>
              step.key === (data.failureCategory === "deps" ? "install" : "dev")
                ? { ...step, status: "failed", finishedAt: Date.now() }
                : step
            )
          )
          setIsSandboxLoading(false)
        } else if (data.type === "success") {
          console.log("[createSandbox] Success:", data)
          terminalEventSeen = true
          clearClientTimeout()
          
          const url = data.url
          const newSandboxId = data.sandboxId
          
          // Update Firestore
          updateDoc(projectRef, { sandboxUrl: url, sandboxId: newSandboxId }).catch(console.error)
          
          setProject((prev) => (prev ? { ...prev, sandboxUrl: url, sandboxId: newSandboxId } : prev))
          
          if (data.warning) {
            setPreviewRefreshHint(data.warning)
          }
          
          const now = Date.now()
          setBuildSteps((prev) =>
            prev.map((step, index) => ({
              ...step,
              status: "success" as const,
              finishedAt: now - (prev.length - index - 1) * 1000,
            }))
          )
          setIsSandboxLoading(false)
          setActiveTab("preview")
        } else if (data.type === "ping") {
          // Heartbeat, ignore
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          // Process any remaining buffer
          if (lineBuffer.trim() && !terminalEventSeen) {
            try {
              const data = JSON.parse(lineBuffer.trim())
              handleStreamData(data)
            } catch {}
          }
          break
        }
        
        if (signal.aborted) {
          console.log("[createSandbox] Aborted")
          break
        }
        
        if (!isCurrentRun()) {
          console.log("[createSandbox] Not current run, breaking")
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        setLogsTail((prev) => prev + chunk)

        lineBuffer += chunk
        const lines = lineBuffer.split("\n")
        lineBuffer = lines.pop() ?? "" // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          if (signal.aborted || !isCurrentRun()) break
          if (terminalEventSeen) continue

          try {
            const data = JSON.parse(line)
            handleStreamData(data)
          } catch (e) {
            console.warn("[createSandbox] Failed to parse line:", line, e)
          }
        }
      }

      // If we exited the loop without seeing a terminal event
      if (!terminalEventSeen && isCurrentRun()) {
        console.warn("[createSandbox] Stream ended without terminal event")
        clearClientTimeout()
        setBuildError("Connection closed unexpectedly before preview was ready")
        setIsSandboxLoading(false)
      }
      
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.log("[createSandbox] Aborted by user")
        clearClientTimeout()
        return
      }
      
      clearClientTimeout()
      console.error("Sandbox error:", error)
      
      const now = Date.now()
      setBuildError(error instanceof Error ? error.message : "Failed to create preview")
      setBuildFailureCategory("unknown")
      setBuildFailureReason("Sandbox error")
      setBuildSteps([
        { key: "write", label: "Writing files", status: "success", startedAt: now - 3000, finishedAt: now - 2000 },
        { key: "install", label: "Installing dependencies", status: "failed", startedAt: now - 2000, finishedAt: now - 1000 },
        { key: "dev", label: "Starting dev server", status: "idle" },
      ])
    } finally {
      if (generationGuardRef.current === guardKey) {
        generationGuardRef.current = null
      }
      clearClientTimeout()
      if (!thisAbort.signal.aborted) {
        setIsSandboxLoading(false)
      }
    }
  }, [project, projectId, getAuthHeader, canEdit])

  const handleRestartPreview = useCallback(() => {
    if (!project?.files || !canEdit || isSandboxLoading) return
    setPreviewRefreshHint(null)
    // Clear URL so UI shows build timeline; force new sandbox so we get a fresh env and tunnel (avoids "Closed Port")
    setProject((prev) => (prev ? { ...prev, sandboxUrl: undefined } : prev))
    createSandbox(project.files, { forceNewSandbox: true })
  }, [project?.files, canEdit, isSandboxLoading, createSandbox])

  const handleFixWithAI = useCallback(async () => {
    if (!project || !canEdit || isFixing || isGenerating || !buildError) return
    setIsFixing(true)
    try {
      const parts = [
        "Fix the following build or runtime error in my project. Apply minimal, targeted changes to resolve it. Output only the changed files (use unified diff or full file content).",
        "",
        "Error: " + buildError,
        ...(buildFailureReason ? ["Failure reason: " + buildFailureReason] : []),
        ...(buildFailureCategory ? ["Category: " + buildFailureCategory] : []),
        "",
        "Relevant logs:",
        ...(buildLogs?.install ? ["[install]\n" + (buildLogs.install.slice(-2000))] : []),
        ...(buildLogs?.dev ? ["[dev]\n" + (buildLogs.dev.slice(-2000))] : []),
      ]
      const fixPrompt = parts.join("\n")
      await generateCode(fixPrompt, project.model)
    } finally {
      setIsFixing(false)
    }
  }, [project, canEdit, isFixing, isGenerating, buildError, buildFailureReason, buildFailureCategory, buildLogs, generateCode])

  // Clear module-level preview key when switching projects so the new project can auto-preview
  useEffect(() => {
    lastAutoPreviewKey = null
  }, [projectId])

  // FIXED: Added createSandbox to dependency array
  useEffect(() => {
    if (!project) return
    if (project.sandboxUrl) return
    if (!project.files || project.files.length === 0) return
    if (project.status !== "complete") return
    if (isSandboxLoading || isGenerating) return

    const signature = `${project.id}:${project.files.length}:${project.files[0]?.path || ""}:${project.files[project.files.length - 1]?.path || ""}`
    const key = `${projectId}:${signature}`
    if (lastAutoPreviewKey === key) return
    lastAutoPreviewKey = key
    lastAutoPreviewSignatureRef.current = signature

    console.log("[AutoPreview] Triggering createSandbox")
    createSandbox(project.files)
  }, [project, projectId, isSandboxLoading, isGenerating, createSandbox])

  const handleSendMessage = async (submittedValue?: string, submittedModel?: string) => {
    const nextMessage = (submittedValue ?? chatInput).trim()
    if (!nextMessage || !project || isGenerating) return

    if (remainingTokens <= 0) {
      setTokenLimitModalOpen(true)
      return
    }

    const userMessage = nextMessage
    setChatInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px"
    }

    const projectRef = doc(db, "projects", projectId)
    await updateDoc(projectRef, {
      messages: [
        ...(project.messages || []),
        { role: "user", content: userMessage }
      ]
    })

    const fullPrompt = `Original request: ${project.prompt}\n\nUser wants these modifications: ${userMessage}`
    await generateCode(fullPrompt, project.model)
  }

  const handleManualVisualSave = useCallback(async (payload: {
    id: string
    description: string | null
    initial: { content?: string; styles?: Record<string, string> }
    current: { content?: string; styles?: Record<string, string> }
  }) => {
    if (!project || !canEdit || isGenerating) return

    const prompt = [
      "Apply the following manual visual edit to the project source code so it persists in the app (not runtime-only DOM).",
      "Target the component/page that renders the selected element and keep unrelated code unchanged.",
      "",
      `Selected element: ${payload.description || payload.id}`,
      "",
      "Original selected snapshot (before edit):",
      "```json",
      JSON.stringify(payload.initial, null, 2),
      "```",
      "",
      "Edited target snapshot (after edit):",
      "```json",
      JSON.stringify(payload.current, null, 2),
      "```",
      "",
      "Requirements:",
      "- Persist content and style updates in source files.",
      "- If styles are from utility classes, update classes/CSS appropriately rather than using brittle runtime hacks.",
      "- Preserve existing design system and theme.",
      "- Return only changed files.",
    ].join("\n")

    await handleSendMessage(prompt)
  }, [project, canEdit, isGenerating, handleSendMessage])


  const copyCode = async () => {
    if (selectedFile) {
      await navigator.clipboard.writeText(selectedFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadProject = async () => {
    if (!project?.files) return
    
    try {
      const zip = new JSZip()
      
      // Add all files to the zip with proper folder structure
      project.files.forEach(file => {
        // Ensure the path doesn't start with a slash
        const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path
        zip.file(cleanPath, file.content)
      })
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: "blob" })
      
      // Create download link
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `project-${projectId}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error creating zip file:", error)
      // Fallback to text file if zip creation fails
      const content = project.files.map(f => 
        `// ==================== ${f.path} ====================\n${f.content}`
      ).join("\n\n")
      
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `project-${projectId}.txt`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Combine project files with generating files
  const displayFiles = isGenerating ? generatingFiles : (project?.files || [])
  
  // Prefer explicit project name; fall back to prompt-derived title
  const displayProjectName = project?.name || project?.prompt?.split(' ').slice(0, 3).join(' ') || 'Untitled Project'

  // Calculate tokens limit (never negative remaining)
  const remainingDisplay = userData ? Math.max(0, userData.tokenUsage.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingDisplay : 0

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          </div>
          <TextShimmer className="text-sm">{authLoading ? "Loading…" : "Loading project..."}</TextShimmer>
        </div>
      </div>
    )
  }

  if (accessError === "private") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-8">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Share className="w-6 h-6 text-zinc-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">This project is private</h1>
          <p className="text-zinc-500 text-sm mb-6">Sign in to request access or open your own project.</p>
          <Link href={`/login?redirect=${encodeURIComponent(`/project/${projectId}`)}`}>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-white border-0">Sign in</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (accessError === "forbidden") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-8">
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">You don&apos;t have access</h1>
          <p className="text-zinc-500 text-sm mb-6">This project is private and you aren&apos;t an owner or editor.</p>
          <Link href="/">
            <Button variant="outline" className="border-zinc-700 text-zinc-300">Back home</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Project not found</h1>
          <p className="text-zinc-500 mb-6">This project doesn&apos;t exist or has been deleted.</p>
          <Link href="/">
            <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 bg-transparent">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen max-w-full min-w-0 overflow-hidden bg-zinc-950 flex flex-col touch-pan-y overscroll-none">
      {/* Subtle ambient background, shared with marketing pages */}
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(245,158,11,0.10),transparent)]" />
      <div className="pointer-events-none fixed inset-0 -z-30 bg-[linear-gradient(to_bottom,rgba(9,9,11,0.98),rgb(9,9,11))]" />
      {/* Top Header Bar - modern glass bar */}
      <div
        className="h-auto lg:h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 pt-3 pb-2 lg:py-0 border-b border-zinc-800/80 bg-zinc-900/95 backdrop-blur-xl flex-shrink-0 gap-3 min-w-0 shadow-[0_1px_0_0_rgba(255,255,255,0.03)]"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)" }}
      >
        {/* Mobile: Burger menu - touch-friendly */}
        <div className="lg:hidden flex items-center min-w-[44px] min-h-[44px] -ml-2 items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-950/40 text-zinc-200 shadow-sm shadow-black/20 ring-1 ring-white/5 hover:text-zinc-50 hover:bg-zinc-900/70 hover:border-zinc-700/80 transition-all duration-200 active:scale-[0.97]"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[min(calc(100vw-1.5rem),20rem)] max-w-80 bg-zinc-950/98 border border-zinc-800/80 shadow-2xl rounded-2xl p-1.5 ring-1 ring-white/10 backdrop-blur-xl">
              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/projects" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <ArrowLeft className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Back to Studio</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              <div className="px-3 py-2">
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Actions</div>

                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); handleOpenIntegrations(); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-800/70 cursor-pointer focus:bg-zinc-800/70 outline-none"
                >
                  <Plug className="w-4 h-4 text-zinc-300 shrink-0" />
                  <span className="text-sm text-zinc-100">Integrations</span>
                </DropdownMenuItem>

                <div className="pt-2">
                  <button onClick={() => setDeployOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                    <Rocket className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-semibold text-zinc-100">Deploy</span>
                  </button>
                </div>
                <div className="pt-2">
                  {githubConnected === false ? (
                    <button onClick={handleConnectGitHub} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                      <Github className="w-4 h-4 text-zinc-400" />
                      <span className="text-sm font-semibold text-zinc-100">Connect GitHub</span>
                    </button>
                  ) : githubConnected === true && project?.files?.length ? (
                    <>
                      {project.githubRepoUrl ? (
                        <>
                          <a href={project.githubRepoUrl} target="_blank" rel="noreferrer" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                            <Github className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm text-zinc-100 truncate flex-1">View repo</span>
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          </a>
                          <button onClick={handleSyncToGitHub} disabled={isSyncing} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left disabled:opacity-50">
                            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <RefreshCw className="w-4 h-4 text-zinc-400" />}
                            <span className="text-sm text-zinc-100">Re-sync to GitHub</span>
                          </button>
                        </>
                      ) : (
                        <button onClick={handleSyncToGitHub} disabled={isSyncing} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left disabled:opacity-50">
                          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <Github className="w-4 h-4 text-zinc-400" />}
                          <span className="text-sm text-zinc-100">{isSyncing ? "Syncing…" : "Sync to GitHub"}</span>
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              <DropdownMenuLabel className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-3">
                Project
              </DropdownMenuLabel>

              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={() => { setRenameValue(project?.name || ''); setRenameOpen(true); }}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Edit2 className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Rename Project</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={duplicateProject}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Copy className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Duplicate Project</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer">
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Remix Project</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={downloadProject}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Download className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Export Project</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/settings" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Settings className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Settings</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/help" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Help & Support</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Rename Project Modal */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),24rem)]">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
              <DialogDescription>Set a new name for this project.</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100"
                placeholder="New project name"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRename}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Title (center on mobile, dropdown on desktop) */}
        <div className="flex-1 flex justify-center lg:justify-start min-w-0 px-1">
          <div className="lg:hidden text-sm font-semibold text-zinc-100 truncate text-center max-w-[55vw] sm:max-w-[60vw]">
            {displayProjectName}
          </div>

          {/* Desktop: Logo, Separator, Title with Dropdown */}
          <div className="hidden lg:flex items-center gap-3 min-w-0">
            <Link href="/" className="font-display text-base font-semibold text-zinc-100 hover:text-zinc-200 transition-colors flex-shrink-0">
              BuildKit
            </Link>
            <div className="h-4 w-px bg-zinc-700" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-sm font-medium text-zinc-100 hover:text-zinc-200 transition-colors px-2 py-1 rounded-md hover:bg-zinc-800/50 min-w-0">
                  <span className="truncate lg:max-w-none">{displayProjectName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 bg-zinc-900 border-zinc-800 shadow-xl">
              {/* Back to Studio */}
              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/projects" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <ArrowLeft className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Back to Studio</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              {/* Plan Section */}
              <div className="px-3 py-3">
                <DropdownMenuLabel className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-0">
                  Plan & Usage
                </DropdownMenuLabel>

                {/* Plan Card (dynamic from Firestore userData) */}
                <div className="rounded-lg border border-zinc-700/50 bg-zinc-950 p-4 space-y-3 shadow-lg">
                  {/* Plan Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                        <Zap className="w-4 h-4 text-zinc-200" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-zinc-50 capitalize leading-tight">
                          {userData?.planName || (userData?.planId ?? 'Free')}
                        </span>
                        <span className="text-xs text-zinc-400 font-medium">
                          {userData ? `${userData.tokenUsage.used.toLocaleString()} / ${tokensLimit.toLocaleString()} tokens` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">Token Usage</span>
                      <span className="text-xs font-bold text-zinc-100">
                        {userData && tokensLimit > 0 ? `${Math.round(((userData.tokenUsage.used) / tokensLimit) * 100)}%` : ''}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-800/80 rounded-full overflow-hidden border border-zinc-700/30">
                      <div
                        className="h-full rounded-full transition-all duration-300 shadow-sm bg-gradient-to-r from-amber-400 to-yellow-500"
                        style={{ width: userData && tokensLimit > 0 ? `${Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100))}%` : '0%' }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Used: {userData ? userData.tokenUsage.used.toLocaleString() : '—'}</span>
                      <span>Remaining: {userData ? Math.max(0, userData.tokenUsage.remaining ?? 0).toLocaleString() : '—'}</span>
                    </div>
                  </div>

                  {/* Upgrade Button */}
                  <Link
                    href="/pricing"
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg bg-gradient-to-r from-zinc-800 to-zinc-800/90 border border-zinc-700/50 hover:from-zinc-700 hover:to-zinc-700/90 hover:border-zinc-600/50 transition-all group shadow-sm"
                  >
                    <div className="p-1 rounded bg-zinc-700/50 group-hover:bg-yellow-500/20 transition-colors">
                      <Crown className="w-3.5 h-3.5 text-zinc-300 group-hover:text-yellow-400 transition-colors" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-100 group-hover:text-zinc-50">Upgrade Plan</span>
                    <TrendingUp className="w-3.5 h-3.5 text-zinc-400 ml-auto group-hover:text-zinc-300 transition-colors" />
                  </Link>
                </div>
              </div>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              {/* Project Actions */}
              <DropdownMenuLabel className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-3">
                Project
              </DropdownMenuLabel>

              {canEdit && (
                <>
              {/* Rename */}
              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={() => { setRenameValue(project?.name || ''); setRenameOpen(true); }}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Edit2 className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Rename Project</span>
                </div>
              </DropdownMenuItem>

              {/* Duplicate */}
              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={duplicateProject}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Copy className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Duplicate Project</span>
                </div>
              </DropdownMenuItem>

              {/* Remix */}
              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={remixProject}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Remix Project</span>
                </div>
              </DropdownMenuItem>
                </>
              )}

              {/* Export */}
              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer" onSelect={downloadProject}>
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Download className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Export Project</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800 my-1" />

              {/* Settings */}
              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/settings" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <Settings className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Settings</span>
                </Link>
              </DropdownMenuItem>

              {/* Help & Support */}
              <DropdownMenuItem asChild className="px-3 py-2.5">
                <Link href="/help" className="flex items-center gap-2.5 cursor-pointer w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Help & Support</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          </div>
        </div>

        {/* Right: Action Buttons (desktop only) - only when user can edit */}
        {canEdit && (
        <div className="hidden lg:flex items-center gap-2 overflow-x-auto custom-scrollbar min-w-0 max-w-[min(46vw,24rem)] lg:max-w-[min(52vw,32rem)] xl:max-w-none shrink-0 lg:shrink">
          <button onClick={handleOpenIntegrations} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center">
            <Plug className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-300 transition-colors" />
            Integrations
          </button>
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 bg-transparent min-w-fit flex items-center"
          >
            <Rocket className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Deploy
          </button>
          {githubConnected === false ? (
            <button
              type="button"
              onClick={handleConnectGitHub}
              className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center"
            >
              <Github className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
              Connect GitHub
            </button>
          ) : githubConnected === true && project?.files?.length ? (
            <div className="flex items-center gap-1.5">
              {project.githubRepoUrl ? (
                <>
                  <a
                    href={project.githubRepoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 flex items-center gap-1.5 truncate max-w-[180px]"
                    title={project.githubRepoUrl}
                  >
                    <Github className="w-4 h-4 shrink-0 text-zinc-400" />
                    <span className="truncate">{project.githubRepoFullName || "View repo"}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                  </a>
                  <button
                    type="button"
                    onClick={handleSyncToGitHub}
                    disabled={isSyncing}
                    className="h-9 px-3 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 flex items-center disabled:opacity-50"
                    title="Re-sync to GitHub"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSyncToGitHub}
                  disabled={isSyncing}
                  className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center"
                >
                  {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Github className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />}
                  {isSyncing ? "Syncing…" : "Sync to GitHub"}
                </button>
              )}
            </div>
          ) : null}
          <button onClick={handleShare} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 bg-transparent min-w-fit flex items-center">
            <Share className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Share
          </button>
        </div>
        )}

        {/* Mobile Share Button - touch-friendly (only when can edit) */}
        {canEdit && (
        <div className="lg:hidden flex items-center min-h-[44px]">
          <button 
            onClick={handleShare} 
            className="h-11 min-w-[44px] px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-xl transition-all duration-200 bg-transparent flex items-center justify-center touch-manipulation"
          >
            <Share className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Share
          </button>
        </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        {/* AI-suggested backend: Connect Supabase? banner */}
        {project?.suggestsBackend && !project?.supabaseUrl && !suggestBackendDismissed && (
          <div className="flex-shrink-0 px-3 sm:px-4 py-2.5 border-b border-zinc-600/50 bg-zinc-900/50 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-zinc-600/20 border border-zinc-500/30 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">This project could use a database</p>
                <p className="text-xs text-zinc-500">Connect Supabase to add auth and persistent data—like Rocket.new.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSuggestBackendDismissed(true)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={() => { setIntegrationsOpen(true); setSupabaseConnectOpen(true) }}
                className="inline-flex items-center justify-center rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80 px-3 py-1.5 transition-colors"
              >
                <img src="/Images/connect-supabase-light.svg" alt="Connect with Supabase" className="h-8 w-auto" />
              </button>
            </div>
          </div>
        )}

        <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),28rem)] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Deploy</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Deploy this project to Netlify or Vercel.
              </DialogDescription>
            </DialogHeader>

            <div className="flex border-b border-zinc-800 -mx-6 px-6">
              <button
                type="button"
                onClick={() => setDeployTab("netlify")}
                className={cn(
                  "py-2.5 px-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                  deployTab === "netlify"
                    ? "border-zinc-100 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                Netlify
              </button>
              <button
                type="button"
                onClick={() => setDeployTab("vercel")}
                className={cn(
                  "py-2.5 px-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                  deployTab === "vercel"
                    ? "border-zinc-100 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                Vercel
              </button>
            </div>

            <div className="space-y-4">
              {deployTab === "netlify" && (
                <>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="text-sm text-zinc-300">
                        Status: {netlifyConnected === null ? "Checking..." : netlifyConnected ? "Connected" : "Not connected"}
                      </div>
                      <div className="flex items-center gap-2">
                        {!netlifyConnected ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="border-zinc-800 text-zinc-200 bg-transparent hover:bg-zinc-900"
                            onClick={handleConnectNetlify}
                            disabled={isDeploying}
                          >
                            Connect Netlify
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="bg-zinc-100 text-zinc-900 hover:bg-white"
                            onClick={handleDeployToNetlify}
                            disabled={isDeploying}
                          >
                            {isDeploying ? "Deploying..." : deployLinks?.siteId ? "Update live site" : "Deploy live site"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-400">
                        Site name (optional)
                      </label>
                      <Input
                        value={netlifySiteName}
                        onChange={(e) => setNetlifySiteName(e.target.value)}
                        placeholder={project?.name ? `${project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}` : "my-project"}
                        className="h-9 bg-zinc-900 border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500"
                      />
                      <p className="text-[11px] text-zinc-500">
                        This controls how your Netlify URL looks, for example <span className="font-mono">my-project.netlify.app</span>.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="text-xs text-zinc-400">Current step</div>
                    <div className="mt-1 text-sm text-zinc-100 font-mono">{deployStep || "-"}</div>
                  </div>
                  {deployError && (
                    <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
                      {deployError}
                    </div>
                  )}
                  {deployLinks && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                        Your live website
                      </div>
                      <div className="mt-1 space-y-2.5 text-sm">
                        {deployLinks.siteUrl && (() => {
                          let label = "your-site.netlify.app"
                          try {
                            const u = new URL(deployLinks.siteUrl as string)
                            label = u.host
                          } catch {
                            // ignore parse errors, keep default label
                          }
                          return (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <div className="flex flex-col">
                                <span className="text-zinc-100 font-medium">Shareable link</span>
                                <span className="text-[11px] text-zinc-500">
                                  This is the link you send to friends or customers.
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-1.5 sm:min-w-[40%] sm:justify-end">
                                <a
                                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 shadow-sm w-full sm:w-auto"
                                  href={deployLinks.siteUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="truncate max-w-[160px]">{label}</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center h-8 w-full sm:w-8 rounded-full border border-zinc-700/70 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 text-[11px]"
                                  onClick={() => {
                                    try {
                                      navigator.clipboard.writeText(deployLinks.siteUrl as string)
                                      toast({ title: "Link copied" })
                                    } catch {
                                      // ignore clipboard errors
                                    }
                                  }}
                                  aria-label="Copy link"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                        {deployLinks.deployUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Most recent publish</span>
                              <span className="text-[11px] text-zinc-500">
                                Opens the latest version of your site Netlify put online.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                              href={deployLinks.deployUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>View deployment</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                        {deployLinks.adminUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Website settings</span>
                              <span className="text-[11px] text-zinc-500">
                                Change things like domain, redirects, and other options.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                              href={deployLinks.adminUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>Open dashboard</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                        {deployLinks.adminUrl &&
                          deployLinks.deployId &&
                          (() => {
                            try {
                              const u = new URL(deployLinks.adminUrl as string)
                              u.pathname = `${u.pathname.replace(/\/$/, "")}/deploys/${deployLinks.deployId}`
                              const href = u.toString()
                              return (
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                  <div className="flex flex-col">
                                    <span className="text-zinc-300">Previous publishes</span>
                                    <span className="text-[11px] text-zinc-500">
                                      Handy if the site broke after a change and you want to inspect it.
                                    </span>
                                  </div>
                                  <a
                                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <span>View in Netlify</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              )
                            } catch {
                              return null
                            }
                          })()}
                        {netlifyLogUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Technical details (optional)</span>
                              <span className="text-[11px] text-zinc-500">
                                Extra information for developers. Safe to ignore if your site looks good.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 w-full sm:w-auto"
                              href={netlifyLogUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>Open logs</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                      {netlifyDeployState && (
                        <div className="pt-2 text-xs text-zinc-400">
                          Netlify status: <span className="text-zinc-200 font-mono">{netlifyDeployState}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="rounded-xl border border-zinc-800 bg-black/30 overflow-hidden">
                    <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400">Build logs (E2B)</div>
                    <div className="max-h-64 overflow-y-auto p-3 font-mono text-xs text-zinc-200 whitespace-pre-wrap">
                      {deployLogs.length ? deployLogs.join("\n") : "No logs yet."}
                    </div>
                  </div>
                </>
              )}

              {deployTab === "vercel" && (
                <>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Zap className="w-6 h-6 text-zinc-300" />
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-100">Vercel</h3>
                        <p className="text-xs text-zinc-500">
                          {vercelConnected === null ? "Checking..." : vercelConnected ? "Connected" : "Enter your Personal Access Token to deploy"}
                        </p>
                      </div>
                    </div>
                    {!vercelConnected ? (
                      <div className="space-y-3">
                        <p className="text-xs text-zinc-400">
                          We need a Personal Access Token to deploy to your Vercel account. It&apos;s stored per project and only used to create deployments. Create one at:
                        </p>
                        <a
                          href="https://vercel.com/account/tokens"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          vercel.com/account/tokens
                        </a>
                        <Input
                          value={vercelTokenInput}
                          onChange={(e) => setVercelTokenInput(e.target.value)}
                          placeholder="vercel_pat_..."
                          className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                        />
                        <Button
                          type="button"
                          className="bg-zinc-100 text-zinc-900 hover:bg-white w-full"
                          onClick={handleSaveVercelToken}
                          disabled={!vercelTokenInput.trim() || isVercelDeploying}
                        >
                          Save Token
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        className="bg-zinc-100 text-zinc-900 hover:bg-white w-full"
                        onClick={handleDeployToVercel}
                        disabled={isVercelDeploying}
                      >
                        {isVercelDeploying ? "Deploying..." : "Deploy to Vercel"}
                      </Button>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="text-xs text-zinc-400">Current step</div>
                    <div className="mt-1 text-sm text-zinc-100 font-mono">{vercelDeployStep || "-"}</div>
                  </div>
                  {vercelDeployError && (
                    <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
                      {vercelDeployError}
                    </div>
                  )}
                  {vercelDeployLinks && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
                      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Your site on Vercel
                      </div>
                      <div className="space-y-2.5 text-sm">
                        {vercelDeployLinks.siteUrl && (() => {
                          let host = "your-site.vercel.app"
                          try {
                            const u = new URL(vercelDeployLinks.siteUrl as string)
                            host = u.host
                          } catch {
                            // ignore
                          }
                          return (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <div className="flex flex-col">
                                <span className="text-zinc-300">Shareable link</span>
                                <span className="text-[11px] text-zinc-500">
                                  This is the main URL people will visit.
                                </span>
                              </div>
                              <a
                                className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                                href={vercelDeployLinks.siteUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span className="truncate max-w-[160px]">{host}</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )
                        })()}
                        {vercelDeployLinks.deployUrl && vercelDeployLinks.deployUrl !== vercelDeployLinks.siteUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Preview link</span>
                              <span className="text-[11px] text-zinc-500">
                                A preview just for this deployment.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                              href={vercelDeployLinks.deployUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>Open preview</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                        {vercelDeployLinks.adminUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Project in Vercel</span>
                              <span className="text-[11px] text-zinc-500">
                                Manage domains, env vars, and more.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-white w-full sm:w-auto"
                              href={vercelDeployLinks.adminUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>Open in Vercel</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                        {vercelLogUrl && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-col">
                              <span className="text-zinc-300">Build logs</span>
                              <span className="text-[11px] text-zinc-500">
                                Only needed if something goes wrong.
                              </span>
                            </div>
                            <a
                              className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 w-full sm:w-auto"
                              href={vercelLogUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>Open logs</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                      {vercelDeployState && (
                        <div className="pt-2 text-xs text-zinc-500 border-t border-zinc-800">
                          Status: <span className="text-zinc-300 font-mono">{vercelDeployState}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="rounded-xl border border-zinc-800 bg-black/30 overflow-hidden">
                    <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400">Deploy logs</div>
                    <div className="max-h-64 overflow-y-auto p-3 font-mono text-xs text-zinc-200 whitespace-pre-wrap">
                      {vercelDeployLogs.length ? vercelDeployLogs.join("\n") : "No logs yet."}
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Integrations modal - wider on desktop; mobile: full-height, horizontal nav */}
        <Dialog open={integrationsOpen} onOpenChange={(open) => { setIntegrationsOpen(open); if (!open) setSupabaseConnectOpen(false) }}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl w-[calc(100vw-1rem)] max-w-[min(calc(100vw-1rem),48rem)] sm:max-w-3xl md:max-w-4xl sm:w-[95vw] p-0 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[85vh]">
            <DialogHeader className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-zinc-800/60">
              <DialogTitle className="text-zinc-100 text-base sm:text-lg font-semibold">Integrations</DialogTitle>
              <p className="text-zinc-400 text-xs sm:text-sm mt-0.5 sm:hidden">
                Link your accounts and put your app online.
              </p>
              <DialogDescription className="text-zinc-400 text-xs sm:text-sm mt-0.5 hidden sm:block">
                Connect services to sync, deploy, and add a backend to this project.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
              {/* Nav: horizontal scroll on mobile, vertical sidebar on md+ */}
              <nav className="flex-shrink-0 flex flex-row md:flex-col overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-r border-zinc-800/60 bg-zinc-900/30 py-2 md:py-3 md:w-44 lg:w-52 custom-scrollbar">
                <div className="flex flex-row md:flex-col gap-1.5 md:gap-0 md:space-y-0.5 px-2 md:px-3 md:min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("all")}
                    className={cn(
                      "shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "all"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <LayoutGrid className="w-4 h-4 text-zinc-300" />
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">All</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("github")}
                    className={cn(
                      "shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "github"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Github className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <span className="text-sm font-medium block">GitHub</span>
                      {githubConnected === true && (
                        <span className="text-[10px] text-zinc-400 font-medium">Connected</span>
                      )}
                    </div>
                    <span className="text-sm font-medium sm:hidden whitespace-nowrap">GitHub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("netlify")}
                    className={cn(
                      "hidden sm:flex shrink-0 md:w-full items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "netlify"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Rocket className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <span className="text-sm font-medium block">Netlify</span>
                      {netlifyConnected === true && (
                        <span className="text-[10px] text-zinc-400 font-medium">Connected</span>
                      )}
                    </div>
                    <span className="text-sm font-medium sm:hidden whitespace-nowrap">Netlify</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("vercel")}
                    className={cn(
                      "hidden sm:flex shrink-0 md:w-full items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "vercel"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <span className="text-sm font-medium block">Vercel</span>
                      {vercelConnected === true && (
                        <span className="text-[10px] text-zinc-400 font-medium">Connected</span>
                      )}
                    </div>
                    <span className="text-sm font-medium sm:hidden whitespace-nowrap">Vercel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("supabase")}
                    className={cn(
                      "hidden sm:flex shrink-0 md:w-full items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "supabase"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-600/10 border border-zinc-500/20 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <span className="text-sm font-medium block">Supabase</span>
                      {supabaseConnected && (
                        <span className="text-[10px] text-zinc-400 font-medium">Connected</span>
                      )}
                    </div>
                    <span className="text-sm font-medium sm:hidden whitespace-nowrap">Supabase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("vars")}
                    className={cn(
                      "shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 min-h-[44px] md:min-h-0",
                      selectedIntegration === "vars"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4 text-zinc-300" />
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap sm:hidden">Secrets</span>
                    <span className="text-sm font-medium whitespace-nowrap hidden sm:inline">Vars</span>
                  </button>
                </div>
                <div className="hidden md:block mt-auto px-2 sm:px-3 pt-3 border-t border-zinc-800/60">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">More coming</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Stripe and others soon.</p>
                </div>
              </nav>
              {/* Right content - selected integration */}
              <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 sm:p-6">
                {selectedIntegration === "all" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                          <Github className="w-6 h-6 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">GitHub</h3>
                          <p className="text-sm text-zinc-500 mt-1 sm:hidden">Save your code to GitHub so you can share it or open it elsewhere.</p>
                          <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Create a repo and sync your project code. Re-sync whenever you make changes.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {githubConnected === false ? (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectGitHub}>
                                <Github className="w-3.5 h-3.5 mr-2" />
                                <span className="sm:hidden">Link my GitHub</span>
                                <span className="hidden sm:inline">Connect GitHub</span>
                              </Button>
                            ) : (
                              <>
                                {project?.githubRepoUrl ? (
                                  <>
                                    <a href={project.githubRepoUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
                                      <ExternalLink className="w-3.5 h-3.5" /> View repo
                                    </a>
                                    <Button type="button" size="sm" variant="outline" className="h-9 px-3 text-xs font-semibold border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" onClick={handleSyncToGitHub} disabled={isSyncing || !project?.files?.length}>
                                      {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                                      <span className="sm:hidden">{isSyncing ? "Updating…" : "Update my repo"}</span>
                                      <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Re-sync"}</span>
                                    </Button>
                                  </>
                                ) : project?.files?.length ? (
                                  <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleSyncToGitHub} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Github className="w-3.5 h-3.5 mr-2" />}
                                    <span className="sm:hidden">{isSyncing ? "Saving…" : "Save to GitHub"}</span>
                                    <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync to GitHub"}</span>
                                  </Button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                          <Rocket className="w-6 h-6 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">Netlify</h3>
                          <p className="text-sm text-zinc-500 mt-1 sm:hidden">Put your app on the web with a live link. Connect once, then publish with one tap.</p>
                          <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Deploy this project to Netlify for a live URL. One-click deploy after connecting your account.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!netlifyConnected ? (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectNetlify}>
                                <span className="sm:hidden">Link Netlify</span>
                                <span className="hidden sm:inline">Connect Netlify</span>
                              </Button>
                            ) : (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployTab("netlify"); setDeployOpen(true) }}>
                                <span className="sm:hidden">Publish online</span>
                                <span className="hidden sm:inline">Deploy to Netlify</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                          <Zap className="w-6 h-6 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">Vercel</h3>
                          <p className="text-sm text-zinc-500 mt-1 sm:hidden">Get a live link for your app. Paste a token from Vercel below—we&apos;ll tell you where to get it.</p>
                          <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Deploy to Vercel&apos;s global edge network. We need a Personal Access Token (stored per project, only used to create deployments).</p>
                          <div className="mt-3 text-xs sm:hidden">
                            <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Get your token (opens Vercel)
                            </a>
                          </div>
                          <div className="mt-3 text-xs hidden sm:block">
                            <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Create token at vercel.com/account/tokens
                            </a>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 items-end">
                            {!vercelConnected ? (
                              <>
                                <Input
                                  value={vercelTokenInput}
                                  onChange={(e) => setVercelTokenInput(e.target.value)}
                                  placeholder="Paste token here"
                                  className="h-9 w-full min-w-0 sm:w-64 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-xs"
                                />
                                <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleSaveVercelToken} disabled={!vercelTokenInput.trim()}>
                                  <span className="sm:hidden">Save</span>
                                  <span className="hidden sm:inline">Save Token</span>
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployTab("vercel"); setDeployOpen(true) }} disabled={isVercelDeploying}>
                                  {isVercelDeploying ? "Deploying..." : "Deploy to Vercel"}
                                </Button>
                                {vercelDeployLinks?.siteUrl && (
                                  <a href={vercelDeployLinks.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 underline break-all">
                                    <ExternalLink className="w-3.5 h-3.5" /> {vercelDeployLinks.siteUrl}
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-600/10 border border-zinc-500/20 flex items-center justify-center shrink-0">
                          <Database className="w-6 h-6 text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">Supabase</h3>
                          <p className="text-sm text-zinc-500 mt-1 sm:hidden">Add sign-in and a database to your app. We&apos;ll set it up for you.</p>
                          <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Add a backend: auth, database, and real-time. We'll inject the Supabase client and a starter SQL migration.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!supabaseConnected ? (
                              <Button type="button" size="sm" className="h-9 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80" onClick={() => setSupabaseConnectOpen(true)}>
                                <img src="/Images/connect-supabase-light.svg" alt="Connect with Supabase" className="h-7 w-auto" />
                              </Button>
                            ) : (
                              <>
                                <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleInjectSupabase} disabled={supabaseInjecting}>
                                  {supabaseInjecting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
                                  <span className="sm:hidden">{supabaseInjecting ? "Setting up…" : "Set up in my project"}</span>
                                  <span className="hidden sm:inline">{supabaseInjecting ? "Adding…" : "Add client & migration"}</span>
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50" onClick={() => updateDoc(doc(db, "projects", projectId), { supabaseUrl: deleteField(), supabaseAnonKey: deleteField(), supabaseServiceRoleKey: deleteField(), supabaseConnectedAt: deleteField() })}>
                                  <span className="sm:hidden">Unlink</span>
                                  <span className="hidden sm:inline">Disconnect</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "github" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                        <Github className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100">GitHub</h3>
                        <p className="text-sm text-zinc-500 mt-1 sm:hidden">Save your code to GitHub so you can share it or open it elsewhere.</p>
                        <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Create a repo and sync your project code. Re-sync whenever you make changes so your repository stays up to date.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {githubConnected === false ? (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectGitHub}>
                              <Github className="w-3.5 h-3.5 mr-2" />
                              <span className="sm:hidden">Link my GitHub</span>
                              <span className="hidden sm:inline">Connect GitHub</span>
                            </Button>
                          ) : (
                            <>
                              {project?.githubRepoUrl ? (
                                <>
                                  <a href={project.githubRepoUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
                                    <ExternalLink className="w-3.5 h-3.5" /> View repo
                                  </a>
                                  <Button type="button" size="sm" variant="outline" className="h-9 px-3 text-xs font-semibold border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" onClick={handleSyncToGitHub} disabled={isSyncing || !project?.files?.length}>
                                    {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />} {isSyncing ? "Syncing…" : "Re-sync"}
                                  </Button>
                                </>
                              ) : project?.files?.length ? (
                                <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleSyncToGitHub} disabled={isSyncing}>
                                  {isSyncing ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Github className="w-3.5 h-3.5 mr-2" />} {isSyncing ? "Syncing…" : "Sync to GitHub"}
                                </Button>
                              ) : null}
                              <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50" onClick={() => { handleDisconnectGitHub(); setIntegrationsOpen(false) }}>Disconnect</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "netlify" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                        <Rocket className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100">Netlify</h3>
                        <p className="text-sm text-zinc-500 mt-1 sm:hidden">Put your app on the web with a live link. Connect once, then publish with one tap.</p>
                        <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Deploy this project to Netlify for a live URL. One-click deploy after connecting your account.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!netlifyConnected ? (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectNetlify}>
                              <span className="sm:hidden">Link Netlify</span>
                              <span className="hidden sm:inline">Connect Netlify</span>
                            </Button>
                          ) : (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployTab("netlify"); setDeployOpen(true) }}>
                              <span className="sm:hidden">Publish online</span>
                              <span className="hidden sm:inline">Deploy to Netlify</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "vercel" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                        <Zap className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100">Vercel</h3>
                        <p className="text-sm text-zinc-500 mt-1 sm:hidden">Get a live link for your app. Paste a token from Vercel below—get it at vercel.com/account/tokens.</p>
                        <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Deploy to Vercel&apos;s global edge network. We need a Personal Access Token so we can create deployments on your behalf. Your token is stored per project and only used to deploy.</p>
                        <div className="mt-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 sm:hidden">
                          <span className="font-medium text-zinc-300">Where to get it:</span> Open{" "}
                          <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-200 hover:text-zinc-100 underline">
                            vercel.com/account/tokens <ExternalLink className="w-3 h-3" />
                          </a>
                          , create a token, then paste it below.
                        </div>
                        <div className="mt-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 hidden sm:block">
                          <span className="font-medium text-zinc-300">How to get your token:</span> Go to{" "}
                          <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-200 hover:text-zinc-100 underline">
                            vercel.com/account/tokens <ExternalLink className="w-3 h-3" />
                          </a>
                          , create a new token (e.g. &quot;BuildKit&quot;), and paste it below.
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 items-end">
                          {!vercelConnected ? (
                            <>
                              <Input
                                value={vercelTokenInput}
                                onChange={(e) => setVercelTokenInput(e.target.value)}
                                placeholder="Paste token here"
                                className="h-9 w-full min-w-0 sm:w-64 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-xs"
                              />
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleSaveVercelToken} disabled={!vercelTokenInput.trim()}>
                                <span className="sm:hidden">Save</span>
                                <span className="hidden sm:inline">Save Token</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-green-500 font-medium">Connected ✓</p>
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployTab("vercel"); setDeployOpen(true) }} disabled={isVercelDeploying}>
                                <span className="sm:hidden">{isVercelDeploying ? "Publishing…" : "Publish online"}</span>
                                <span className="hidden sm:inline">{isVercelDeploying ? "Deploying..." : "Deploy to Vercel"}</span>
                              </Button>
                              {vercelDeployLinks?.siteUrl && (
                                <a href={vercelDeployLinks.siteUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100 transition-colors break-all">
                                  <ExternalLink className="w-3.5 h-3.5" /> Live site
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "supabase" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-600/10 border border-zinc-500/20 flex items-center justify-center shrink-0">
                        <Database className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100">Supabase</h3>
                        <p className="text-sm text-zinc-500 mt-1 sm:hidden">Add sign-in and a database to your app. We&apos;ll set it up for you.</p>
                        <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Add a backend: auth, database, and real-time. We'll inject the Supabase client and a starter SQL migration into your project.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!supabaseConnected ? (
                            <Button type="button" size="sm" className="h-9 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80" onClick={() => setSupabaseConnectOpen(true)}>
                              <img src="/Images/connect-supabase-light.svg" alt="Connect with Supabase" className="h-7 w-auto" />
                            </Button>
                          ) : (
                            <>
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleInjectSupabase} disabled={supabaseInjecting}>
                                {supabaseInjecting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
                                <span className="sm:hidden">{supabaseInjecting ? "Setting up…" : "Set up in my project"}</span>
                                <span className="hidden sm:inline">{supabaseInjecting ? "Adding…" : "Add client & migration"}</span>
                              </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50" onClick={() => updateDoc(doc(db, "projects", projectId), { supabaseUrl: deleteField(), supabaseAnonKey: deleteField(), supabaseServiceRoleKey: deleteField(), supabaseConnectedAt: deleteField() })}>
                                  <span className="sm:hidden">Unlink</span>
                                  <span className="hidden sm:inline">Disconnect</span>
                                </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "vars" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                        <Key className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100 sm:hidden">Secrets & API keys</h3>
                        <h3 className="text-base font-semibold text-zinc-100 hidden sm:block">Environment variables</h3>
                        <p className="text-sm text-zinc-500 mt-1 sm:hidden">Add keys your app needs (e.g. from an API). We keep them private and only use them in preview.</p>
                        <p className="text-sm text-zinc-500 mt-1 hidden sm:block">Add API keys and env vars for preview. Values are encrypted and only injected into the sandbox; they are never shown after save.</p>
                        {envVarsLoading ? (
                          <div className="mt-4 flex items-center gap-2 text-zinc-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                          </div>
                        ) : (
                          <>
                            <div className="mt-4 space-y-3">
                              {envFormEntries.map((entry, idx) => (
                                <div key={idx} className="flex flex-wrap gap-2 items-center">
                                  <input
                                    type="text"
                                    placeholder="Name"
                                    value={entry.name}
                                    onChange={(e) =>
                                      setEnvFormEntries((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p))
                                      )
                                    }
                                    className="flex-1 min-w-[120px] rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                    title="Variable name"
                                  />
                                  <input
                                    type="password"
                                    placeholder="Secret / key"
                                    value={entry.value}
                                    title="Value"
                                    onChange={(e) =>
                                      setEnvFormEntries((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p))
                                      )
                                    }
                                    className="flex-1 min-w-[140px] rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 px-3 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                onClick={() => setEnvFormEntries((prev) => [...prev, { name: "", value: "" }])}
                              >
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                <span className="sm:hidden">Add a secret</span>
                                <span className="hidden sm:inline">Add variable</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0"
                                onClick={handleSaveEnvVars}
                                disabled={envVarsSaving}
                              >
                                {envVarsSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                                {envVarsSaving ? "Saving…" : "Save"}
                              </Button>
                            </div>
                            {envVarNames.length > 0 && (
                              <p className="mt-3 text-[11px] text-zinc-500">
                                <span className="sm:hidden">You have {envVarNames.length} secret{envVarNames.length !== 1 ? "s" : ""} saved. Restart preview to use them.</span>
                                <span className="hidden sm:inline">You have {envVarNames.length} variable{envVarNames.length !== 1 ? "s" : ""} set. Re-run preview to use them.</span>
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Token limit reached — v0-style modal: no generation until reset or upgrade */}
        <Dialog open={tokenLimitModalOpen} onOpenChange={setTokenLimitModalOpen}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),28rem)] p-0 overflow-hidden">
            <div className="p-6 sm:p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
                <Coins className="w-7 h-7 text-amber-400" />
              </div>
              <DialogTitle className="text-xl font-semibold text-zinc-100">You&apos;ve used all your tokens</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm mt-2">
                Generation is paused until your tokens reset. Your plan refreshes monthly.
                {(() => {
                  const raw = userData?.tokenUsage?.periodEnd
                  let date: Date | null = raw instanceof Date ? raw : raw != null ? new Date(raw as string | number) : null
                  if (!date || isNaN(date.getTime())) {
                    const now = new Date()
                    date = new Date(now.getFullYear(), now.getMonth() + 1, 1)
                  }
                  return (
                    <span className="block mt-2 text-zinc-300">
                      Next reset: {date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                  )
                })()}
              </DialogDescription>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild className="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-semibold">
                  <Link href="/pricing">Upgrade for more tokens</Link>
                </Button>
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setTokenLimitModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Workspace dialog */}
        <Dialog open={createWorkspaceOpen} onOpenChange={(open) => { setCreateWorkspaceOpen(open); if (!open) setNewWorkspaceName("") }}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),24rem)] sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Create Workspace</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                Give your workspace a name to get started.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="My Workspace"
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                onKeyDown={(e) => { if (e.key === "Enter" && newWorkspaceName.trim()) handleCreateWorkspace() }}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => { setCreateWorkspaceOpen(false); setNewWorkspaceName("") }}>
                  Cancel
                </Button>
                <Button
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-medium"
                  onClick={handleCreateWorkspace}
                  disabled={!newWorkspaceName.trim() || creatingWorkspace}
                >
                  {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share dialog - visibility (public / private / link-only) + copy link */}
        <Dialog open={shareOpen} onOpenChange={(open) => { setShareOpen(open) }}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),24rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Share project</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                Control who can view and edit. Changes sync in real time for people with access.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Visibility</p>
                <div className="space-y-2">
                  {(
                    [
                      { value: "private" as const, label: "Private", desc: "Only you (and people you add as editors)" },
                      { value: "link-only" as const, label: "Link only", desc: "Anyone with the link can view" },
                      { value: "public" as const, label: "Public", desc: "Anyone can view with the link" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                        shareVisibility === opt.value
                          ? "border-zinc-600 bg-zinc-800/50"
                          : "border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-800/30"
                      )}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        checked={shareVisibility === opt.value}
                        onChange={() => setShareVisibility(opt.value)}
                        className="mt-1 rounded-full border-zinc-600 text-zinc-100 focus:ring-zinc-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-zinc-100">{opt.label}</span>
                        <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-1.5">Project link</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={projectUrl}
                    className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300"
                  />
                  <Button type="button" size="sm" variant="outline" className="shrink-0 border-zinc-700 text-zinc-300" onClick={handleCopyShareLink}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" className="text-zinc-400" onClick={() => setShareOpen(false)}>Cancel</Button>
                <Button type="button" className="bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleSaveShare} disabled={shareSaving}>
                  {shareSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Supabase connect form dialog */}
        <Dialog open={supabaseConnectOpen} onOpenChange={(open) => { setSupabaseConnectOpen(open); if (!open) { setSupabaseFormUrl(""); setSupabaseFormAnonKey("") } }}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),24rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Connect Supabase</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                Get your project URL and anon key from Supabase Dashboard → Project Settings → API.
              </DialogDescription>
            </DialogHeader>
            <form
              className="mt-4 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const url = supabaseFormUrl.trim().replace(/\/$/, "")
                const anonKey = supabaseFormAnonKey.trim()
                if (!url || !anonKey) return
                try {
                  await handleConnectSupabase(url, anonKey)
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Connect failed")
                }
              }}
            >
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Project URL</label>
                <input
                  type="url"
                  value={supabaseFormUrl}
                  onChange={(e) => setSupabaseFormUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co "
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Anon (public) key</label>
                <input
                  type="password"
                  value={supabaseFormAnonKey}
                  onChange={(e) => setSupabaseFormAnonKey(e.target.value)}
                  placeholder="eyJhbG..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" className="text-zinc-400" onClick={() => setSupabaseConnectOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-zinc-600/20 text-zinc-300 border border-zinc-500/40 hover:bg-zinc-600/30">Connect</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Mobile layout: only in DOM on small screens so desktop layout never shows below. */}
        {!isLg && (
        <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden w-full">
          {/* Mobile tabs - touch-friendly, modern pill bar */}
          <div className="px-3 sm:px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 p-1.5 shadow-inner">
              <button
                type="button"
                onClick={() => setMobileTab("chat")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 touch-manipulation min-h-[44px]",
                  mobileTab === "chat"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 active:scale-[0.99]"
                )}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileTab("preview")
                  setActiveTab("preview")
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 touch-manipulation min-h-[44px]",
                  mobileTab === "preview"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 active:scale-[0.99]"
                )}
              >
                <Eye className="w-4 h-4 shrink-0" />
                Preview
              </button>
            </div>
          </div>

          {/* Mobile content - prevent overflow */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {mobileTab === "chat" ? (
              <div className="h-full min-h-0 overflow-hidden rounded-b-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/45 to-zinc-950/35">
                <div className="border-b border-zinc-800/70 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">Agent Session</p>
                    </div>
                    <div className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2 py-1 text-[10px] text-zinc-400">
                      Live timeline
                    </div>
                  </div>
                </div>
                <div className="chat-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 overscroll-contain">
                  <ChatMessage
                    message={{ role: "user", content: project.prompt }}
                    isLast={false}
                    onEdit={canEdit ? () => setEditingTarget({ kind: "prompt" }) : undefined}
                    isEditing={editingTarget?.kind === "prompt"}
                    onEditSubmit={handleEditSubmit}
                    onCancelEdit={handleCancelEdit}
                    projectFiles={project?.files}
                    setSelectedFile={setSelectedFile}
                    setActiveTab={setActiveTab}
                  />

                  {project.messages?.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      message={msg}
                      isLast={i === project.messages!.length - 1}
                      onEdit={canEdit && msg.role === "user" ? () => setEditingTarget({ kind: "message", index: i }) : undefined}
                      isEditing={editingTarget?.kind === "message" && editingTarget.index === i}
                      onEditSubmit={handleEditSubmit}
                      onCancelEdit={handleCancelEdit}
                      projectFiles={project?.files}
                      setSelectedFile={setSelectedFile}
                      setActiveTab={setActiveTab}
                    />
                  ))}

                  {isGenerating && (
                    <div className="space-y-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3 sm:p-4">
                      <TextShimmer className="text-sm">
                        {agentStatus || "Working on your update"}
                      </TextShimmer>
                      <Steps defaultOpen>
                        <StepsTrigger>Agent run: Update your project</StepsTrigger>
                        <StepsContent>
                          <div className="space-y-1.5">
                            {runSteps.map((step, i) => (
                              <StepsItem
                                key={`${step}-${i}`}
                                className={i === runSteps.length - 1 ? "text-zinc-200" : undefined}
                              >
                                {step}
                              </StepsItem>
                            ))}
                          </div>
                        </StepsContent>
                      </Steps>
                      <Reasoning isStreaming={true}>
                        <ReasoningTrigger>Show reasoning</ReasoningTrigger>
                        <ReasoningContent className="ml-2 border-l-2 border-l-zinc-700 px-2 pb-1 text-zinc-400">
                          {reasoningText}
                        </ReasoningContent>
                      </Reasoning>
                      <Tool
                        className="w-full"
                        toolPart={{
                          type: "code_generation",
                          state: "processing",
                          input: { task: agentStatus || "Applying requested updates", steps: runSteps.length },
                        }}
                      />
                    </div>
                  )}

                  {project.status === "error" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-red-900/50 flex items-center justify-center text-red-400 shrink-0">
                        !
                      </div>
                      <div className="flex-1">
                        <div className="bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3 border border-red-800/30">
                          <p className="text-red-400 text-sm">Error: {project.error || "Generation failed"}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 border-red-800/50 text-red-400 hover:bg-red-900/20 bg-transparent"
                            onClick={() => generateCode(project.prompt, project.model)}
                          >
                            <RefreshCw className="w-3 h-3 mr-2" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {canEdit ? (
                <div className="safe-area-inset-bottom border-t border-zinc-800/50 bg-zinc-950/40 p-3 sm:p-4 backdrop-blur-sm">
                  <AnimatedAIInput
                    mode="chat"
                    compact
                    isLoading={isGenerating}
                    placeholder="Ask for changes or describe what to build..."
                    onSubmit={(value, model) => handleSendMessage(value, model)}
                    visualEditToggle={{
                      active: visualEditActive,
                      onToggle: () => setVisualEditActive((v) => !v),
                    }}
                  />
                </div>
                ) : (
                <div className="p-3 sm:p-4 border-t border-zinc-800/50 bg-zinc-950/40 flex-shrink-0">
                  <p className="text-xs text-zinc-500 text-center">View only — sign in as owner or editor to make changes.</p>
                </div>
                )}
              </div>
            ) : (
              <div className="h-full min-h-0 bg-zinc-900 relative rounded-b-lg overflow-hidden flex flex-col">
                {requiredEnvVars.length > 0 && !envVarsBannerDismissed && (
                  <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs">
                    <span>This app may need API keys or env vars. Add them in Integrations → Vars.</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                        onClick={() => { setIntegrationsOpen(true); setSelectedIntegration("vars") }}
                      >
                        <Key className="w-3 h-3 mr-1" /> Add vars
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEnvVarsBannerDismissed(true)}
                        className="p-1 rounded hover:bg-amber-500/20 text-amber-200/70"
                        aria-label="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {buildError && canEdit && (
                    <div className="flex-shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 bg-red-950/60 border-b border-red-800/50 text-red-200/90 text-sm">
                      <span className="truncate flex-1 min-w-0" title={buildError}>
                        {buildError.length > 80 ? buildError.slice(0, 80) + "…" : buildError}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0 h-8 px-3 text-xs bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30 font-medium"
                        onClick={handleFixWithAI}
                        disabled={isFixing || isGenerating}
                      >
                        {isFixing || isGenerating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {isFixing ? "Applying AI fix…" : "Fix this error with AI"}
                      </Button>
                    </div>
                  )}
                  {project.sandboxUrl ? (
                    <div className="relative flex flex-col flex-1 min-h-0">
                      <BrowserNavigator
                        currentPath={previewPath}
                        onNavigate={handlePreviewNavigate}
                        onRefresh={handlePreviewReload}
                        isLoading={isSandboxLoading || isGenerating}
                        selectedDevice={previewDevice}
                        onDeviceChange={setPreviewDevice}
                        className="flex-shrink-0"
                      />
                      {(previewRefreshHint || canEdit) && (
                        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/50 border-b border-zinc-800/50 text-zinc-400 text-xs">
                          {previewRefreshHint ? <span>{previewRefreshHint}</span> : <span>Not loading? Restart preview below.</span>}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                              onClick={handlePreviewReload}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                            </Button>
                            {canEdit && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                                onClick={handleRestartPreview}
                                disabled={isSandboxLoading}
                              >
                                Restart preview
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      <ResponsivePreview
                        src={getPreviewUrl() || project.sandboxUrl}
                        canEdit={canEdit}
                        enabled={visualEditActive}
                        onSaveManualEdit={handleManualVisualSave}
                        isSavingManualEdit={isGenerating}
                        onIframeNavigate={handlePreviewNavigate}
                        selectedDevice={previewDevice}
                        onDeviceChange={setPreviewDevice}
                        onEditWithAI={(description, userRequest) => {
                          setMobileTab("chat")
                          const prompt = userRequest
                            ? `Edit the selected element in the preview: ${description}. User request: ${userRequest}`
                            : `Edit the selected element in the preview: ${description}. Make a small improvement.`
                          handleSendMessage(prompt)
                        }}
                        className="w-full flex-1 min-h-0"
                        iframeKey={previewKey}
                      />
                      {hasSuccessfulPreview && (
                        <div className="flex-shrink-0 border-t border-zinc-800/50 bg-zinc-950/60 px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-zinc-400">
                            Last build: success
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsTimelineCollapsed((v) => !v)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
                          >
                            {isTimelineCollapsed ? "Show details" : "Hide details"}
                          </button>
                        </div>
                      )}
                      {hasSuccessfulPreview && !isTimelineCollapsed && !isSandboxLoading && !buildError && (
                        <BuildTimeline
                          steps={buildSteps}
                          error={buildError}
                          logs={buildLogs}
                          logsTail={logsTail}
                          timer={buildTimer}
                          failureCategory={buildFailureCategory}
                          failureReason={buildFailureReason}
                          onRetry={canEdit ? () => project.files && createSandbox(project.files) : undefined}
                          onFixWithAI={canEdit ? handleFixWithAI : undefined}
                          isFixing={isFixing}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="relative flex-1 min-h-0">
                      {(isSandboxLoading || isGenerating || buildError) ? (
                        <div className="h-full bg-zinc-950 flex items-center justify-center">
                          <BuildTimeline
                            steps={buildSteps}
                            error={buildError}
                            logs={buildLogs}
                            logsTail={logsTail}
                            timer={buildTimer}
                            failureCategory={buildFailureCategory}
                            failureReason={buildFailureReason}
                            onRetry={canEdit ? () => project.files && createSandbox(project.files) : undefined}
                            onFixWithAI={canEdit ? handleFixWithAI : undefined}
                            isFixing={isFixing}
                          />
                        </div>
                      ) : (
                        <div className="h-full bg-zinc-950 flex items-center justify-center p-4 sm:p-6 overflow-auto">
                          <div className="w-full max-w-lg rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm p-4 sm:p-6 shadow-xl">
                            <div className="flex items-start gap-3 sm:gap-4">
                              <div className="w-10 h-10 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                <Eye className="w-5 h-5 text-zinc-300" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-zinc-100">Preview not running yet</div>
                                <div className="text-xs text-zinc-500 mt-1">
                                  Generate your project to start a live preview. When the build completes, it will appear here automatically.
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                              <div className="flex-1 min-w-0 rounded-lg border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 text-xs text-zinc-400 font-medium truncate">
                                {project.files?.length ? `${project.files.length} files ready` : "No files generated yet"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Desktop layout: only in DOM on lg+ so mobile never sees duplicate content. */}
        {isLg && (
        <ResizablePanelGroup direction="horizontal" className="h-full flex-1 min-h-0 w-full min-w-0">
          {/* Chat Panel - modern glass */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full flex flex-col border-r border-zinc-800/50 bg-gradient-to-b from-zinc-900/45 to-zinc-950/35 backdrop-blur-sm">
              <div className="border-b border-zinc-800/70 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">Agent Session</span>
                  </div>
                  <span className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2 py-1 text-[10px] text-zinc-400">
                    Live timeline
                  </span>
                </div>
              </div>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 chat-scrollbar">
                {/* Initial prompt */}
                <ChatMessage
                  message={{ role: "user", content: project.prompt }}
                  isLast={false}
                  onEdit={canEdit ? () => setEditingTarget({ kind: "prompt" }) : undefined}
                  isEditing={editingTarget?.kind === "prompt"}
                  onEditSubmit={handleEditSubmit}
                  onCancelEdit={handleCancelEdit}
                  projectFiles={project?.files}
                  setSelectedFile={setSelectedFile}
                  setActiveTab={setActiveTab}
                />

                {/* Messages history */}
                {project.messages?.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={msg}
                    isLast={i === project.messages!.length - 1}
                    onEdit={canEdit && msg.role === "user" ? () => setEditingTarget({ kind: "message", index: i }) : undefined}
                    isEditing={editingTarget?.kind === "message" && editingTarget.index === i}
                    onEditSubmit={handleEditSubmit}
                    onCancelEdit={handleCancelEdit}
                    projectFiles={project?.files}
                    setSelectedFile={setSelectedFile}
                    setActiveTab={setActiveTab}
                  />
                ))}

                {/* Thinking bar + reasoning (agent-like) */}
                {isGenerating && (
                  <div className="space-y-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-4">
                    <TextShimmer className="text-sm">
                      {agentStatus || "Working on your update"}
                    </TextShimmer>
                    <Steps defaultOpen>
                      <StepsTrigger>Agent run: Update your project</StepsTrigger>
                      <StepsContent>
                        <div className="space-y-1.5">
                          {runSteps.map((step, i) => (
                            <StepsItem
                              key={`${step}-${i}`}
                              className={i === runSteps.length - 1 ? "text-zinc-200" : undefined}
                            >
                              {step}
                            </StepsItem>
                          ))}
                        </div>
                      </StepsContent>
                    </Steps>
                    <Reasoning isStreaming={true}>
                      <ReasoningTrigger>Show reasoning</ReasoningTrigger>
                      <ReasoningContent className="ml-2 border-l-2 border-l-zinc-700 px-2 pb-1 text-zinc-400">
                        {reasoningText}
                      </ReasoningContent>
                    </Reasoning>
                    <Tool
                      className="w-full"
                      toolPart={{
                        type: "code_generation",
                        state: "processing",
                        input: { task: agentStatus || "Applying requested updates", steps: runSteps.length },
                      }}
                    />
                  </div>
                )}

                {project.status === "error" && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-red-900/50 flex items-center justify-center text-red-400 shrink-0">
                      !
                    </div>
                    <div className="flex-1">
                      <div className="bg-red-900/20 rounded-2xl rounded-tl-sm px-4 py-3 border border-red-800/30">
                        <p className="text-red-400 text-sm">Error: {project.error || "Generation failed"}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 border-red-800/50 text-red-400 hover:bg-red-900/20 bg-transparent"
                          onClick={() => generateCode(project.prompt, project.model)}
                        >
                          <RefreshCw className="w-3 h-3 mr-2" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input - only when user can edit */}
              {canEdit ? (
              <div className="p-3 border-t border-zinc-800/50 bg-zinc-950/30 backdrop-blur-sm flex-shrink-0">
                <AnimatedAIInput
                  mode="chat"
                  compact
                  isLoading={isGenerating}
                  placeholder="Ask for changes or describe what to build..."
                  onSubmit={(value, model) => handleSendMessage(value, model)}
                  visualEditToggle={{
                    active: visualEditActive,
                    onToggle: () => setVisualEditActive((v) => !v),
                  }}
                />
              </div>
              ) : (
              <div className="p-3 border-t border-zinc-800/50 bg-zinc-950/30 flex-shrink-0">
                <p className="text-xs text-zinc-500 text-center">View only — sign in as owner or editor to make changes.</p>
              </div>
              )}
            </div>
          </ResizablePanel>

<ResizableHandle className="w-1 bg-zinc-800/50 hover:bg-zinc-700 transition-colors hover:shadow-md" />

          {/* Preview/Code Panel */}
          <ResizablePanel defaultSize={70}>
            <div className="h-full flex flex-col">
              <div className="h-14 border-b border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-950/60 backdrop-blur-md flex items-center justify-between px-4 shadow-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1 rounded-xl bg-zinc-900/40 border border-zinc-800/50 p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setActiveTab("preview")}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200",
                        activeTab === "preview"
                          ? "bg-zinc-800 text-zinc-100 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      )}
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("code")}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200",
                        activeTab === "code"
                          ? "bg-zinc-800 text-zinc-100 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      )}
                    >
                      <Code2 className="w-4 h-4" />
                      Code
                      {displayFiles.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-zinc-700/50 rounded text-xs">
                          {displayFiles.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {activeTab === "preview" && <div className="hidden md:flex items-center gap-2 min-w-0" />}
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === "code" && selectedFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100 h-8 w-8 p-0 hover:bg-zinc-900"
                      onClick={copyCode}
                    >
                      {copied ? <Check className="w-4 h-4 text-zinc-300" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  )}
                  {activeTab === "preview" && project.sandboxUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100 h-8 w-8 p-0 hover:bg-zinc-900"
                      onClick={() => window.open(project.sandboxUrl, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "preview" ? (
                  <div className="h-full bg-gradient-to-b from-zinc-900 to-zinc-950 relative flex flex-col">
                    {requiredEnvVars.length > 0 && !envVarsBannerDismissed && (
                      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs">
                        <span>This app may need API keys or env vars. Add them in Integrations → Vars.</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                            onClick={() => { setIntegrationsOpen(true); setSelectedIntegration("vars") }}
                          >
                            <Key className="w-3 h-3 mr-1" /> Add vars
                          </Button>
                          <button
                            type="button"
                            onClick={() => setEnvVarsBannerDismissed(true)}
                            className="p-1 rounded hover:bg-amber-500/20 text-amber-200/70"
                            aria-label="Dismiss"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                      {buildError && canEdit && (
                        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 bg-red-950/60 border-b border-red-800/50 text-red-200/90 text-sm">
                          <span className="truncate flex-1 min-w-0" title={buildError}>
                            {buildError.length > 80 ? buildError.slice(0, 80) + "…" : buildError}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0 h-8 px-3 text-xs bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30 font-medium"
                            onClick={handleFixWithAI}
                            disabled={isFixing || isGenerating}
                          >
                            {isFixing || isGenerating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {isFixing ? "Applying AI fix…" : "Fix this error with AI"}
                          </Button>
                        </div>
                      )}
                      {project.sandboxUrl ? (
                        <div className="relative flex flex-col flex-1 min-h-0">
                          <BrowserNavigator
                            currentPath={previewPath}
                            onNavigate={handlePreviewNavigate}
                            onRefresh={handlePreviewReload}
                            isLoading={isSandboxLoading || isGenerating}
                            selectedDevice={previewDevice}
                            onDeviceChange={setPreviewDevice}
                            className="flex-shrink-0"
                          />
                          {(previewRefreshHint || canEdit) && (
                            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/50 border-b border-zinc-800/50 text-zinc-400 text-xs">
                              {previewRefreshHint ? <span>{previewRefreshHint}</span> : <span>Seeing &quot;Closed Port&quot; or connection refused? Click Refresh or restart preview below.</span>}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-[11px] border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                                  onClick={handlePreviewReload}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                                </Button>
                                {canEdit && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-[11px] border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                                    onClick={handleRestartPreview}
                                    disabled={isSandboxLoading}
                                  >
                                    Restart preview
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          <ResponsivePreview
                            src={getPreviewUrl() || project.sandboxUrl}
                            canEdit={canEdit}
                            enabled={visualEditActive}
                            onSaveManualEdit={handleManualVisualSave}
                            isSavingManualEdit={isGenerating}
                            onIframeNavigate={handlePreviewNavigate}
                            selectedDevice={previewDevice}
                            onDeviceChange={setPreviewDevice}
                            onEditWithAI={(description, userRequest) => {
                              const prompt = userRequest
                                ? `Edit the selected element in the preview: ${description}. User request: ${userRequest}`
                                : `Edit the selected element in the preview: ${description}. Make a small improvement.`
                              handleSendMessage(prompt)
                            }}
                            className="w-full flex-1 min-h-0"
                            iframeKey={previewKey}
                          />
                          {hasSuccessfulPreview && (
                            <div className="flex-shrink-0 border-t border-zinc-800/50 bg-zinc-950/60 px-3 py-2 flex items-center justify-between">
                              <span className="text-xs text-zinc-400">
                                Last build: success
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsTimelineCollapsed((v) => !v)}
                                className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
                              >
                                {isTimelineCollapsed ? "Show details" : "Hide details"}
                              </button>
                            </div>
                          )}
                          {hasSuccessfulPreview && !isTimelineCollapsed && !isSandboxLoading && !buildError && !allBuildSuccess && (
                            <BuildTimeline
                              steps={buildSteps}
                              error={buildError}
                              logs={buildLogs}
                              logsTail={logsTail}
                              timer={buildTimer}
                              failureCategory={buildFailureCategory}
                              failureReason={buildFailureReason}
                              onRetry={canEdit ? () => project.files && createSandbox(project.files) : undefined}
                              onFixWithAI={canEdit ? handleFixWithAI : undefined}
                              isFixing={isFixing}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="relative flex-1 min-h-0">
                          {(isSandboxLoading || isGenerating || buildError) ? (
                            <div className="h-full bg-zinc-950 flex items-center justify-center">
                              <BuildTimeline
                                steps={buildSteps}
                                error={buildError}
                                logs={buildLogs}
                                logsTail={logsTail}
                                timer={buildTimer}
                                failureCategory={buildFailureCategory}
                                failureReason={buildFailureReason}
                                onRetry={canEdit ? () => project.files && createSandbox(project.files) : undefined}
                                onFixWithAI={canEdit ? handleFixWithAI : undefined}
                                isFixing={isFixing}
                              />
                            </div>
                          ) : (
                            <div className="h-full bg-gradient-to-b from-zinc-950 to-zinc-900 flex items-center justify-center p-6">
                              <div className="w-full max-w-lg rounded-2xl border border-zinc-800/50 bg-zinc-900/60 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center shadow-sm">
                                    <Eye className="w-5 h-5 text-zinc-300" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-100">Preview not running yet</div>
                                    <div className="text-xs text-zinc-500 mt-1">
                                      Generate your project to start a live preview. When the build completes, it will appear here automatically.
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 flex items-center gap-2">
                                  <div className="flex-1 rounded-lg border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm px-3 py-2 text-xs text-zinc-400 font-medium">
                                    {project.files?.length ? `${project.files.length} files ready` : "No files generated yet"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <CodePanel
                    files={displayFiles}
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                    isGenerating={isGenerating}
                  />
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

export default function ProjectPage() {
  return (
    <ProjectErrorBoundary>
      <ProjectContent />
    </ProjectErrorBoundary>
  )
}
