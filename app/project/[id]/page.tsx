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

import { useEffect, useState, useRef, useCallback, useMemo, type FormEvent } from "react"
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
  Monitor,
  Tablet,
  Smartphone,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { BuildTimeline, type TimelineStep } from "@/components/preview/build-timeline"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import type { GeneratedFile, Message, PlanningStatus, Project, ProjectBlueprint, ProjectVisibility } from "./types"
import { extractAgentMessage } from "./utils"
import { ProjectErrorBoundary, ChatMessage, ResponsivePreview, BrowserNavigator, ProjectCreationStudio, AgentTimelinePanel } from "@/components/project"
import type { AgentTimelineItem } from "@/components/project/agent-timeline-panel"
import { WebsiteSettingsPanel } from "@/components/project/website-settings-panel"
import { SupabaseSetupModal } from "@/components/project/SupabaseSetupModal"
import { SupabaseProjectSelector } from "@/components/project/SupabaseProjectSelector"
import { SupabaseCreateProjectModal } from "@/components/project/SupabaseCreateProjectModal"
import { VisualEditDesignPanel, type DesignSnapshot } from "@/components/project/visual-edit-design-panel"
import type { VisualEditSectionItem, VisualEditStructureCommand } from "@/components/project/visual-edit-structure"
import {
  buildPlanningAssistantReply,
  createInitialBlueprint,
  createPlanningMessages,
  updateBlueprintFromReply,
} from "@/lib/project-blueprint"
import { buildkitAgents } from "@/lib/buildkit-agents"
import { hasGenerationMeta, parseGenerationMeta } from "@/lib/generation-meta"
import { resolveTerminalAgentPhase } from "@/lib/agent-runtime"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

// Persists across Strict Mode remounts so only one sandbox run can update logs
let sandboxRunIdCounter = 0
// Prevents auto-preview from running twice when effect runs twice (e.g. Strict Mode remount)
let lastAutoPreviewKey: string | null = null

