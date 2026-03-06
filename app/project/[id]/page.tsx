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
import { Steps, StepsContent, StepsItem, StepsTrigger } from "@/components/prompt-kit/steps"
import { Tool } from "@/components/prompt-kit/tool"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { BuildTimeline, type TimelineStep } from "@/components/preview/build-timeline"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
import { WebsiteSettingsPanel } from "@/components/project/website-settings-panel"

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
  const [ensuredPreviewUrl, setEnsuredPreviewUrl] = useState<string | null>(null)
  const [isPreparingPreview, setIsPreparingPreview] = useState(false)
  const [previewEnsureFailures, setPreviewEnsureFailures] = useState(0)
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
  const [fixingMessage, setFixingMessage] = useState<string | null>(null)
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false)
  const [previewRefreshHint, setPreviewRefreshHint] = useState<string | null>(null)
  const [editingTarget, setEditingTarget] = useState<{ kind: "prompt" } | { kind: "message"; index: number } | null>(null)
  const [editingDraft, setEditingDraft] = useState("")
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat")
  const [visualEditActive, setVisualEditActive] = useState(false)
  const [editingContextLabel, setEditingContextLabel] = useState<string | null>(null)
  const [deployOpen, setDeployOpen] = useState(false)
  const [websiteSettingsOpen, setWebsiteSettingsOpen] = useState(false)
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
  const toFriendlyDeployError = useCallback((value: unknown) => {
    const msg = String(value || "Publish failed").trim()
    if (/CommandExitError|exit\s+status\s+1/i.test(msg)) {
      return "Publishing couldn\u2019t complete because the website build failed. Please review your project content and try again."
    }
    return msg.replace(/^error:\s*/i, "")
  }, [])
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [supabaseOauthLoading, setSupabaseOauthLoading] = useState(false)
  const [supabaseProjectsLoading, setSupabaseProjectsLoading] = useState(false)
  const [supabaseProjectsError, setSupabaseProjectsError] = useState("")
  const [supabaseCreatingProject, setSupabaseCreatingProject] = useState(false)
  const [supabaseProjects, setSupabaseProjects] = useState<Array<{ id: string; name: string; ref: string; region: string; organizationId?: string }>>([])
  const [supabaseOrganizations, setSupabaseOrganizations] = useState<Array<{ id: string; name?: string; slug?: string }>>([])
  const [selectedSupabaseRef, setSelectedSupabaseRef] = useState("")
  const [newSupabaseName, setNewSupabaseName] = useState("")
  const [newSupabaseRegion, setNewSupabaseRegion] = useState("us-east-1")
  const [newSupabaseDbPassword, setNewSupabaseDbPassword] = useState("")
  const [supabaseCreateOpen, setSupabaseCreateOpen] = useState(false)
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
  const SUPABASE_REGIONS = [
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-west-1", label: "US West (N. California)" },
    { value: "eu-west-1", label: "West Europe (London)" },
    { value: "eu-central-1", label: "EU Central (Frankfurt)" },
    { value: "ap-southeast-1", label: "Southeast Asia (Singapore)" },
    { value: "ap-northeast-1", label: "Northeast Asia (Tokyo)" },
    { value: "ap-south-1", label: "South Asia (Mumbai)" },
    { value: "sa-east-1", label: "South America (Sao Paulo)" },
  ] as const
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
    project?.status === "complete" && !!ensuredPreviewUrl && !buildError

  // When preview is ready (all build steps success), hide the overlay so users see the preview
  const allBuildSuccess =
    buildSteps.length > 0 && buildSteps.every((s) => s.status === "success")

  // When preview becomes ready (all steps success), collapse timeline so the overlay doesn't block the preview
  useEffect(() => {
    if (ensuredPreviewUrl && allBuildSuccess) {
      setIsTimelineCollapsed(true)
    }
  }, [ensuredPreviewUrl, allBuildSuccess])

  const runSteps = reasoningSteps.length > 0
    ? reasoningSteps
    : [
        "Analyzing your request and understanding scope.",
        "Planning updates across relevant components.",
        "Applying changes and validating output.",
        "Finalizing and preparing preview.",
      ]
  const activeToolPart = currentGeneratingFile
    ? {
        type: "write_file",
        state: isGenerating ? "input-available" : "output-available",
        input: {
          file: currentGeneratingFile,
          intent: "Applying content and UI updates",
        },
      }
    : {
        type: "reasoning",
        state: isGenerating ? "input-streaming" : "output-available",
        input: {
          status: agentStatus || "Making updates",
        },
      }


  const getAuthHeader = useCallback(async () => {
    if (!user) throw new Error("Not authenticated")
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }, [user])

  const ensurePreviewEnvironment = useCallback(async (force = false) => {
    if (!projectId || !user) return null
    try {
      setIsPreparingPreview(true)
      const authHeader = await getAuthHeader()
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ensure-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ force }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.previewUrl) {
        throw new Error(json?.error || "Failed to prepare preview")
      }
      setEnsuredPreviewUrl(String(json.previewUrl))
      setPreviewEnsureFailures(0)
      return String(json.previewUrl)
    } catch (e) {
      setPreviewEnsureFailures((prev) => prev + 1)
      throw e
    } finally {
      setIsPreparingPreview(false)
    }
  }, [getAuthHeader, projectId, user])

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
    refreshSupabaseProjects()
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

  const refreshSupabaseProjects = useCallback(async () => {
    try {
      setSupabaseProjectsLoading(true)
      setSupabaseProjectsError("")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/supabase/projects", { headers: authHeader })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSupabaseProjects([])
        setSupabaseOrganizations([])
        setSelectedSupabaseRef("")
        const errorMessage = (json?.error ?? "").toString()
        const isNotConnected =
          res.status === 404 &&
          errorMessage.toLowerCase().includes("supabase is not connected")
        if (json?.error && !isNotConnected) {
          console.error("Supabase projects fetch failed:", json.error)
        }
        return
      }
      if (json?.connected === false) {
        setSupabaseProjects([])
        setSupabaseOrganizations([])
        setSelectedSupabaseRef("")
        setSupabaseProjectsError((json?.error ?? "Supabase is not connected for this account.").toString())
        return
      }
      const projects = Array.isArray(json?.projects) ? json.projects : []
      const organizations = Array.isArray(json?.organizations) ? json.organizations : []
      setSupabaseProjects(projects)
      setSupabaseOrganizations(organizations)
      if (!selectedSupabaseRef && projects[0]?.ref) {
        setSelectedSupabaseRef(projects[0].ref)
      }
    } catch {
      setSupabaseProjects([])
      setSupabaseOrganizations([])
      setSupabaseProjectsError("Failed to load Supabase organizations/projects. Try reconnecting Supabase.")
    } finally {
      setSupabaseProjectsLoading(false)
    }
  }, [getAuthHeader, selectedSupabaseRef])

  const handleStartSupabaseOauth = useCallback(async () => {
    if (!projectId) return
    try {
      setSupabaseOauthLoading(true)
      const authHeader = await getAuthHeader()
      const res = await fetch(`/api/integrations/supabase/authorize?builderProjectId=${encodeURIComponent(projectId)}`, {
        headers: authHeader,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) throw new Error(json?.error || "Failed to start Supabase OAuth")
      window.open(json.url, "supabase-oauth", "width=560,height=760,menubar=no,toolbar=no")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to connect Supabase")
    } finally {
      setSupabaseOauthLoading(false)
    }
  }, [getAuthHeader, projectId])

  const handleCreateSupabaseProject = useCallback(async () => {
    if (!newSupabaseName.trim() || !newSupabaseRegion.trim() || !newSupabaseDbPassword.trim()) {
      alert("Enter project name, region, and DB password.")
      return
    }
    try {
      setSupabaseCreatingProject(true)
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/integrations/supabase/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          name: newSupabaseName.trim(),
          region: newSupabaseRegion.trim(),
          dbPassword: newSupabaseDbPassword.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to create Supabase project")
      await refreshSupabaseProjects()
      const createdRef = (json?.project?.id ?? "").toString()
      if (createdRef) setSelectedSupabaseRef(createdRef)
      setNewSupabaseDbPassword("")
      setSupabaseCreateOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create project")
    } finally {
      setSupabaseCreatingProject(false)
    }
  }, [getAuthHeader, newSupabaseDbPassword, newSupabaseName, newSupabaseRegion, refreshSupabaseProjects])

  const handleLinkSupabaseProject = useCallback(async () => {
    if (!projectId || !selectedSupabaseRef) return
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/integrations/supabase/link-project", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ builderProjectId: projectId, supabaseProjectRef: selectedSupabaseRef }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to link Supabase project")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to link project")
    }
  }, [getAuthHeader, projectId, selectedSupabaseRef])

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; ok?: boolean; message?: string }
      if (data?.type !== "supabase-oauth") return
      if (!data.ok) {
        alert(data.message || "Supabase OAuth failed")
        return
      }
      refreshSupabaseProjects()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [refreshSupabaseProjects])

  useEffect(() => {
    if (supabaseCreateOpen && supabaseOrganizations.length === 0) {
      refreshSupabaseProjects()
    }
  }, [refreshSupabaseProjects, supabaseCreateOpen, supabaseOrganizations.length])

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
            const nextLine = String(payload.message || "")
            if (/CommandExitError|exit\s+status\s+1/i.test(nextLine)) continue
            setDeployLogs((prev) => {
              const next = [...prev, nextLine]
              return next.length > 500 ? next.slice(next.length - 500) : next
            })
          }

          if (payload.type === "error") {
            setDeployError(toFriendlyDeployError(payload.error))
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
      setDeployError(toFriendlyDeployError(err?.message || "Publish failed"))
    } finally {
      setIsDeploying(false)
      refreshNetlifyStatus()
    }
  }, [deployLinks?.siteId, getAuthHeader, netlifySiteName, project?.name, projectId, refreshNetlifyStatus, toFriendlyDeployError])

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
            const nextLine = String(payload.message || "")
            if (/CommandExitError|exit\s+status\s+1/i.test(nextLine)) continue
            setVercelDeployLogs((prev) => {
              const next = [...prev, nextLine]
              return next.length > 500 ? next.slice(next.length - 500) : next
            })
          }

          if (payload.type === "error") {
            setVercelDeployError(toFriendlyDeployError(payload.error))
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
      setVercelDeployError(toFriendlyDeployError(err?.message || "Publish failed"))
    } finally {
      setIsVercelDeploying(false)
      refreshVercelStatus()
    }
  }, [getAuthHeader, projectId, refreshVercelStatus, toFriendlyDeployError])

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
    if (!project) return
    const p = project as any
    if (!deployLinks && (p?.netlifySiteUrl || p?.netlifyDeployUrl || p?.netlifyAdminUrl || p?.netlifySiteId || p?.netlifyDeployId)) {
      setDeployLinks({
        siteUrl: p?.netlifySiteUrl || null,
        deployUrl: p?.netlifyDeployUrl || null,
        adminUrl: p?.netlifyAdminUrl || null,
        siteId: p?.netlifySiteId || null,
        deployId: p?.netlifyDeployId || null,
      })
    }
    if (!vercelDeployLinks && (p?.vercelDeployUrl || p?.vercelDeploymentId)) {
      setVercelDeployLinks({
        siteUrl: p?.vercelDeployUrl || null,
        deployUrl: p?.vercelDeployUrl || null,
        adminUrl: p?.vercelDeploymentId ? `https://vercel.com/dashboard/deployments/${p.vercelDeploymentId}` : null,
        deploymentId: p?.vercelDeploymentId || null,
      })
    }
  }, [project, deployLinks, vercelDeployLinks])

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
    setEditingDraft("")
    
    // Regenerate with new prompt
    const fullPrompt = newContent
    await generateCode(fullPrompt, project.model)
  }

  const handleCancelEdit = () => {
    setEditingTarget(null)
    setEditingDraft("")
  }

  const getPreviewUrl = useCallback(() => {
    if (!ensuredPreviewUrl) return null
    const base = ensuredPreviewUrl.replace(/\/$/, "")
    // Validate previewPath to prevent XSS (only allow safe URL path characters)
    const safePath = /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(previewPath) && previewPath.startsWith("/")
      ? previewPath
      : "/"
    const url = `${base}${safePath}`
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}__reload=${previewReloadNonce}`
  }, [ensuredPreviewUrl, previewPath, previewReloadNonce])

  const handlePreviewNavigate = useCallback((nextPath: string) => {
    const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`
    setPreviewPath(normalized)
  }, [])

  const handlePreviewReload = useCallback(async () => {
    try {
      await ensurePreviewEnvironment(true)
      setPreviewReloadNonce(Date.now())
      setPreviewKey((k) => k + 1)
    } catch {
      // friendly loading/error handling is shown in preview panel
    }
  }, [ensurePreviewEnvironment])

  // Update build steps when preview URL is ready
  useEffect(() => {
    if (ensuredPreviewUrl && project?.status === "complete") {
      setBuildSteps([
        { key: "write", label: "Writing files", status: "success", startedAt: Date.now() - 3000, finishedAt: Date.now() - 2500 },
        { key: "install", label: "Installing dependencies", status: "success", startedAt: Date.now() - 2500, finishedAt: Date.now() - 1500 },
        { key: "dev", label: "Starting dev server", status: "success", startedAt: Date.now() - 1500, finishedAt: Date.now() - 500 },
      ])
      setIsSandboxLoading(false)
      setBuildError(null)
    }
  }, [ensuredPreviewUrl, project?.status])

  // Auto-retry iframe load at 5s and 15s when preview URL is set (tunnel/server may not be ready on first load)
  const previewRetryCountRef = useRef<number>(0)
  useEffect(() => {
    if (!ensuredPreviewUrl) {
      previewRetryCountRef.current = 0
      return
    }
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
  }, [ensuredPreviewUrl])

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
      // Do not trim blindly: trimming can break unified diff hunk line counts.
      const rawContent = block.content
      let content = rawContent
      // Strip markdown code fences if the model wrapped output in ```diff ... ```
      if (content.includes("```")) {
        content = content
          .replace(/^```(?:diff|patch)?\s*/i, "")
          .replace(/\s*```$/, "")
      }
      // Detect unified diff: full format (--- a/...) or hunk-only (contains @@ and -/+ lines) that got pasted by mistake
      const normalizedStart = content.trimStart()
      const hasDiffHeader = normalizedStart.startsWith("--- a/") || normalizedStart.startsWith("--- a\\")
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
        try {
          const patched = applyPatch(oldContent, content)
          if (typeof patched === "string") {
            if (existingIndex !== -1) {
              result[existingIndex] = { ...result[existingIndex], content: patched }
            } else {
              result.push({ path, content: patched })
            }
          }
        } catch (err) {
          // Malformed/partial diff from model: keep existing file unchanged.
          console.warn("Patch apply failed for file:", path, err)
        }
        // If applyPatch returns false, patch failed; leave existing file unchanged or skip new
      } else {
        // Reject content that looks like raw diff cruft (e.g. @@ or -line at start) so we never write it as source
        const looksLikeRawDiff = /^\s*@@/m.test(content) || (/^\s*-\s*[^\s]/.test(content) && content.includes("@@"))
        if (looksLikeRawDiff) {
          // Don't overwrite with diff text; keep existing file
          continue
        }
        const fileContent = content.trim()
        const existingIndex = result.findIndex(f => f.path === path)
        if (existingIndex !== -1) {
          result[existingIndex] = { ...result[existingIndex], content: fileContent }
        } else {
          result.push({ path, content: fileContent })
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
          setIsTimelineCollapsed(false)
          setBuildError(errMsg)
          setBuildFailureCategory(data.failureCategory ?? "unknown")
          setBuildFailureReason(data.failureReason ?? null)
          setBuildLogs((prev) => ({ ...prev, ...(data.logs || {}) }))
          updateDoc(projectRef, {
            lastPreviewError: {
              message: errMsg,
              failureCategory: data.failureCategory ?? "unknown",
              failureReason: data.failureReason ?? null,
              logs: data.logs || null,
              createdAt: serverTimestamp(),
            },
          }).catch(() => {})
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
          
          // Update Firestore
          updateDoc(projectRef, { sandboxUrl: url }).catch(console.error)
          
          setProject((prev) => (prev ? { ...prev, sandboxUrl: url } : prev))
          setEnsuredPreviewUrl(url)
          
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
          setIsTimelineCollapsed(true)
          setBuildError(null)
          updateDoc(projectRef, { lastPreviewError: deleteField() }).catch(() => {})
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
      setIsTimelineCollapsed(false)
      updateDoc(projectRef, {
        lastPreviewError: {
          message: error instanceof Error ? error.message : "Failed to create preview",
          failureCategory: "unknown",
          failureReason: "Sandbox error",
          logs: null,
          createdAt: serverTimestamp(),
        },
      }).catch(() => {})
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
      setFixingMessage("Analyzing and repairing...")
      const authHeader = await getAuthHeader()
      const res = await fetch("/api/error/fix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          projectId,
          error: buildError,
          failureCategory: buildFailureCategory,
          failureReason: buildFailureReason,
          logsTail: logsTail?.slice(-12000) || [buildLogs?.install, buildLogs?.dev].filter(Boolean).join("\n\n").slice(-12000),
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Automatic repair could not complete.")
      }

      setFixingMessage("Applying repair and restarting preview...")
      if (Array.isArray(json?.files) && json.files.length > 0) {
        await createSandbox(json.files, { forceNewSandbox: true })
      } else if (project.files?.length) {
        await createSandbox(project.files, { forceNewSandbox: true })
      }
      setBuildError(null)
      setBuildFailureReason(null)
      setBuildFailureCategory(undefined)
      toast({
        title: "Fix applied",
        description: String(json?.explanation || "The issue was repaired and your preview is restarting."),
      })
    } finally {
      setFixingMessage(null)
      setIsFixing(false)
    }
  }, [project, canEdit, isFixing, isGenerating, buildError, buildFailureReason, buildFailureCategory, logsTail, buildLogs, getAuthHeader, projectId, createSandbox, toast])

  // Clear module-level preview key when switching projects so the new project can auto-preview
  useEffect(() => {
    lastAutoPreviewKey = null
    setEnsuredPreviewUrl(null)
    setPreviewEnsureFailures(0)
  }, [projectId])

  // Ensure preview runtime exists and recover silently if expired/missing
  useEffect(() => {
    if (!project) return
    if (!project.files || project.files.length === 0) return
    if (project.status !== "complete") return
    if (isSandboxLoading || isGenerating || isPreparingPreview) return
    if (ensuredPreviewUrl) return

    const signature = `${project.id}:${project.files.length}:${project.files[0]?.path || ""}:${project.files[project.files.length - 1]?.path || ""}`
    const key = `${projectId}:${signature}`
    if (lastAutoPreviewKey === key) return
    lastAutoPreviewKey = key
    lastAutoPreviewSignatureRef.current = signature

    ensurePreviewEnvironment(false).catch(() => {
      // only surface after repeated failures
    })
  }, [project, projectId, isSandboxLoading, isGenerating, isPreparingPreview, ensuredPreviewUrl, ensurePreviewEnvironment])

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

  const describeEditingContext = useCallback((raw: string | null | undefined) => {
    if (!raw) return null
    const base = raw.replace(/selected element/i, "").trim() || raw.trim()
    const cleaned = base.replace(/^["']|["']$/g, "")
    const short = cleaned.split(".")[0]?.trim() || cleaned
    return short ? `Editing ${short}` : null
  }, [])

  const quickActionChips = [
    "Improve headline",
    "Add pricing section",
    "Make it more premium",
    "Add testimonials",
    "Optimise for mobile",
  ]

  const contextualChips = editingContextLabel
    ? quickActionChips.map((chip) => `${chip} in this section`)
    : quickActionChips

  // Combine project files with generating files
  const displayFiles = isGenerating ? generatingFiles : (project?.files || [])
  const resolvedPreviewUrl = getPreviewUrl()
  
  // Prefer explicit project name; fall back to prompt-derived title
  const displayProjectName = project?.name || project?.prompt?.split(' ').slice(0, 3).join(' ') || 'Untitled Project'

  // Calculate tokens limit (never negative remaining)
  const remainingDisplay = userData ? Math.max(0, userData.tokenUsage.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingDisplay : 0

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border border-zinc-200 bg-white flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
          <TextShimmer className="text-sm">{authLoading ? "Loading…" : "Loading project..."}</TextShimmer>
        </div>
      </div>
    )
  }

  if (accessError === "private") {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center p-4">
        <div className="text-center max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="w-12 h-12 rounded-full border border-zinc-200 bg-zinc-100 flex items-center justify-center mx-auto mb-4">
            <Share className="w-6 h-6 text-zinc-600" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">This project is private</h1>
          <p className="text-zinc-500 text-sm mb-6">Sign in to request access or open your own project.</p>
          <Link href={`/login?redirect=${encodeURIComponent(`/project/${projectId}`)}`}>
            <Button className="bg-zinc-900 text-white hover:bg-black border-0">Sign in</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (accessError === "forbidden") {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center p-4">
        <div className="text-center max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">You don&apos;t have access</h1>
          <p className="text-zinc-500 text-sm mb-6">This project is private and you aren&apos;t an owner or editor.</p>
          <Link href="/">
            <Button variant="outline" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100">Back home</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Project not found</h1>
          <p className="text-zinc-500 mb-6">This project doesn&apos;t exist or has been deleted.</p>
          <Link href="/">
            <Button variant="outline" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 bg-transparent">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1f1f1f]">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col px-3 py-3 sm:px-5 sm:py-4 lg:h-screen lg:px-6">
        <header className="mb-3 flex flex-col gap-3 border-b border-zinc-200 bg-[#f5f5f2] px-1 pb-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-4 lg:h-14 lg:flex-row lg:items-center lg:pb-0">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/projects" className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-zinc-800">
              Studio
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold text-[#1f1f1f] sm:text-lg lg:text-xl">{displayProjectName}</h1>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setWebsiteSettingsOpen(true)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Open website settings"
                  title="Website Settings"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100" onClick={() => setWebsiteSettingsOpen(true)}>
              Website Settings
            </Button>
            <Button type="button" size="sm" className="h-9 rounded-lg bg-[#1f1f1f] px-3 text-white hover:bg-black" onClick={() => setDeployOpen(true)}>
              Go Live
            </Button>
          </div>
        </header>

        <div className="mb-3 lg:hidden">
          <div className="inline-flex w-full rounded-2xl border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMobileTab("chat")}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                mobileTab === "chat" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              Talk to Builder
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                mobileTab === "preview" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              Website Preview
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-10 lg:gap-6">
          <section className={cn(
            "flex min-h-[52vh] flex-col overflow-hidden border border-zinc-200 bg-white lg:col-span-3 lg:min-h-0",
            mobileTab !== "chat" && "hidden lg:flex"
          )}>
            <div className="border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-sm font-semibold tracking-wide text-zinc-800">Conversation</p>
              <p className="mt-1 text-xs text-zinc-500">{editingContextLabel || "Editing entire website"}</p>
            </div>

            <div className="h-[32vh] min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:h-[38vh] sm:px-5 sm:py-5 lg:h-auto">
              <div className="group mr-auto max-w-[90%]">
                {editingTarget?.kind === "prompt" ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-zinc-900">
                    <textarea
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      className="w-full resize-none bg-transparent text-sm text-zinc-900 outline-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-zinc-900 text-white hover:bg-black"
                        onClick={() => handleEditSubmit(editingDraft)}
                        disabled={!editingDraft.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-relaxed text-zinc-800">
                      {project.prompt}
                      {canEdit && (
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(project.prompt || "")
                                toast({ title: "Copied", description: "Prompt copied to clipboard." })
                              } catch {
                                toast({ title: "Copy failed", description: "Could not copy prompt.", variant: "destructive" })
                              }
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white/90 text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900"
                            aria-label="Copy prompt"
                            title="Copy"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTarget({ kind: "prompt" })
                              setEditingDraft(project.prompt || "")
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white/90 text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900"
                            aria-label="Edit prompt"
                            title="Edit"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {project.messages?.map((msg, i) => (
                <div key={i} className={cn("group", msg.role === "user" ? "ml-auto max-w-[90%]" : "mr-auto max-w-[90%]")}>
                  {msg.role === "user" && editingTarget?.kind === "message" && editingTarget.index === i ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-zinc-900">
                      <textarea
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        className="w-full resize-none bg-transparent text-sm text-zinc-900 outline-none"
                        rows={3}
                        autoFocus
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 bg-zinc-900 text-white hover:bg-black"
                          onClick={() => handleEditSubmit(editingDraft)}
                          disabled={!editingDraft.trim()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative rounded-2xl px-4 py-3 text-sm leading-relaxed transition-colors",
                        msg.role === "user"
                          ? "bg-[#1f1f1f] text-white"
                          : "bg-zinc-100 text-zinc-800"
                      )}
                    >
                      {msg.content}
                      {msg.role === "user" && canEdit && (
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(msg.content || "")
                                toast({ title: "Copied", description: "Message copied to clipboard." })
                              } catch {
                                toast({ title: "Copy failed", description: "Could not copy message.", variant: "destructive" })
                              }
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                            aria-label="Copy message"
                            title="Copy"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTarget({ kind: "message", index: i })
                              setEditingDraft(msg.content)
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                            aria-label="Edit message"
                            title="Edit"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
                {isGenerating && (
                  <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
                    <TextShimmer className="text-sm text-zinc-700">{agentStatus || "Deep thinking and generating timeline updates"}</TextShimmer>

                    <Steps defaultOpen>
                      <StepsTrigger>Agent run: Update website timeline and content</StepsTrigger>
                      <StepsContent>
                        <div className="space-y-2">
                          {runSteps.map((step, idx) => {
                            const shouldShimmer = isGenerating && (idx === runSteps.length - 1 || /^(creating|updating|editing|writing)\b/i.test(step))
                            return (
                              <StepsItem key={`${step}-${idx}`} className={idx === runSteps.length - 1 ? "text-zinc-800" : undefined}>
                                {shouldShimmer ? <TextShimmer className="text-inherit">{step}</TextShimmer> : step}
                              </StepsItem>
                            )
                          })}
                        </div>
                      </StepsContent>
                    </Steps>

                    <Tool className="w-full" toolPart={activeToolPart} />
                  </div>
                )}
              <div ref={messagesEndRef} />
            </div>

            {canEdit ? (
              <div className="border-t border-zinc-100 p-2.5 sm:p-3">
                {remainingTokens <= 0 && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-sm font-medium text-amber-900">You’ve used all credits for this cycle.</p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Upgrade your plan to continue generating website updates.
                      {" "}
                      <Link href="/pricing" className="font-semibold underline underline-offset-2">
                        View plans
                      </Link>
                    </p>
                  </div>
                )}
                <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {contextualChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSendMessage(chip)}
                      disabled={!canEdit || isGenerating || remainingTokens <= 0}
                      className="whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <AnimatedAIInput
                  mode="chat"
                  compact
                  isLoading={isGenerating}
                  placeholder={editingContextLabel ? "Describe what to improve in this section..." : "Describe what to improve on your website..."}
                  onSubmit={(value, model) => handleSendMessage(value, model)}
                  disabled={remainingTokens <= 0}
                  visualEditToggle={{
                    active: visualEditActive,
                    onToggle: () => setVisualEditActive((v) => !v),
                  }}
                />
              </div>
            ) : (
              <div className="border-t border-zinc-100 p-3 text-center text-xs text-zinc-500">View only</div>
            )}
          </section>

          <section className={cn(
            "min-h-[56vh] overflow-hidden border border-zinc-200 bg-white lg:col-span-7 lg:min-h-0",
            mobileTab !== "preview" && "hidden lg:block"
          )}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-wide text-zinc-800">Live Website</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">Select a section in the preview to edit with context.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100 lg:hidden" onClick={() => setWebsiteSettingsOpen(true)}>
                    Website Settings
                  </Button>
                  <Button type="button" size="sm" className="h-9 rounded-lg bg-[#1f1f1f] px-3 text-white hover:bg-black lg:hidden" onClick={() => setDeployOpen(true)}>
                    Go Live
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100" onClick={handlePreviewReload}>
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {((isSandboxLoading || !!buildError) && !isTimelineCollapsed) && (
                  <BuildTimeline
                    className="p-4 sm:p-6"
                    steps={buildSteps}
                    error={buildError}
                    logs={buildLogs}
                    logsTail={logsTail}
                    timer={buildTimer}
                    failureCategory={buildFailureCategory}
                    failureReason={fixingMessage || buildFailureReason}
                    onFixWithAI={handleFixWithAI}
                    isFixing={isFixing}
                  />
                )}
                {resolvedPreviewUrl ? (
                  <ResponsivePreview
                    src={resolvedPreviewUrl}
                    canEdit={canEdit}
                    enabled={visualEditActive}
                    onSaveManualEdit={handleManualVisualSave}
                    isSavingManualEdit={isGenerating}
                    onIframeNavigate={handlePreviewNavigate}
                    selectedDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onEditWithAI={(description, userRequest) => {
                      setEditingContextLabel(describeEditingContext(description))
                      const prompt = userRequest
                        ? `Update this website section (${description}): ${userRequest}`
                        : `Improve this website section (${description}) with a premium, founder-focused tone.`
                      handleSendMessage(prompt)
                    }}
                    className="h-full w-full"
                    iframeKey={previewKey}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-5 text-center sm:px-8">
                    {(isPreparingPreview || (project?.status === "complete" && (project?.files?.length || 0) > 0 && previewEnsureFailures < 2)) ? (
                      <div className="flex flex-col items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                        <p className="mt-3 text-base font-medium text-zinc-800">Waking up your preview environment...</p>
                        <p className="mt-1 text-sm text-zinc-500">Preparing your live preview...</p>
                      </div>
                    ) : previewEnsureFailures >= 2 ? (
                      <div>
                        <p className="text-lg font-semibold text-zinc-800">Preview is temporarily unavailable</p>
                        <p className="mt-2 text-sm text-zinc-500">Please check your connection and try again.</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-lg font-semibold text-zinc-800">Your website preview will appear here</p>
                        <p className="mt-2 text-sm text-zinc-500">Ask for an update to generate your live website.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={tokenLimitModalOpen} onOpenChange={setTokenLimitModalOpen}>
        <DialogContent className="max-w-md border-zinc-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">You’re out of credits</DialogTitle>
            <DialogDescription className="text-zinc-600">
              This workspace has no credits left in the current cycle. Upgrade to continue generating website updates.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-zinc-300 text-zinc-700" onClick={() => setTokenLimitModalOpen(false)}>
              Close
            </Button>
            <Link href="/pricing">
              <Button type="button" className="bg-[#1f1f1f] text-white hover:bg-black" onClick={() => setTokenLimitModalOpen(false)}>
                Upgrade Plan
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="max-w-md border-zinc-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Go Live</DialogTitle>
            <DialogDescription className="text-zinc-600">Publish your website and share it with customers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Netlify</p>
              {deployLinks?.siteUrl ? (
                <a href={deployLinks.siteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:text-black">
                  {deployLinks.siteUrl}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Not published yet.</p>
              )}
              <Button
                type="button"
                className="mt-3 w-full bg-[#1f1f1f] text-white hover:bg-black"
                onClick={handleDeployToNetlify}
                disabled={isDeploying}
              >
                {isDeploying ? "Publishing..." : deployLinks?.siteUrl ? "Republish with Netlify" : "Publish with Netlify"}
              </Button>
              {(isDeploying || deployLogs.length > 0 || deployStep) && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Build Log</p>
                    {deployStep ? <p className="text-[11px] text-zinc-500">Step: {deployStep}</p> : null}
                  </div>
                  <div className="max-h-36 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px] leading-5 text-zinc-700">
                    {deployLogs.length === 0 ? (
                      <p className="text-zinc-500">Starting publish...</p>
                    ) : (
                      deployLogs.slice(-120).map((line, i) => (
                        <p key={`netlify-log-${i}`} className="whitespace-pre-wrap break-words">
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Vercel</p>
              {vercelDeployLinks?.siteUrl ? (
                <a href={vercelDeployLinks.siteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:text-black">
                  {vercelDeployLinks.siteUrl}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Not published yet.</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full border-zinc-300 text-zinc-700"
                onClick={handleDeployToVercel}
                disabled={isVercelDeploying}
              >
                {isVercelDeploying ? "Publishing..." : vercelDeployLinks?.siteUrl ? "Republish with Vercel" : "Publish with Vercel"}
              </Button>
              {(isVercelDeploying || vercelDeployLogs.length > 0 || vercelDeployStep) && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Build Log</p>
                    {vercelDeployStep ? <p className="text-[11px] text-zinc-500">Step: {vercelDeployStep}</p> : null}
                  </div>
                  <div className="max-h-36 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px] leading-5 text-zinc-700">
                    {vercelDeployLogs.length === 0 ? (
                      <p className="text-zinc-500">Starting publish...</p>
                    ) : (
                      vercelDeployLogs.slice(-120).map((line, i) => (
                        <p key={`vercel-log-${i}`} className="whitespace-pre-wrap break-words">
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {(deployError || vercelDeployError) && (
              <p className="text-xs text-red-600">{deployError || vercelDeployError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={websiteSettingsOpen} onOpenChange={setWebsiteSettingsOpen}>
        <SheetContent side="right" className="w-full max-w-[760px] overflow-y-auto border-l border-zinc-200 bg-[#f5f5f2] p-0 sm:max-w-[760px]">
          <SheetHeader className="border-b border-zinc-200 bg-white px-6 py-5">
            <SheetTitle className="text-zinc-900">Website Settings</SheetTitle>
            <SheetDescription className="text-zinc-500">Configure your website experience for this project.</SheetDescription>
          </SheetHeader>
          <div className="p-6">
              <WebsiteSettingsPanel
                projectId={projectId}
                initialSettings={project?.websiteSettings}
                projectName={displayProjectName}
                projectFiles={project?.files}
                databaseIntegration={{
                  provider: "supabase",
                connected: !!project?.supabaseProjectRef,
                projectRef: project?.supabaseProjectRef,
                projectUrl: project?.supabaseUrl,
              }}
              githubIntegration={{
                repoFullName: project?.githubRepoFullName,
                repoUrl: project?.githubRepoUrl,
                syncedAt: project?.githubSyncedAt,
              }}
              onSaved={(next) => setProject((prev) => (prev ? { ...prev, websiteSettings: next } : prev))}
            />
          </div>
        </SheetContent>
      </Sheet>
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