function ProjectContent() {
  const params = useParams()
  const projectId = params?.id as string

  const { user, userData, hasTokens, remainingTokens, updateTokensUsed, getOptionalAuthHeader, workspaces, switchWorkspace, loading: authLoading } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [resolvedBlueprint, setResolvedBlueprint] = useState<ProjectBlueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlanningReplyPending, setIsPlanningReplyPending] = useState(false)
  const [creationStudioExited, setCreationStudioExited] = useState(false)
  const [planningStudioOpenManual, setPlanningStudioOpenManual] = useState(false)
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview")
  const [chatInput, setChatInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingFiles, setGeneratingFiles] = useState<GeneratedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [previewPath, setPreviewPath] = useState("/")
  const [previewPathDraft, setPreviewPathDraft] = useState("/")
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
  const [selectedElementDescription, setSelectedElementDescription] = useState<string | null>(null)
  const [selectedElementCount, setSelectedElementCount] = useState(0)
  const [selectedVisualEditElement, setSelectedVisualEditElement] = useState<{
    id: string
    description: string | null
    initial: DesignSnapshot
  } | null>(null)
  const [visualEditDraft, setVisualEditDraft] = useState<DesignSnapshot | null>(null)
  const [visualEditSections, setVisualEditSections] = useState<VisualEditSectionItem[]>([])
  const [selectedVisualSectionId, setSelectedVisualSectionId] = useState<string | null>(null)
  const [visualEditCommandNonce, setVisualEditCommandNonce] = useState(0)
  const [visualEditCommand, setVisualEditCommand] = useState<VisualEditStructureCommand | null>(null)
  const [visualEditConfirmAction, setVisualEditConfirmAction] = useState<null | "exit" | "clear">(null)
  const [deployOpen, setDeployOpen] = useState(false)
  const [websiteSettingsOpen, setWebsiteSettingsOpen] = useState(false)
  const visualEditAutoEnteredRef = useRef(false)

  useEffect(() => {
    setPreviewPathDraft(previewPath)
  }, [previewPath])
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
  const [supabaseSetupModalOpen, setSupabaseSetupModalOpen] = useState(false)
  const [supabaseProjectSelectorOpen, setSupabaseProjectSelectorOpen] = useState(false)
  const [supabaseCreateProjectOpen, setSupabaseCreateProjectOpen] = useState(false)
  const [supabaseAccountConnected, setSupabaseAccountConnected] = useState(false)
  const [supabaseSetupError, setSupabaseSetupError] = useState("")
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

  // Load and resolve blueprint asynchronously
  useEffect(() => {
    if (!project) {
      setResolvedBlueprint(null)
      return
    }

    if (project.blueprint) {
      setResolvedBlueprint(project.blueprint)
      return
    }

    // Need to create blueprint asynchronously
    const initBlueprint = async () => {
      try {
        const bp = await createInitialBlueprint(project.prompt)
        setResolvedBlueprint(bp)
      } catch (error) {
        console.error("Failed to create blueprint:", error)
        // Use a minimal fallback blueprint
        setResolvedBlueprint({
          summary: project.prompt,
          readiness: 0,
          sections: [],
          openQuestions: [],
          assumptions: [],
        })
      }
    }

    initBlueprint()
  }, [project])

  // Check if user has Supabase OAuth connection when setup modal is opened
  useEffect(() => {
    if (!supabaseSetupModalOpen) return
    
    const checkSupabaseConnection = async () => {
      try {
        setSupabaseOauthLoading(true)
        setSupabaseSetupError("")
        const authHeader = await getOptionalAuthHeader()
        const res = await fetch("/api/supabase/check-connection", { headers: authHeader })
        const json = await res.json().catch(() => ({}))
        
        if (res.ok && json?.connected) {
          setSupabaseAccountConnected(true)
          // Auto-fetch projects if already connected
          await fetchSupabaseProjects()
          // Auto-show project selector after a short delay for UX
          setSupabaseProjectSelectorOpen(true)
        } else {
          setSupabaseAccountConnected(false)
        }
      } catch (e) {
        console.error("Error checking Supabase connection:", e)
        setSupabaseAccountConnected(false)
      } finally {
        setSupabaseOauthLoading(false)
      }
    }

    checkSupabaseConnection()
  }, [supabaseSetupModalOpen])

  const fetchSupabaseProjects = async () => {
    try {
      setSupabaseProjectsLoading(true)
      setSupabaseProjectsError("")
      const authHeader = await getOptionalAuthHeader()
      const res = await fetch("/api/supabase/projects", { headers: authHeader })
      const json = await res.json().catch(() => ({}))
      
      if (!res.ok) throw new Error(json?.error || "Failed to fetch projects")
      
      const projects = Array.isArray(json?.projects)
        ? json.projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            ref: p.ref,
            region: p.region || "Unknown",
            organizationId: p.organizationId,
          }))
        : []
      
      setSupabaseProjects(projects)
      
      // If no projects exist, show create project modal
      if (projects.length === 0) {
        setSupabaseProjectSelectorOpen(false)
        setSupabaseCreateProjectOpen(true)
      } else {
        setSupabaseCreateProjectOpen(false)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch projects"
      setSupabaseProjectsError(msg)
      setSupabaseSetupError(msg)
    } finally {
      setSupabaseProjectsLoading(false)
    }
  }

  const handleSupabaseSetupConnect = async () => {
    try {
      setSupabaseOauthLoading(true)
      setSupabaseSetupError("")
      const authHeader = await getOptionalAuthHeader()
      const res = await fetch(`/api/integrations/supabase/authorize?builderProjectId=${encodeURIComponent(projectId)}`, {
        headers: authHeader,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) throw new Error(json?.error || "Failed to start Supabase connection.")
      window.open(json.url, "supabase-oauth", "width=560,height=760,menubar=no,toolbar=no")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect Supabase."
      setSupabaseSetupError(msg)
    } finally {
      setSupabaseOauthLoading(false)
    }
  }

  const handleSupabaseCreateProject = async (name: string, region: string, password: string) => {
    if (!project) return
    try {
      setSupabaseCreatingProject(true)
      setSupabaseSetupError("")
      const authHeader = await getOptionalAuthHeader()
      const res = await fetch("/api/integrations/supabase/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          builderProjectId: projectId,
          projectName: name,
          region,
          databasePassword: password,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to create Supabase project.")
      
      // Success - close create modal and refresh projects
      setSupabaseCreateProjectOpen(false)
      
      // If project was returned, auto-link it
      if (json?.projectRef) {
        setSelectedSupabaseRef(json.projectRef)
        
        // Link the newly created project
        const linkRes = await fetch("/api/integrations/supabase/link-project", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ builderProjectId: projectId, supabaseProjectRef: json.projectRef }),
        })
        const linkJson = await linkRes.json().catch(() => ({}))
        if (!linkRes.ok) throw new Error(linkJson?.error || "Failed to link project.")
        
        // Close all modals on success
        setSupabaseSetupModalOpen(false)
        setSupabaseProjectSelectorOpen(false)
        
        // Update project state
        const linkedProject = { ...project, supabaseProjectRef: json.projectRef }
        setProject(linkedProject)
        
        toast({ title: "Success", description: "Supabase project created and linked successfully!" })
      } else {
        // No project ref returned, refresh the list
        await fetchSupabaseProjects()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create Supabase project."
      setSupabaseSetupError(msg)
    } finally {
      setSupabaseCreatingProject(false)
    }
  }

  const handleSupabaseSetupModalClose = () => {
    setSupabaseSetupModalOpen(false)
    setSuggestBackendDismissed(true)
    setSupabaseProjectSelectorOpen(false)
    setSupabaseCreateProjectOpen(false)
    setSupabaseAccountConnected(false)
    setSelectedSupabaseRef("")
    setSupabaseSetupError("")
  }

  const handleSupabaseProjectLink = async () => {
    if (!selectedSupabaseRef || !project) return
    try {
      setSupabaseOauthLoading(true)
      setSupabaseSetupError("")
      const authHeader = await getOptionalAuthHeader()
      const res = await fetch("/api/integrations/supabase/link-project", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ builderProjectId: projectId, supabaseProjectRef: selectedSupabaseRef }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to link Supabase project.")
      
      // Success - close modals and update project state
      setSupabaseSetupModalOpen(false)
      setSupabaseProjectSelectorOpen(false)
      
      // Update project with linked Supabase
      const linkedProject = { ...project, supabaseProjectRef: selectedSupabaseRef }
      setProject(linkedProject)
      
      toast({ title: "Success", description: "Supabase project linked. You can now inject the code in the next phase." })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to link Supabase project."
      setSupabaseSetupError(msg)
    } finally {
      setSupabaseOauthLoading(false)
    }
  }

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
  const getAuthHeader = useCallback(async () => {
    if (!user) throw new Error("Not authenticated")
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }, [user])

  const usesNvidiaVerificationGate = useCallback((model?: string) => {
    if (!model) return false
    return !["GPT-4-1 Mini", "GPT-4-1", "o3-mini"].includes(model)
  }, [])

  const verifyFilesInSandbox = useCallback(async (files: GeneratedFile[]) => {
    const authHeader = await getAuthHeader()
    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ files }),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Sandbox verification failed")
      return { ok: false as const, error: errorText, logsTail: "" }
    }

    const reader = res.body?.getReader()
    if (!reader) {
      return { ok: false as const, error: "Sandbox verification returned no body", logsTail: "" }
    }

    const decoder = new TextDecoder()
    let lineBuffer = ""
    let logsTail = ""
    let sandboxId: string | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      logsTail += chunk
      lineBuffer += chunk

      const lines = lineBuffer.split("\n")
      lineBuffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.type === "success" && data.sandboxId) {
            sandboxId = String(data.sandboxId)
            if (sandboxId) {
              await fetch("/api/sandbox", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sandboxId }),
              }).catch(() => {})
            }
            return { ok: true as const, logsTail }
          }
          if (data.type === "error") {
            return {
              ok: false as const,
              error: String(data.error || "Sandbox verification failed"),
              logsTail,
            }
          }
        } catch {
          // ignore malformed line fragments during stream parsing
        }
      }
    }

    if (sandboxId) {
      await fetch("/api/sandbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId }),
      }).catch(() => {})
    }

    return { ok: false as const, error: "Sandbox verification ended without a result", logsTail }
  }, [getAuthHeader])

  const agentTimeline = useMemo<AgentTimelineItem[]>(() => {
    const base = [
      {
        key: "analyze",
        title: "Understanding your request",
        description: "Reviewing the prompt, website context, and current project files.",
        detail: "Parsing intent, product scope, and constraints before touching the build.",
        accent: "Brief",
      },
      {
        key: "plan",
        title: "Planning the update",
        description: "Choosing components, layout changes, and implementation steps.",
        detail: "Sequencing the right changes and reducing risky assumptions first.",
        accent: "Strategy",
      },
      {
        key: "build",
        title: "Generating files",
        description: currentGeneratingFile
          ? `Working on ${currentGeneratingFile}`
          : "Writing and updating the files needed for this change.",
        detail: currentGeneratingFile
          ? "Applying the current file-level update inside the project workspace."
          : "Turning the approved direction into concrete file edits.",
        accent: "Execution",
      },
      {
        key: "finalize",
        title: "Finalizing output",
        description: "Wrapping up the response and preparing the updated website state.",
        detail: "Preparing the handoff back into preview and the next edit loop.",
        accent: "Handoff",
      },
    ] as const

    const normalized = reasoningSteps.map((step) => step.toLowerCase())
    const currentStage =
      agentStatus.toLowerCase().includes("final") ? 3
      : normalized.some((step) => step.includes("creating files")) || !!currentGeneratingFile ? 2
      : normalized.length >= 2 ? 1
      : 0

    return base.map((step, index) => ({
      ...step,
      status: index < currentStage ? "complete" : index === currentStage ? "active" : "pending",
    }))
  }, [agentStatus, currentGeneratingFile, reasoningSteps])

  const generatedFileCount = generatingFiles.length

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
  const creationMode = project?.creationMode || "build"
  const isBuildTokenBlocked = remainingTokens <= 0 && creationMode !== "agent"
  const activeAgent = creationMode === "agent"
    ? buildkitAgents.find((agent) => agent.slug === project?.agentSlug) || buildkitAgents[0]
    : null
  const planningStatus: PlanningStatus = project?.planningStatus || "draft"
  const planningMessages = project && resolvedBlueprint
    ? createPlanningMessages(project.prompt, project.messages || [], resolvedBlueprint)
    : []
  const shouldShowCreationStudio =
    !!project &&
    creationMode === "agent" &&
    (
      planningStudioOpenManual ||
      (
        project.status === "pending" &&
        !creationStudioExited &&
        planningStatus !== "approved" &&
        planningStatus !== "skipped"
      )
    ) &&
    !isGenerating

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

    if (!netlifyConnected) {
      // Redirect to Netlify OAuth if not connected yet.
      await handleConnectNetlify()
      return
    }

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
  }, [deployLinks?.siteId, getAuthHeader, netlifySiteName, project?.name, projectId, refreshNetlifyStatus, toFriendlyDeployError, netlifyConnected, handleConnectNetlify])

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

    if (!vercelConnected) {
      setVercelDeployError("Vercel not connected. Please add your access token in Integrations before deploying.")
      return
    }

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
  }, [getAuthHeader, projectId, refreshVercelStatus, toFriendlyDeployError, vercelConnected])

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
    setCreationStudioExited(false)
    setPlanningStudioOpenManual(false)
  }, [projectId])

  useEffect(() => {
    if (!project || project.status !== "pending" || !canEdit) return

    const needsBlueprint = !project.blueprint
    const needsPlanningMessage = !project.messages || project.messages.length === 0
    if (!needsBlueprint && !needsPlanningMessage && project.planningStatus) return

    const initBlueprint = async () => {
      const nextBlueprint = project.blueprint || await createInitialBlueprint(project.prompt)
      const nextMessages = await createPlanningMessages(project.prompt, project.messages || [], nextBlueprint)
      const inferredStatus = buildPlanningAssistantReply(nextBlueprint).planningStatus
      const projectRef = doc(db, "projects", projectId)

      updateDoc(projectRef, {
        blueprint: nextBlueprint,
        messages: nextMessages,
        planningStatus: project.planningStatus || inferredStatus,
      }).catch(() => {})

      setProject((prev) =>
        prev
          ? {
              ...prev,
              blueprint: nextBlueprint,
              messages: nextMessages,
              planningStatus: prev.planningStatus || inferredStatus,
            }
          : prev
      )
    }

    initBlueprint()
  }, [project, canEdit, projectId])

  // Start generation on mount:
  // - build mode: generate directly from prompt (no default planning gate)
  // - agent mode: only after explicit plan approval/skip
  useEffect(() => {
    if (!project || project.status !== "pending" || isGenerating) return
    if (project.creationMode === "agent") {
      if (project.planningStatus !== "approved" && project.planningStatus !== "skipped") return
    }
    if (pendingGenerationStartedRef.current === projectId) return
    pendingGenerationStartedRef.current = projectId
    setCreationStudioExited(true)
    generateCode(project.prompt, project.model)
  }, [project?.status, projectId, isGenerating, project?.prompt, project?.model, project?.planningStatus, project?.creationMode])

  /** Merge model output (diffs or full files) into existing project; applies patches when content is unified diff. */
  const mergeWithExistingFiles = (
    existingFiles: GeneratedFile[],
    blocks: GeneratedFile[]
  ): GeneratedFile[] => {
    const result = existingFiles.map(f => ({ ...f }))

    const normalizeUnifiedDiffHunkCounts = (diffText: string) => {
      const lines = diffText.split("\n")
      const normalized: string[] = []
      let index = 0

      while (index < lines.length) {
        const line = lines[index]
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)

        if (!hunkMatch) {
          normalized.push(line)
          index += 1
          continue
        }

        let oldCount = 0
        let newCount = 0
        const body: string[] = []
        index += 1

        while (index < lines.length && !lines[index].startsWith("@@ ")) {
          const bodyLine = lines[index]
          body.push(bodyLine)

          if (bodyLine.startsWith("+")) {
            newCount += 1
          } else if (bodyLine.startsWith("-")) {
            oldCount += 1
          } else if (bodyLine.startsWith(" ") || bodyLine === "") {
            oldCount += 1
            newCount += 1
          }

          index += 1
        }

        const [, oldStart, , newStart, , suffix] = hunkMatch
        normalized.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${suffix}`)
        normalized.push(...body)
      }

      return normalized.join("\n")
    }

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
          let patched = applyPatch(oldContent, content)
          if (patched === false) {
            patched = applyPatch(oldContent, normalizeUnifiedDiffHunkCounts(content))
          }
          if (typeof patched === "string") {
            if (existingIndex !== -1) {
              result[existingIndex] = { ...result[existingIndex], content: patched }
            } else {
              result.push({ path, content: patched })
            }
          }
        } catch (err) {
          try {
            const patched = applyPatch(oldContent, normalizeUnifiedDiffHunkCounts(content))
            if (typeof patched === "string") {
              if (existingIndex !== -1) {
                result[existingIndex] = { ...result[existingIndex], content: patched }
              } else {
                result.push({ path, content: patched })
              }
              continue
            }
          } catch {}
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
    if (isBuildTokenBlocked) {
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

      const body: {
        prompt: string
        model: string
        idToken: string
        existingFiles?: { path: string; content: string }[]
        creationMode?: "build" | "agent"
        agentSlug?: string
      } = {
        prompt,
        model: model || "GPT-4-1 Mini",
        idToken,
        creationMode: project.creationMode || "build",
        agentSlug: project.creationMode === "agent" ? project.agentSlug : undefined,
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
        if (response.status === 429 && errorData?.code === "AGENT_LIMIT_REACHED") {
          const fallbackMessage = "Agents limit reached. Switched to Builder mode. Upgrade for more agent runs or wait for reset."
          await updateDoc(projectRef, {
            status: "pending",
            creationMode: "build",
            agentSlug: deleteField(),
          })
          setProject((prev) => (prev ? { ...prev, status: "pending", creationMode: "build", agentSlug: undefined } : prev))
          toast({
            title: "Agents limit reached",
            description: fallbackMessage,
          })
          return
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
      
      const generationMeta = parseGenerationMeta(fullContent)
      const shouldPersistGenerationMeta = hasGenerationMeta(generationMeta)
      const shouldPersistAgentRuntime = (project.creationMode || "build") === "agent"
      const agentRuntime = shouldPersistAgentRuntime
        ? {
            mode: "agent" as const,
            phase: resolveTerminalAgentPhase({
              suggestedPhase: generationMeta.agentPhase,
              blockedReason: generationMeta.blockedReason,
              setupRequirementCount: generationMeta.setupRequirements.length,
            }),
            setupRequirements: generationMeta.setupRequirements,
            ...(generationMeta.blockedReason ? { blockedReason: generationMeta.blockedReason } : {}),
            updatedAt: new Date().toISOString(),
          }
        : undefined

      if (usesNvidiaVerificationGate(model)) {
        setAgentStatus("Verifying generated app in sandbox...")
        setReasoningSteps(prev => [...prev, "Verifying generated output in sandbox."])

        const firstVerification = await verifyFilesInSandbox(finalFiles)
        if (!firstVerification.ok) {
          setAgentStatus("Repairing issues found during verification...")
          setReasoningSteps(prev => [...prev, "Repairing build issues before delivery."])

          const authHeader = await getAuthHeader()
          const repairRes = await fetch("/api/error/fix", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeader,
            },
            body: JSON.stringify({
              files: finalFiles,
              error: firstVerification.error || "Sandbox verification failed",
              failureCategory: "build",
              failureReason: "Sandbox verification failed",
              logsTail: firstVerification.logsTail?.slice(-12000) || "",
            }),
          })

          const repairJson = await repairRes.json().catch(() => ({}))
          if (!repairRes.ok || !repairJson?.success || !Array.isArray(repairJson.files) || repairJson.files.length === 0) {
            throw new Error(repairJson?.error || "Automatic verification repair failed")
          }

          finalFiles = repairJson.files

          setAgentStatus("Re-verifying repaired app in sandbox...")
          setReasoningSteps(prev => [...prev, "Re-verifying repaired output in sandbox."])
          const secondVerification = await verifyFilesInSandbox(finalFiles)
          if (!secondVerification.ok) {
            throw new Error(secondVerification.error || "Repaired output still failed sandbox verification")
          }
        }
      }

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
        ...(generationMeta.suggestsBackend ? { suggestsBackend: true } : {}),
        ...(shouldPersistGenerationMeta ? { generationMeta } : {}),
        ...(agentRuntime ? { agentRuntime } : {}),
        messages: nextMessages,
      })
      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: "complete",
              files: finalFiles,
              ...(generationMeta.suggestsBackend ? { suggestsBackend: true } : {}),
              ...(shouldPersistGenerationMeta ? { generationMeta } : {}),
              ...(agentRuntime ? { agentRuntime } : {}),
              messages: nextMessages,
            }
          : prev
      )

      if (finalFiles.length > 0) {
        setSelectedFile(finalFiles[0])
      }

      // Show Supabase setup modal if backend is needed and not yet dismissed
      if (generationMeta.suggestsBackend && !suggestBackendDismissed) {
        setSupabaseSetupModalOpen(true)
        setSelectedSupabaseRef("")
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

    if (isBuildTokenBlocked) {
      setTokenLimitModalOpen(true)
      return
    }

    const contextualUserMessage = selectedElementDescription
      ? selectedElementCount > 1
        ? `Update these selected website elements (${selectedElementDescription}): ${nextMessage}`
        : `Update this selected website element (${selectedElementDescription}): ${nextMessage}`
      : nextMessage
    const userMessage = contextualUserMessage
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
    await generateCode(fullPrompt, submittedModel || project.model)
    setSelectedElementDescription(null)
    setSelectedElementCount(0)
    setEditingContextLabel(null)
    setSelectedVisualEditElement(null)
    setVisualEditDraft(null)
  }

  const handleStopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsGenerating(false)
    setGeneratingFiles([])
    setCurrentGeneratingFile("")
    setAgentStatus("")
    setReasoningSteps([])
  }, [])

  const handleManualVisualSave = useCallback(async (payload: {
    id: string
    description: string | null
    initial: { content?: string; styles?: Record<string, string> }
    current: { content?: string; styles?: Record<string, string> }
  }) => {
    if (!project || !canEdit || isGenerating) return

    const nextPrompt = [
      "Persist this exact manual visual edit into the project source code.",
      "This is not a redesign request. Treat the edited snapshot as the source of truth and make the minimum code changes required to match it exactly.",
      "Update only the component or page that renders this selected element.",
      "",
      `Selected element: ${payload.description || payload.id}`,
      "",
      "Before edit snapshot:",
      "```json",
      JSON.stringify(payload.initial, null, 2),
      "```",
      "",
      "After edit snapshot that must be matched exactly:",
      "```json",
      JSON.stringify(payload.current, null, 2),
      "```",
      "",
      "Rules:",
      "- Preserve the current content, colors, typography, spacing, and styles from the edited snapshot.",
      "- Do not reinterpret or redesign the element.",
      "- If the project uses utility classes, update classes so the rendered result matches the edited snapshot.",
      "- If the project uses CSS or inline styles, update those source files instead.",
      "- Keep unrelated code unchanged.",
      "- Return only changed files.",
    ].join("\n")

    const projectRef = doc(db, "projects", projectId)
    const manualSaveMessage = {
      role: "user" as const,
      content: `Saved manual visual edit for ${payload.description || payload.id}. Persisting those changes to source code.`,
    }

    await updateDoc(projectRef, {
      messages: [
        ...(project.messages || []),
        manualSaveMessage,
      ]
    })

    setProject((prev) => (
      prev
        ? {
            ...prev,
            messages: [...(prev.messages || []), manualSaveMessage],
          }
        : prev
    ))

    setSelectedVisualEditElement((prev) => (
      prev && prev.id === payload.id
        ? {
            ...prev,
            initial: payload.current,
          }
        : prev
    ))
    setVisualEditDraft(payload.current)

    await generateCode(`Original request: ${project.prompt}\n\nUser wants these modifications: ${nextPrompt}`, project.model)
  }, [project, canEdit, isGenerating, generateCode, projectId])

  const isSameDesignSnapshot = useCallback((a: DesignSnapshot | null, b: DesignSnapshot | null) => {
    if (!a || !b) return false

    const normalizeStyles = (styles?: Record<string, string>) => {
      const out: Record<string, string> = {}
      if (!styles) return out
      for (const [key, value] of Object.entries(styles)) {
        if (typeof value === "string" && value.trim() !== "") out[key] = value
      }
      return out
    }

    return (
      (a.content ?? "") === (b.content ?? "") &&
      JSON.stringify(normalizeStyles(a.styles)) === JSON.stringify(normalizeStyles(b.styles))
    )
  }, [])

  const hasUnsavedVisualEditChanges = useCallback(() => {
    if (!selectedVisualEditElement || !visualEditDraft) return false
    return !isSameDesignSnapshot(selectedVisualEditElement.initial, visualEditDraft)
  }, [isSameDesignSnapshot, selectedVisualEditElement, visualEditDraft])

  const clearVisualEditSelection = useCallback(() => {
    setSelectedElementDescription(null)
    setSelectedElementCount(0)
    setEditingContextLabel(null)
    setSelectedVisualEditElement(null)
    setVisualEditDraft(null)
    setSelectedVisualSectionId(null)
  }, [])

  const requestVisualEditExit = useCallback(() => {
    if (hasUnsavedVisualEditChanges()) {
      setVisualEditConfirmAction("exit")
      return false
    }

    setVisualEditActive(false)
    clearVisualEditSelection()
    return true
  }, [clearVisualEditSelection, hasUnsavedVisualEditChanges])

  const requestVisualEditClear = useCallback(() => {
    if (hasUnsavedVisualEditChanges()) {
      setVisualEditConfirmAction("clear")
      return false
    }

    clearVisualEditSelection()
    return true
  }, [clearVisualEditSelection, hasUnsavedVisualEditChanges])

  const exitVisualEdit = useCallback(() => {
    return requestVisualEditExit()
  }, [requestVisualEditExit])

  useEffect(() => {
    if (visualEditAutoEnteredRef.current) return
    if (!canEdit) return
    if (project?.status !== "complete") return
    if (!ensuredPreviewUrl) return

    setVisualEditActive(true)
    visualEditAutoEnteredRef.current = true
  }, [canEdit, project?.status, ensuredPreviewUrl])

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

  const handleVisualSelectionChange = useCallback((selection: {
    descriptions: string[]
    primary?: {
      id: string
      description: string | null
      snapshot: DesignSnapshot
      sectionId?: string | null
    }
  } | null) => {
    const descriptions = selection?.descriptions || []
    const combined = descriptions.join("; ")

    setSelectedElementDescription(combined || null)
    setSelectedElementCount(descriptions.length)
    setEditingContextLabel(
      descriptions.length > 1
        ? `Editing ${descriptions.length} selected elements`
        : combined
          ? describeEditingContext(combined)
          : null
    )

    if (selection?.primary) {
      if (selection.primary.sectionId) setSelectedVisualSectionId(selection.primary.sectionId)
      setSelectedVisualEditElement({
        id: selection.primary.id,
        description: selection.primary.description,
        initial: selection.primary.snapshot,
      })
      setVisualEditDraft(selection.primary.snapshot)
    } else {
      setSelectedVisualEditElement(null)
      setVisualEditDraft(null)
    }
  }, [describeEditingContext])

  const getSelectionBadgeValue = useCallback((raw: string | null | undefined) => {
    if (!raw) return "Element"
    const text = typeof raw === "string" ? raw.trim() : String(raw).trim()

    if (/\bh1\b/i.test(text) || /heading 1/i.test(text)) return "H1"
    if (/\bh2\b/i.test(text) || /heading 2/i.test(text)) return "H2"
    if (/\bh3\b/i.test(text) || /heading 3/i.test(text)) return "H3"
    if (/\bbutton\b/i.test(text)) return "Button"
    if (/\binput\b|\bfield\b/i.test(text)) return "Input"
    if (/\bimage\b|\bimg\b/i.test(text)) return "Image"

    const paragraphNumber = text.match(/\bp(?:aragraph)?\s*(\d+)\b/i)?.[1]
    if (paragraphNumber) return `P${paragraphNumber}`
    if (/^["']?.{20,}/.test(text) || /\bparagraph\b/i.test(text)) return "P1"

    const compact = text
      .replace(/^["']|["']$/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ")

    return compact || "Element"
  }, [])

  const getSelectionBadgeDisplay = useCallback((raw: string | null | undefined, count: number) => {
    if (count > 1) return `${count} Elements`
    return getSelectionBadgeValue(raw)
  }, [getSelectionBadgeValue])

  const handlePlanningSubmit = useCallback(async (value: string) => {
    if (!project || !resolvedBlueprint || !canEdit) return

    setIsPlanningReplyPending(true)
    const nextBlueprint = updateBlueprintFromReply(resolvedBlueprint, value)
    const assistant = buildPlanningAssistantReply(nextBlueprint, value)
    const nextMessages = [
      ...(project.messages || []),
      { role: "user" as const, content: value, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: assistant.content, timestamp: new Date().toISOString() },
    ]

    const projectRef = doc(db, "projects", projectId)
    try {
      await updateDoc(projectRef, {
        blueprint: nextBlueprint,
        messages: nextMessages,
        planningStatus: assistant.planningStatus,
      })
      setProject((prev) =>
        prev
          ? {
              ...prev,
              blueprint: nextBlueprint,
              messages: nextMessages,
              planningStatus: assistant.planningStatus,
            }
          : prev
      )
    } finally {
      setIsPlanningReplyPending(false)
    }
  }, [project, resolvedBlueprint, canEdit, projectId])

  const handleGeneratePlan = useCallback(async () => {
    if (!project || !resolvedBlueprint || !canEdit) return
    const projectRef = doc(db, "projects", projectId)
    const plannedMessages = [
      ...(project.messages || []),
      {
        role: "assistant" as const,
        content: "Your answers are approved. I drafted the plan so you can review it, refine anything that feels off, and build from it when you're ready.",
        timestamp: new Date().toISOString(),
      },
    ]

    await updateDoc(projectRef, {
      blueprint: resolvedBlueprint,
      planningStatus: "plan-generated",
      messages: plannedMessages,
    })
    setProject((prev) =>
      prev
        ? {
            ...prev,
            blueprint: resolvedBlueprint,
            planningStatus: "plan-generated",
            messages: plannedMessages,
          }
        : prev
    )
  }, [project, resolvedBlueprint, canEdit, projectId])

  const handleBuildFromPlan = useCallback(async () => {
    if (!project || !resolvedBlueprint || !canEdit) return
    const projectRef = doc(db, "projects", projectId)
    const approvedMessages = [
      ...(project.messages || []),
      {
        role: "assistant" as const,
        content: "Plan approved. I'm moving into generation now and will use the reviewed plan as the working brief.",
        timestamp: new Date().toISOString(),
      },
    ]

    setCreationStudioExited(true)
    await updateDoc(projectRef, {
      blueprint: resolvedBlueprint,
      planningStatus: "approved",
      messages: approvedMessages,
    })
    setProject((prev) =>
      prev
        ? {
            ...prev,
            blueprint: resolvedBlueprint,
            planningStatus: "approved",
            messages: approvedMessages,
          }
        : prev
    )
    pendingGenerationStartedRef.current = projectId
    await generateCode(project.prompt, project.model)
  }, [project, resolvedBlueprint, canEdit, projectId, generateCode])

  const handleSkipPlanAndBuild = useCallback(async () => {
    if (!project || !resolvedBlueprint || !canEdit) return
    const projectRef = doc(db, "projects", projectId)
    const skippedMessages = [
      ...(project.messages || []),
      {
        role: "assistant" as const,
        content: "Skipping the full planning pass. I’ll build now using the current brief and the visible assumptions in the blueprint.",
        timestamp: new Date().toISOString(),
      },
    ]

    setCreationStudioExited(true)
    await updateDoc(projectRef, {
      blueprint: resolvedBlueprint,
      planningStatus: "skipped",
      messages: skippedMessages,
    })
    setProject((prev) =>
      prev
        ? {
            ...prev,
            blueprint: resolvedBlueprint,
            planningStatus: "skipped",
            messages: skippedMessages,
          }
        : prev
    )
    pendingGenerationStartedRef.current = projectId
    await generateCode(project.prompt, project.model)
  }, [project, resolvedBlueprint, canEdit, projectId, generateCode])

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

  const latestAssistantMessage = [...(project?.messages || [])]
    .reverse()
    .find((message) => message.role === "assistant")

  const previewDeviceOptions: Array<{ key: "desktop" | "tablet" | "phone"; label: string; icon: typeof Monitor }> = [
    { key: "desktop", label: "Desktop", icon: Monitor },
    { key: "tablet", label: "Tablet", icon: Tablet },
    { key: "phone", label: "Phone", icon: Smartphone },
  ]

  const handlePreviewPathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = previewPathDraft.trim()
    if (!normalized) {
      setPreviewPath("/")
      return
    }
    setPreviewPath(normalized.startsWith("/") ? normalized : `/${normalized}`)
  }

  const queueVisualEditCommand = useCallback((command: VisualEditStructureCommand) => {
    setVisualEditCommand(command)
    setVisualEditCommandNonce((prev) => prev + 1)
  }, [])

  const handleVisualSectionMove = useCallback((sectionId: string, direction: "up" | "down") => {
    queueVisualEditCommand({ type: "move-section", sectionId, direction })
  }, [queueVisualEditCommand])

  const handleVisualSectionDuplicate = useCallback((sectionId: string) => {
    queueVisualEditCommand({ type: "duplicate-section", sectionId })
  }, [queueVisualEditCommand])

  const handleVisualSectionDelete = useCallback((sectionId: string) => {
    queueVisualEditCommand({ type: "delete-section", sectionId })
    if (selectedVisualSectionId === sectionId) setSelectedVisualSectionId(null)
  }, [queueVisualEditCommand, selectedVisualSectionId])

  const handleVisualSectionInsert = useCallback((afterSectionId: string | null, variant: "blank" | "hero" | "features" | "cta") => {
    queueVisualEditCommand({ type: "insert-section", afterSectionId, variant })
  }, [queueVisualEditCommand])

  const isVisualEditPanelMode = visualEditActive && selectedVisualEditElement && selectedElementCount === 1 && visualEditDraft
  const shouldApplyVisualDraftToPreview = Boolean(
    visualEditActive &&
    selectedVisualEditElement &&
    visualEditDraft &&
    !isSameDesignSnapshot(selectedVisualEditElement.initial, visualEditDraft)
  )

  // Combine project files with generating files
  const displayFiles = isGenerating ? generatingFiles : (project?.files || [])
  const resolvedPreviewUrl = getPreviewUrl()
  const hasProjectFiles = (project?.files?.length || 0) > 0
  
  // Prefer explicit project name; fall back to prompt-derived title
  const displayProjectName = project?.name || project?.prompt?.split(' ').slice(0, 3).join(' ') || 'Untitled Project'

  // Calculate tokens limit (never negative remaining)
  const remainingDisplay = userData ? Math.max(0, userData.tokenUsage.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingDisplay : 0
  const agentRunLimit = userData ? getAgentRunLimitForPlan(userData.planId, userData.agentRunLimit) : 0
  const agentUsed = userData ? Math.max(0, Number(userData.agentUsage?.used ?? 0)) : 0
  const agentRemaining = userData
    ? Math.max(
        0,
        Number.isFinite(Number(userData.agentUsage?.remaining))
          ? Number(userData.agentUsage?.remaining)
          : agentRunLimit - agentUsed
      )
    : 0

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

  if (shouldShowCreationStudio && resolvedBlueprint) {
    return (
      <ProjectCreationStudio
        projectName={project.name || project.prompt?.split(" ").slice(0, 3).join(" ") || "Untitled Project"}
        prompt={project.prompt}
        messages={planningMessages}
        blueprint={resolvedBlueprint}
        planningStatus={planningStatus}
        creationMode={creationMode}
        agentName={activeAgent?.name || null}
        canEdit={canEdit}
        isSubmitting={isPlanningReplyPending}
        onSubmit={handlePlanningSubmit}
        onGeneratePlan={handleGeneratePlan}
        onBuildFromPlan={handleBuildFromPlan}
        onSkip={handleSkipPlanAndBuild}
        onBack={() => {
          if (planningStudioOpenManual) {
            setPlanningStudioOpenManual(false)
            return
          }
          router.push("/projects")
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1f1f1f]">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col px-3 py-3 sm:px-5 sm:py-4 lg:h-screen lg:px-6">
        <header className="mb-3 border-b border-zinc-200 bg-[#f5f5f2] px-1 pb-3 sm:mb-4 sm:pb-4 lg:h-14 lg:pb-0">
          <div className="flex items-start justify-between gap-3 sm:items-center">
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
            <div className="flex shrink-0 items-center gap-2">
            {creationMode === "agent" ? (
              <div className="flex items-center gap-2">
                <span className="hidden rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-600 sm:inline-flex">
                  Agents {agentRemaining}/{agentRunLimit}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100"
                  onClick={() => setPlanningStudioOpenManual(true)}
                >
                  Plan mode
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100",
                visualEditActive && "border-zinc-900 bg-zinc-900 text-white hover:bg-black hover:text-white"
              )}
              onClick={() => {
                if (visualEditActive) {
                  exitVisualEdit()
                  return
                }
                setVisualEditActive(true)
              }}
            >
              {visualEditActive ? "Exit Visual Edit" : "Visual Edit"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="hidden h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100 lg:inline-flex" onClick={() => setWebsiteSettingsOpen(true)}>
              Website Settings
            </Button>
            <Button type="button" size="sm" className="h-9 rounded-lg bg-[#1f1f1f] px-3 text-white hover:bg-black" onClick={() => setDeployOpen(true)}>
              Go Live
            </Button>
          </div>
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
              onClick={() => {
                setActiveTab("preview")
                setMobileTab("preview")
              }}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                mobileTab === "preview" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              Website Preview
            </button>
          </div>
        </div>

        <div className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-4 lg:gap-6",
          visualEditActive ? "lg:grid-cols-12" : "lg:grid-cols-10"
        )}>
          <section className={cn(
            "flex min-h-[52vh] flex-col overflow-hidden border border-zinc-200 bg-white lg:min-h-0",
            visualEditActive ? "lg:col-span-4" : "lg:col-span-3",
            mobileTab !== "chat" && "hidden lg:flex"
          )}>
            <div className="border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-wide text-zinc-800">{visualEditActive ? "AI Creative Assistant" : "Conversation"}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {visualEditActive
                    ? (editingContextLabel || "Select a section in the canvas to refine it with AI.")
                    : (editingContextLabel || "Editing entire website")}
                </p>
              </div>
            </div>

            {visualEditActive ? (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                  <div className="rounded-2xl border border-zinc-200 bg-[#f8f8f6] px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Current focus</p>
                    <p className="mt-2 text-sm text-zinc-900">
                      {selectedElementDescription ? getSelectionBadgeDisplay(selectedElementDescription, selectedElementCount) : "Entire page"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Page structure</p>
                      <button
                        type="button"
                        onClick={() => handleVisualSectionInsert(null, "blank")}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-700 transition-colors hover:bg-zinc-100"
                      >
                        Add section
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {visualEditSections.map((section) => (
                        <div
                          key={section.id}
                          className={cn(
                            "rounded-xl border px-3 py-2 transition-colors",
                            selectedVisualSectionId === section.id
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-[#fafaf8] text-zinc-800"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVisualSectionId(section.id)
                              queueVisualEditCommand({ type: "select-section", sectionId: section.id })
                            }}
                            className="w-full text-left"
                          >
                            <p className="text-xs font-medium">{section.label}</p>
                            <p className={cn("mt-0.5 text-[11px]", selectedVisualSectionId === section.id ? "text-zinc-200" : "text-zinc-500")}>
                              {section.kind}
                            </p>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleVisualSectionMove(section.id, "up")}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                selectedVisualSectionId === section.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              )}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVisualSectionMove(section.id, "down")}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                selectedVisualSectionId === section.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              )}
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVisualSectionDuplicate(section.id)}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                selectedVisualSectionId === section.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              )}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVisualSectionDelete(section.id)}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                selectedVisualSectionId === section.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              )}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVisualSectionInsert(section.id, "blank")}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                selectedVisualSectionId === section.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              )}
                            >
                              Add below
                            </button>
                          </div>
                        </div>
                      ))}
                      {visualEditSections.length === 0 ? (
                        <p className="text-xs text-zinc-500">Scanning sections from the live page...</p>
                      ) : null}
                    </div>
                  </div>

                  {latestAssistantMessage ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Latest AI update</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{latestAssistantMessage.content}</p>
                    </div>
                  ) : null}

                  {isVisualEditPanelMode ? (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                      <VisualEditDesignPanel
                        key={selectedVisualEditElement!.id}
                        className="border-l-0"
                        selectedId={selectedVisualEditElement!.id}
                        description={selectedVisualEditElement!.description}
                        snapshot={selectedVisualEditElement!.initial}
                        onApply={(draft) => {
                          setVisualEditDraft((prev) => {
                            const base = prev ?? selectedVisualEditElement!.initial
                            return {
                              content: draft.content !== undefined ? draft.content : base.content,
                              styles: draft.styles !== undefined ? draft.styles : base.styles,
                            }
                          })
                        }}
                        onClose={requestVisualEditClear}
                      />
                      <div className="border-t border-zinc-100 bg-[#fafaf8] p-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-lg border-zinc-300 bg-white text-xs text-zinc-700 hover:bg-zinc-100"
                          disabled={
                            isGenerating ||
                            isSameDesignSnapshot(selectedVisualEditElement!.initial, visualEditDraft)
                          }
                          onClick={() => handleManualVisualSave({
                            id: selectedVisualEditElement!.id,
                            description: selectedVisualEditElement!.description,
                            initial: selectedVisualEditElement!.initial,
                            current: visualEditDraft!,
                          })}
                        >
                          {isGenerating ? "Saving..." : "Apply visual edits"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-[#fafaf8] px-4 py-6 text-center">
                      <p className="text-sm font-medium text-zinc-800">Pick a section in the canvas</p>
                      <p className="mt-1 text-xs text-zinc-500">Then adjust it directly or ask AI for a focused change.</p>
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <div className="border-t border-zinc-100 p-2.5 sm:p-3">
                    <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {contextualChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleSendMessage(chip)}
                          disabled={!canEdit || isGenerating || isBuildTokenBlocked}
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
                      onStop={handleStopGeneration}
                      disabled={isBuildTokenBlocked}
                      initialModel={project?.model}
                      visualEditToggle={{
                        active: visualEditActive,
                        onToggle: () => {
                          if (visualEditActive) {
                            exitVisualEdit()
                            return
                          }
                          setVisualEditActive(true)
                        },
                      }}
                      contextBadge={selectedElementDescription ? {
                        label: "Design",
                        value: getSelectionBadgeDisplay(selectedElementDescription, selectedElementCount),
                        onClear: requestVisualEditClear,
                      } : null}
                    />
                  </div>
                ) : (
                  <div className="border-t border-zinc-100 p-3 text-center text-xs text-zinc-500">View only</div>
                )}
              </>
            ) : isVisualEditPanelMode ? (
              <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-[#f5f5f2]">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-0 text-xs text-zinc-600 hover:bg-transparent hover:text-zinc-900"
                      onClick={exitVisualEdit}
                    >
                      <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                      Back to Chat
                    </Button>
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">Visual Edit</span>
                  </div>

                  <VisualEditDesignPanel
                    key={selectedVisualEditElement!.id}
                    className="border-l-0"
                    selectedId={selectedVisualEditElement!.id}
                    description={selectedVisualEditElement!.description}
                    snapshot={selectedVisualEditElement!.initial}
                    onApply={(draft) => {
                      setVisualEditDraft((prev) => {
                        const base = prev ?? selectedVisualEditElement!.initial
                        return {
                          content: draft.content !== undefined ? draft.content : base.content,
                          styles: draft.styles !== undefined ? draft.styles : base.styles,
                        }
                      })
                    }}
                    onClose={() => {
                      requestVisualEditClear()
                    }}
                  />

                  <div className="border-t border-zinc-200 bg-white p-3">
                    <p className="text-xs text-zinc-500">
                      Fine-tune the selected element here, or ask the AI below to update it with context.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 h-9 rounded-lg border-zinc-300 bg-white text-xs text-zinc-700 hover:bg-zinc-100"
                      disabled={
                        isGenerating ||
                        isSameDesignSnapshot(selectedVisualEditElement!.initial, visualEditDraft)
                      }
                      onClick={() => handleManualVisualSave({
                        id: selectedVisualEditElement!.id,
                        description: selectedVisualEditElement!.description,
                        initial: selectedVisualEditElement!.initial,
                        current: visualEditDraft!,
                      })}
                    >
                      {isGenerating ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </div>
              </div>
              {canEdit ? (
                <div className="border-t border-zinc-100 p-2.5 sm:p-3">
                  {isBuildTokenBlocked && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-sm font-medium text-amber-900">Youâ€™ve used all credits for this cycle.</p>
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
                        disabled={!canEdit || isGenerating || isBuildTokenBlocked}
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
                    onStop={handleStopGeneration}
                    disabled={isBuildTokenBlocked}
                    initialModel={project?.model}
                    visualEditToggle={{
                      active: visualEditActive,
                      onToggle: () => {
                        if (visualEditActive) {
                          exitVisualEdit()
                          return
                        }
                        setVisualEditActive(true)
                      },
                    }}
                    contextBadge={selectedElementDescription ? {
                      label: "Design",
                      value: getSelectionBadgeDisplay(selectedElementDescription, selectedElementCount),
                      onClear: requestVisualEditClear,
                    } : null}
                  />
                </div>
              ) : (
                <div className="border-t border-zinc-100 p-3 text-center text-xs text-zinc-500">View only</div>
              )}
              </>
            ) : (
              <>
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
                  <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-[0_20px_70px_-36px_rgba(24,24,27,0.42)]">
                    <div className="border-b border-zinc-100 bg-[radial-gradient(circle_at_top_left,_rgba(244,244,245,0.95),_rgba(255,255,255,0.98)_58%)] px-4 py-4">
                      <div className="flex flex-col gap-3">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Agent Run Live
                        </div>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-zinc-900">
                              The agent is shaping, implementing, and validating this update
                            </p>
                            <TextShimmer className="text-sm text-zinc-600">
                              {agentStatus || "Preparing the next implementation step"}
                            </TextShimmer>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AgentTimelinePanel
                      steps={agentTimeline}
                      generatedFileCount={generatedFileCount}
                      currentGeneratingFile={currentGeneratingFile}
                    />
                  </div>
                )}
              <div ref={messagesEndRef} />
            </div>

            {canEdit ? (
              <div className="border-t border-zinc-100 p-2.5 sm:p-3">
                {isBuildTokenBlocked && (
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
                      disabled={!canEdit || isGenerating || isBuildTokenBlocked}
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
                  onStop={handleStopGeneration}
                  disabled={isBuildTokenBlocked}
                  initialModel={project?.model}
                  visualEditToggle={{
                    active: visualEditActive,
                    onToggle: () => {
                      if (visualEditActive) {
                        exitVisualEdit()
                        return
                      }
                      setVisualEditActive(true)
                    },
                  }}
                  contextBadge={selectedElementDescription ? {
                    label: "Design",
                    value: getSelectionBadgeDisplay(selectedElementDescription, selectedElementCount),
                    onClear: requestVisualEditClear,
                  } : null}
                />
              </div>
            ) : (
              <div className="border-t border-zinc-100 p-3 text-center text-xs text-zinc-500">View only</div>
            )}
              </>
            )}
          </section>

          <section className={cn(
            "min-h-[56vh] overflow-hidden border border-zinc-200 bg-white lg:min-h-0",
            visualEditActive ? "lg:col-span-8" : "lg:col-span-7",
            mobileTab !== "preview" && "hidden lg:block"
          )}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-wide text-zinc-800">{visualEditActive ? "Website Canvas" : "Live Website"}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {visualEditActive ? "Select, edit, and see updates instantly." : "Select a section in the preview to edit with context."}
                  </p>
                </div>
                {visualEditActive ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <form onSubmit={handlePreviewPathSubmit} className="hidden items-center rounded-lg border border-zinc-200 bg-[#fafaf8] px-2.5 py-1.5 sm:flex">
                      <span className="mr-2 text-xs text-zinc-400">/</span>
                      <input
                        value={previewPathDraft.replace(/^\//, "")}
                        onChange={(event) => setPreviewPathDraft(`/${event.target.value}`)}
                        className="w-36 bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400"
                        placeholder="page path"
                        aria-label="Preview page path"
                      />
                    </form>
                    <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-[#fafaf8] p-1">
                      {previewDeviceOptions.map(({ key, icon: Icon, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPreviewDevice(key)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
                            previewDevice === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                          )}
                          aria-label={label}
                          title={label}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100" onClick={handlePreviewReload}>
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100 lg:hidden" onClick={() => setWebsiteSettingsOpen(true)}>
                      Website Settings
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-zinc-300 bg-white px-3 text-zinc-700 hover:bg-zinc-100" onClick={handlePreviewReload}>
                      Refresh
                    </Button>
                  </div>
                )}
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
                    externalDraft={
                      shouldApplyVisualDraftToPreview && selectedVisualEditElement && visualEditDraft
                        ? { id: selectedVisualEditElement.id, snapshot: visualEditDraft }
                        : null
                    }
                    onIframeNavigate={handlePreviewNavigate}
                    onSelectionChange={handleVisualSelectionChange}
                    onStructureChange={setVisualEditSections}
                    command={visualEditCommand ? { nonce: visualEditCommandNonce, payload: visualEditCommand } : null}
                    selectedDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    className="h-full w-full"
                    iframeKey={previewKey}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-5 text-center sm:px-8">
                    {(isPreparingPreview || (hasProjectFiles && previewEnsureFailures < 2)) ? (
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

      <AlertDialog
        open={visualEditConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setVisualEditConfirmAction(null)
        }}
      >
        <AlertDialogContent className="border-zinc-200 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Discard visual edits?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              You have unsaved visual edits. If you leave now, those manual changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              onClick={() => setVisualEditConfirmAction(null)}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-zinc-900 text-white hover:bg-black"
              onClick={() => {
                const nextAction = visualEditConfirmAction
                setVisualEditConfirmAction(null)
                if (nextAction === "exit") {
                  setVisualEditActive(false)
                  clearVisualEditSelection()
                } else if (nextAction === "clear") {
                  clearVisualEditSelection()
                }
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="grid-rows-[auto,minmax(0,1fr)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[72rem] overflow-hidden border-zinc-200 bg-[#f8f8f5] p-0 sm:max-h-[calc(100dvh-3rem)] sm:w-[min(92vw,72rem)]">
          <DialogHeader>
            <div className="border-b border-zinc-200 bg-[radial-gradient(circle_at_top_left,_rgba(244,244,245,0.95),_rgba(255,255,255,0.98)_58%)] px-5 py-5 sm:px-7 sm:py-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Publish
              </div>
              <DialogTitle className="mt-4 text-xl text-zinc-900 sm:text-2xl">Go Live</DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
                Publish your website with a cleaner deployment flow, compare providers, and share your live URL once it is ready.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex justify-center sm:justify-start">
              <div className="grid w-full max-w-md grid-cols-2 rounded-xl border border-zinc-200 bg-white p-1 sm:inline-flex sm:w-auto">
                <button
                  type="button"
                  onClick={() => setDeployTab("netlify")}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    deployTab === "netlify" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                  )}
                >
                  Netlify
                </button>
                <button
                  type="button"
                  onClick={() => setDeployTab("vercel")}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    deployTab === "vercel" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                  )}
                >
                  Vercel
                </button>
              </div>
            </div>

            {deployTab === "netlify" ? (
              <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Netlify</p>
                      <p className="mt-1 text-sm text-zinc-600">Fast publishing with a simple live URL and redeploy flow.</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Recommended
                    </span>
                  </div>
                </div>
                <div className="space-y-4 px-4 py-4">
                  {deployLinks?.siteUrl ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Live URL</p>
                      <a
                        href={deployLinks.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Open live site</p>
                          <p className="mt-1 break-all text-sm font-semibold text-zinc-900">{deployLinks.siteUrl}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-zinc-500" />
                      </a>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-[40px] flex-1 rounded-xl border-zinc-300 text-zinc-700"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(deployLinks.siteUrl || "")
                              toast({ title: "Copied", description: "Live URL copied to clipboard." })
                            } catch {
                              toast({ title: "Copy failed", description: "Could not copy live URL.", variant: "destructive" })
                            }
                          }}
                        >
                          Copy Link
                        </Button>
                        <Button
                          type="button"
                          className="min-h-[40px] flex-1 rounded-xl bg-zinc-900 text-white hover:bg-black"
                          onClick={async () => {
                            try {
                              if (navigator.share) {
                                await navigator.share({ title: displayProjectName, url: deployLinks.siteUrl || "" })
                              } else {
                                await navigator.clipboard.writeText(deployLinks.siteUrl || "")
                                toast({ title: "Copied", description: "Share is unavailable here, so the URL was copied instead." })
                              }
                            } catch {
                              // Ignore user-cancelled share events
                            }
                          }}
                        >
                          Share Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Not published yet.</p>
                  )}
                  <Button
                    type="button"
                    className="min-h-[44px] w-full rounded-xl bg-[#1f1f1f] text-white hover:bg-black"
                    onClick={netlifyConnected ? handleDeployToNetlify : handleConnectNetlify}
                    disabled={isDeploying || netlifyConnected === null}
                  >
                    {isDeploying
                      ? "Publishing..."
                      : !netlifyConnected
                      ? "Connect Netlify"
                      : deployLinks?.siteUrl
                      ? "Republish with Netlify"
                      : "Publish with Netlify"}
                  </Button>
                  {(isDeploying || deployLogs.length > 0 || deployStep) && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111] shadow-inner">
                      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#171717] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Build Log</p>
                        </div>
                        {deployStep ? <p className="text-[11px] font-mono text-zinc-500">[{deployStep}]</p> : null}
                      </div>
                      <div className="max-h-48 overflow-auto bg-[#111111] p-3 font-mono text-[11px] leading-6 text-zinc-300">
                        {deployLogs.length === 0 ? (
                          <p className="text-zinc-500">$ Starting publish...</p>
                        ) : (
                          deployLogs.slice(-120).map((line, i) => (
                            <p
                              key={`netlify-log-${i}`}
                              className={cn(
                                "whitespace-pre-wrap break-words",
                                /\berror\b|failed|ERR!/i.test(line) && "text-red-300",
                                /\bwarn\b|warning|EBADENGINE/i.test(line) && "text-amber-300",
                                /added \d+ packages|success|complete|published|ready/i.test(line) && "text-emerald-300",
                                /^\s*>/.test(line) && "text-sky-300",
                                !/\berror\b|failed|ERR!|warn|warning|EBADENGINE|added \d+ packages|success|complete|published|ready|^\s*>/i.test(line) && "text-zinc-300"
                              )}
                            >
                              <span className="mr-2 text-zinc-600">$</span>
                              {line}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Vercel</p>
                      <p className="mt-1 text-sm text-zinc-600">Great for fast frontend hosting with an equally clean publish path.</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Alternative
                    </span>
                  </div>
                </div>
                <div className="space-y-4 px-4 py-4">
                  {vercelDeployLinks?.siteUrl ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Live URL</p>
                      <a
                        href={vercelDeployLinks.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Open live site</p>
                          <p className="mt-1 break-all text-sm font-semibold text-zinc-900">{vercelDeployLinks.siteUrl}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-zinc-500" />
                      </a>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-[40px] flex-1 rounded-xl border-zinc-300 text-zinc-700"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(vercelDeployLinks.siteUrl || "")
                              toast({ title: "Copied", description: "Live URL copied to clipboard." })
                            } catch {
                              toast({ title: "Copy failed", description: "Could not copy live URL.", variant: "destructive" })
                            }
                          }}
                        >
                          Copy Link
                        </Button>
                        <Button
                          type="button"
                          className="min-h-[40px] flex-1 rounded-xl bg-zinc-900 text-white hover:bg-black"
                          onClick={async () => {
                            try {
                              if (navigator.share) {
                                await navigator.share({ title: displayProjectName, url: vercelDeployLinks.siteUrl || "" })
                              } else {
                                await navigator.clipboard.writeText(vercelDeployLinks.siteUrl || "")
                                toast({ title: "Copied", description: "Share is unavailable here, so the URL was copied instead." })
                              }
                            } catch {
                              // Ignore user-cancelled share events
                            }
                          }}
                        >
                          Share Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Not published yet.</p>
                  )}
                  {!vercelConnected && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <p className="font-semibold">Vercel access token needed</p>
                      <p className="mt-1">To deploy with Vercel, add a token below.</p>
                      <a
                        href="https://vercel.com/account/tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs font-bold underline"
                      >
                        Create Vercel token in Vercel dashboard
                      </a>
                      <p className="mt-1 text-xs">Recommended scopes: <code>Deployments:Read</code>, <code>Deployments:Write</code>.</p>
                      <Input
                        value={vercelTokenInput}
                        onChange={(e) => setVercelTokenInput(e.target.value)}
                        placeholder="Enter Vercel access token"
                        className="mt-2"
                      />
                      <Button
                        type="button"
                        className="mt-2 w-full bg-[#1f1f1f] text-white hover:bg-black"
                        onClick={handleSaveVercelToken}
                        disabled={!vercelTokenInput.trim() || isVercelDeploying}
                      >
                        Save Vercel token
                      </Button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full rounded-xl border-zinc-300 text-zinc-700"
                    onClick={handleDeployToVercel}
                    disabled={isVercelDeploying || !vercelConnected}
                  >
                    {isVercelDeploying
                      ? "Publishing..."
                      : vercelDeployLinks?.siteUrl
                      ? "Republish with Vercel"
                      : "Publish with Vercel"}
                  </Button>
                  {(isVercelDeploying || vercelDeployLogs.length > 0 || vercelDeployStep) && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111] shadow-inner">
                      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#171717] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Build Log</p>
                        </div>
                        {vercelDeployStep ? <p className="text-[11px] font-mono text-zinc-500">[{vercelDeployStep}]</p> : null}
                      </div>
                      <div className="max-h-48 overflow-auto bg-[#111111] p-3 font-mono text-[11px] leading-6 text-zinc-300">
                        {vercelDeployLogs.length === 0 ? (
                          <p className="text-zinc-500">$ Starting publish...</p>
                        ) : (
                          vercelDeployLogs.slice(-120).map((line, i) => (
                            <p
                              key={`vercel-log-${i}`}
                              className={cn(
                                "whitespace-pre-wrap break-words",
                                /\berror\b|failed|ERR!/i.test(line) && "text-red-300",
                                /\bwarn\b|warning|EBADENGINE/i.test(line) && "text-amber-300",
                                /added \d+ packages|success|complete|published|ready/i.test(line) && "text-emerald-300",
                                /^\s*>/.test(line) && "text-sky-300",
                                !/\berror\b|failed|ERR!|warn|warning|EBADENGINE|added \d+ packages|success|complete|published|ready|^\s*>/i.test(line) && "text-zinc-300"
                              )}
                            >
                              <span className="mr-2 text-zinc-600">$</span>
                              {line}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(deployError || vercelDeployError) && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {deployError || vercelDeployError}
              </div>
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

      <SupabaseSetupModal
        open={supabaseSetupModalOpen}
        loading={supabaseOauthLoading}
        hasOAuthConnection={supabaseAccountConnected}
        error={supabaseSetupError}
        onClose={handleSupabaseSetupModalClose}
        onConnect={handleSupabaseSetupConnect}
      />

      <SupabaseProjectSelector
        open={supabaseProjectSelectorOpen}
        projects={supabaseProjects.map(p => ({ id: p.id, name: p.name, region: p.region }))}
        selectedId={selectedSupabaseRef}
        loading={supabaseOauthLoading || supabaseProjectsLoading}
        onClose={() => {
          setSupabaseProjectSelectorOpen(false)
          setSupabaseSetupModalOpen(true)
        }}
        onChange={setSelectedSupabaseRef}
        onConfirm={handleSupabaseProjectLink}
      />

      <SupabaseCreateProjectModal
        open={supabaseCreateProjectOpen}
        loading={supabaseCreatingProject}
        error={supabaseSetupError}
        regions={SUPABASE_REGIONS as Array<{ value: string; label: string }>}
        onClose={() => {
          setSupabaseCreateProjectOpen(false)
          setSupabaseProjectSelectorOpen(true)
        }}
        onCreate={handleSupabaseCreateProject}
      />
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




