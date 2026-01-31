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
import Spline from '@splinetool/react-spline'
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
import { ThinkingBar } from "@/components/prompt-kit/thinking-bar"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/prompt-kit/reasoning"
import { Button } from "@/components/ui/button"
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
import { motion, AnimatePresence } from "framer-motion"
import { applyPatch } from "diff"
import Editor from "@monaco-editor/react"

interface GeneratedFile {
  path: string
  content: string
  isGenerating?: boolean
}

interface Message {
  role: "user" | "assistant"
  content: string
  files?: string[]
  isStreaming?: boolean
  timestamp?: string
}

type ProjectVisibility = "public" | "private" | "link-only"

interface Project {
  id: string
  name?: string
  prompt: string
  model?: string
  status: "pending" | "generating" | "complete" | "error"
  files?: GeneratedFile[]
  sandboxUrl?: string
  sandboxId?: string
  createdAt: Date
  messages?: Message[]
  error?: string
  tokensUsed?: number
  githubRepoUrl?: string
  githubRepoFullName?: string
  githubSyncedAt?: Date | { toDate: () => Date }
  suggestsBackend?: boolean
  supabaseUrl?: string
  visibility?: ProjectVisibility
  ownerId?: string
  editorIds?: string[]
}

// File tree structure
interface FileNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isGenerating?: boolean
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso)
    const h = d.getHours()
    const m = d.getMinutes()
    const day = d.getDate()
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const month = months[d.getMonth()]
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} • ${day} ${month}`
  } catch {
    return ""
  }
}

function extractAgentMessage(content: string): { agentMessage: string | null; contentWithoutAgent: string } {
  const start = "===AGENT_MESSAGE==="
  const end = "===END_AGENT_MESSAGE==="
  const i = content.indexOf(start)
  const j = content.indexOf(end, i)
  if (i === -1 || j === -1) return { agentMessage: null, contentWithoutAgent: content }
  const agentMessage = content.slice(i + start.length, j).trim()
  const contentWithoutAgent = content.slice(0, i).trim() + "\n" + content.slice(j + end.length).trim()
  return { agentMessage: agentMessage || null, contentWithoutAgent }
}

function buildFileTree(files: GeneratedFile[]): FileNode[] {
  const root: { [key: string]: FileNode | { [key: string]: FileNode } } = {}

  files.forEach(file => {
    const parts = file.path.split("/")
    let current: any = root

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const currentPath = parts.slice(0, index + 1).join("/")

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : {},
          content: isFile ? file.content : undefined,
          isGenerating: isFile ? file.isGenerating : undefined,
        }
      }

      if (!isFile && current[part].children) {
        current = current[part].children
      }
    })
  })

  const convertToArray = (obj: { [key: string]: FileNode }): FileNode[] => {
    return Object.values(obj).map(node => ({
      ...node,
      children: node.children ? convertToArray(node.children as unknown as { [key: string]: FileNode }) : undefined,
    })).sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return convertToArray(root as { [key: string]: FileNode })
}

function FileTreeItem({ 
  node, 
  selectedFile, 
  onSelect,
  depth = 0 
}: { 
  node: FileNode
  selectedFile: GeneratedFile | null
  onSelect: (file: GeneratedFile) => void
  depth?: number
}) {
  const [isOpen, setIsOpen] = useState(depth < 2)
  const isSelected = selectedFile?.path === node.path

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-sm rounded hover:bg-zinc-800/50 transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-slate-400" />
          ) : (
            <FolderIcon className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-slate-300 truncate">{node.name}</span>
        </button>
        <AnimatePresence>
          {isOpen && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children.map(child => (
                <FileTreeItem
                  key={child.path}
                  node={child}
                  selectedFile={selectedFile}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase()
    const colors: Record<string, string> = {
      tsx: "text-slate-400",
      ts: "text-slate-400",
      jsx: "text-slate-400",
      js: "text-slate-400",
      css: "text-slate-400",
      scss: "text-slate-400",
      json: "text-slate-400",
      md: "text-slate-400",
      yml: "text-slate-400",
      yaml: "text-slate-400",
      env: "text-slate-400",
      txt: "text-slate-400",
      html: "text-slate-400",
      svg: "text-slate-400",
      png: "text-slate-400",
      jpg: "text-slate-400",
      jpeg: "text-slate-400",
      gif: "text-slate-400",
    }
    return colors[ext || ""] || "text-slate-400"
  }

  return (
    <motion.button
      type="button"
      initial={node.isGenerating ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onSelect({ path: node.path, content: node.content || "" })}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1 text-sm rounded transition-colors",
        isSelected 
          ? "bg-zinc-800 text-slate-100" 
          : "text-slate-400 hover:bg-zinc-800/50 hover:text-slate-300"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <div className="w-3.5 h-3.5" />
      {node.isGenerating ? (
        <div className="w-4 h-4 relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-spin" />
          <div className="absolute inset-0.5 rounded-full bg-zinc-900" />
        </div>
      ) : (
        <FileCode className={cn("w-4 h-4", getFileIcon(node.name))} />
      )}
      <span className="truncate">{node.name}</span>
      {node.isGenerating && (
        <motion.span 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ml-auto text-[10px] text-slate-500 flex items-center gap-1"
        >
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" />
          writing...
        </motion.span>
      )}
    </motion.button>
  )
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  const langMap: { [key: string]: string } = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    sass: "scss",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    env: "plaintext",
    txt: "plaintext",
    svg: "xml",
    png: "plaintext",
    jpg: "plaintext",
    jpeg: "plaintext",
    gif: "plaintext",
  }
  return langMap[ext || ""] || "plaintext"
}

// Agentic Chat Message Component with Modern UI
function ChatMessage({
  message,
  isLast,
  onEdit,
  isEditing,
  onEditSubmit,
  onCancelEdit,
  projectFiles,
  setSelectedFile,
  setActiveTab,
}: {
  message: Message
  isLast: boolean
  onEdit?: () => void
  isEditing?: boolean
  onEditSubmit?: (newContent: string) => void
  onCancelEdit?: () => void
  projectFiles?: GeneratedFile[]
  setSelectedFile?: (file: GeneratedFile) => void
  setActiveTab?: (tab: "preview" | "code") => void
}) {
  const isUser = message.role === "user"
  const [editContent, setEditContent] = useState(message.content)
  const [isCopied, setIsCopied] = useState(false)
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      // noop
    }
  }

  const handleEditSubmit = () => {
    if (editContent.trim() && onEditSubmit) {
      onEditSubmit(editContent.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEditSubmit()
    }
    if (e.key === 'Escape' && onCancelEdit) {
      onCancelEdit()
    }
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : ""
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
        isUser 
          ? "bg-zinc-700" 
          : ""
      )}>
        {isUser ? (
          <User className="w-5 h-5 text-zinc-300" />
        ) : (
          <div className="w-10 h-10 flex items-center justify-center">
            <Spline scene="https://prod.spline.design/Tv8aivWh19CpJJNm/scene.splinecode" />
          </div>
        )}
      </div>
      <div className={cn(
        "flex-1 min-w-0",
        isUser ? "text-right" : ""
      )}>
        {isUser && (
          <div className="inline-block max-w-[85%] sm:max-w-[75%] ml-auto group">
            {/* Edit Mode */}
            {isEditing ? (
              <div className="bg-zinc-700 rounded-2xl rounded-tr-sm p-2.5 sm:p-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent text-zinc-100 text-xs sm:text-sm resize-none outline-none placeholder:text-zinc-400"
                  rows={3}
                  placeholder="Edit your message..."
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5 sm:gap-2 mt-2">
                  <button
                    onClick={onCancelEdit}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    disabled={!editContent.trim()}
                    className="px-2.5 py-1 text-xs bg-zinc-600 text-zinc-100 rounded hover:bg-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              /* Normal Display Mode */
              <div>
                <div className="rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 bg-zinc-700 text-zinc-100 rounded-tr-sm">
                  <p className="text-xs sm:text-sm whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Action Buttons BELOW the bubble (ChatGPT-style) */}
                {(onEdit || message.content) && (
                  <div className="mt-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onEdit()
                        }}
                        className="h-6 sm:h-7 px-1.5 sm:px-2 rounded-lg bg-zinc-800/70 border border-zinc-700/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors inline-flex items-center gap-1.5"
                        title="Edit"
                      >
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="text-xs"></span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleCopy()
                      }}
                      className="h-6 sm:h-7 px-1.5 sm:px-2 rounded-lg bg-zinc-800/70 border border-zinc-700/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors inline-flex items-center gap-1.5"
                      title="Copy"
                    >
                      {isCopied ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                      <span className="text-xs"></span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {!isUser && message.content && (
          <div className="bg-zinc-800/50 rounded-2xl rounded-tl-sm border border-zinc-700/50 p-3 sm:p-4 mb-3">
            {(message as Message & { timestamp?: string }).timestamp && (
              <p className="text-[11px] sm:text-xs text-zinc-500 mb-2">
                {formatMessageTime((message as Message & { timestamp?: string }).timestamp!)}
              </p>
            )}
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-zinc-700 flex items-center justify-center">
                <Lightbulb className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-300" />
              </div>
              <span className="text-xs font-medium text-zinc-400">AI Response</span>
            </div>
            <div className="space-y-2">
              {message.isStreaming ? (
                <TextShimmer className="text-xs sm:text-sm text-zinc-300">{message.content}</TextShimmer>
              ) : (
                <p className="text-xs sm:text-sm whitespace-pre-wrap text-zinc-300">{message.content}</p>
              )}
              {message.files && message.files.length > 0 && (
                <div className="mt-3 p-2 sm:p-3 rounded-lg bg-zinc-900/50 border border-zinc-700/30">
                  <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <FileCode className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-400" />
                    <span className="text-xs font-medium text-zinc-400">Generated Files</span>
                    <span className="ml-auto text-xs text-zinc-500">{message.files.length} files</span>
                  </div>
                  <div className="space-y-1">
                    {message.files.map((file, index) => {
                      const isDirectory = file.includes('/')
                      const fileName = file.split('/').pop() || file
                      const directory = file.includes('/') ? file.split('/').slice(0, -1).join('/') : null
                      
                      const handleFileClick = () => {
                        // Find the file in the project files
                        const projectFile = projectFiles?.find((f: GeneratedFile) => f.path === file)
                        if (projectFile && setSelectedFile) {
                          setSelectedFile(projectFile)
                          // Only switch to code tab if on desktop (check if lg breakpoint is active)
                          if (setActiveTab && typeof window !== 'undefined') {
                            const isDesktop = window.matchMedia('(min-width: 1024px)').matches
                            if (isDesktop) {
                              setActiveTab("code")
                            }
                          }
                        }
                      }
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="group"
                        >
                          <div 
                            className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:border-zinc-600/50 hover:bg-zinc-800/70 transition-all duration-200 cursor-pointer hover:shadow-sm"
                            onClick={handleFileClick}
                          >
                            {isDirectory && directory && (
                              <div className="flex items-center gap-1 text-zinc-500">
                                <FolderOpen className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                <span className="text-xs">{directory}</span>
                                <div className="w-px h-2.5 sm:h-3 bg-zinc-600" />
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-zinc-700 flex items-center justify-center">
                                <FileCode className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-300" />
                              </div>
                              <span className="text-xs sm:text-sm text-zinc-300 font-mono truncate">{fileName}</span>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {isUser && message.files && message.files.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2"
          >
            <div className="flex items-center gap-2 mb-2 justify-end">
              <span className="text-xs font-medium text-zinc-500">Attached Files</span>
              <span className="text-xs text-zinc-600">{message.files.length}</span>
            </div>
            <div className="space-y-1">
              {message.files.map((file, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex justify-end"
                >
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:border-zinc-600/50 hover:bg-zinc-800/70 transition-all duration-200 max-w-[85%]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-6 h-6 rounded bg-zinc-700 flex items-center justify-center">
                        <FileCode className="w-3 h-3 text-zinc-300" />
                      </div>
                      <span className="text-sm text-zinc-300 font-mono truncate">{file}</span>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button className="p-1 rounded hover:bg-zinc-700 transition-colors duration-150">
                        <Copy className="w-3 h-3 text-zinc-400 hover:text-zinc-300" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function ProjectContent() {
  const params = useParams()
  const projectId = params?.id as string

  const { user, userData, hasTokens, remainingTokens, updateTokensUsed, loading: authLoading } = useAuth()
  
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"preview" | "code">("code")
  const [chatInput, setChatInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingFiles, setGeneratingFiles] = useState<GeneratedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [previewPath, setPreviewPath] = useState("/")
  const [previewPathDraft, setPreviewPathDraft] = useState("/")
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isPreviewReady, setIsPreviewReady] = useState(false)
  const [currentGeneratingFile, setCurrentGeneratingFile] = useState<string | null>(null)
  const [isSandboxLoading, setIsSandboxLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState("")
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
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
  const [editingTarget, setEditingTarget] = useState<{ kind: "prompt" } | { kind: "message"; index: number } | null>(null)
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat")
  const [deployOpen, setDeployOpen] = useState(false)
  const [integrationsOpen, setIntegrationsOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<"all" | "github" | "netlify" | "supabase" | "vars">("all")
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
  const [netlifyDeployState, setNetlifyDeployState] = useState<string | null>(null)
  const [netlifyLogUrl, setNetlifyLogUrl] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
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
  const lastAutoPreviewSignatureRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const getAuthHeader = useCallback(async () => {
    if (!user) throw new Error("Not authenticated")
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }, [user])

  const router = useRouter()

  const duplicateProject = async () => {
    if (!project || !user) return
    try {
      const projectData = { ...project }
      delete (projectData as any).id
      projectData.createdAt = serverTimestamp()
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
      projectData.createdAt = serverTimestamp()
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
  }, [getAuthHeader, projectId, refreshNetlifyStatus])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [project?.messages, isGenerating, scrollToBottom])

  useEffect(() => {
    if (!deployOpen) return
    refreshNetlifyStatus()
  }, [deployOpen, refreshNetlifyStatus])

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
  }, [projectId, project?.files?.length, getAuthHeader])

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
  }, [integrationsOpen, selectedIntegration, projectId, getAuthHeader])

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
  }, [projectId, envFormEntries, getAuthHeader])

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
  }, [deployOpen, deployLinks?.deployId, getAuthHeader])

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
    const path = previewPath.startsWith("/") ? previewPath : `/${previewPath}`
    const url = `${base}${path}`
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}__reload=${previewReloadNonce}`
  }, [project?.sandboxUrl, previewPath, previewReloadNonce])

  const handlePreviewNavigate = useCallback((nextPath: string) => {
    const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`
    setPreviewPath(normalized)
    setPreviewPathDraft(normalized)
  }, [])

  const handlePreviewReload = useCallback(() => {
    setPreviewReloadNonce(Date.now())
    setPreviewKey((k) => k + 1)
  }, [])

  // Helper function to get message ID for comparison
  const getMessageId = (message: Message, index?: number) => {
    if (index === 0) return 'initial'
    return `${message.role}-${message.content.substring(0, 20)}`
  }

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
  useEffect(() => {
    if (!projectId) return
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
          if (data.files && data.files.length > 0 && !selectedFile) {
            setSelectedFile(data.files[0])
          }
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

    // No user: fetch via API (allows public/link-only view)
    setLoading(true)
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
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
        if (data.files?.length > 0 && !selectedFile) {
          setSelectedFile(data.files[0])
        }
        if (projectData.sandboxUrl && projectData.status === "complete") {
          setActiveTab("preview")
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId, user, authLoading, selectedFile])

  // Claim legacy projects: set ownerId when current user opens a project with no owner
  useEffect(() => {
    if (!projectId || !user || !project || project.ownerId) return
    const projectRef = doc(db, "projects", projectId)
    updateDoc(projectRef, { ownerId: user.uid, visibility: "private" }).then(() => {
      setProject((p) => (p ? { ...p, ownerId: user.uid, visibility: "private" } : p))
    }).catch(() => {})
  }, [projectId, user?.uid, project?.id, project?.ownerId])

  // Start generation on mount if pending
  useEffect(() => {
    if (project?.status === "pending" && !isGenerating) {
      generateCode(project.prompt, project.model)
    }
  }, [project?.status])

  /** Merge model output (diffs or full files) into existing project; applies patches when content is unified diff. */
  const mergeWithExistingFiles = (
    existingFiles: GeneratedFile[],
    blocks: GeneratedFile[]
  ): GeneratedFile[] => {
    const result = existingFiles.map(f => ({ ...f }))

    for (const block of blocks) {
      const path = block.path
      const content = block.content.trim()
      const isUnifiedDiff = content.startsWith("--- a/")

      if (isUnifiedDiff) {
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

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    setGeneratingFiles([])
    setAgentStatus("Analyzing your request...")
    setReasoningSteps(["Analyzing your request and understanding scope."])

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
        throw new Error(errorData.error || `Generation failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ""
      let lastFileCount = 0
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
          setReasoningSteps(prev => [...prev, `Creating file: ${newFile.path}`])
          lastFileCount = parsedBlocks.length
        }

        // Update generating files with current state
        setGeneratingFiles(allFiles.map((f, i) => ({
          ...f,
          isGenerating: i === allFiles.length - 1
        })))

        // Auto-select first file
        if (allFiles.length > 0 && !selectedFile) {
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
      
      const tokensUsed = Math.floor(fullContent.length / 4)
      const suggestsBackend = /===META:\s*suggestsBackend\s*=\s*true\s*===/i.test(fullContent)

      setAgentStatus("Finalizing...")
      setReasoningSteps(prev => [...prev, "Finalizing and preparing preview."])

      // Update tokens used
      await updateTokensUsed(tokensUsed)

      // Build messages: existing + optional agent message (if we added it) + completion message
      const baseMessages = project.messages || []
      const withAgent = agentMessage && agentMessageTimestamp
        ? [...baseMessages, { role: "assistant" as const, content: agentMessage, timestamp: agentMessageTimestamp }]
        : baseMessages
      const completionMessage = { role: "assistant" as const, content: `Generated ${finalFiles.length} files successfully. You can view them in the code panel.`, files: finalFiles.map(f => f.path) }

      // Update project with files and messages
      await updateDoc(projectRef, {
        status: "complete",
        files: finalFiles,
        tokensUsed: (project.tokensUsed || 0) + tokensUsed,
        ...(suggestsBackend ? { suggestsBackend: true } : {}),
        messages: [...withAgent, completionMessage]
      })

      if (finalFiles.length > 0) {
        setSelectedFile(finalFiles[0])
      }

      // Create E2B sandbox (auto-start)
      await createSandbox(finalFiles)

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        await updateDoc(projectRef, { status: "pending" })
      } else {
        console.error("Generation error:", error)
        await updateDoc(projectRef, {
          status: "error",
          error: error instanceof Error ? error.message : "Generation failed"
        })
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

  const createSandbox = async (files: GeneratedFile[]) => {
    if (!project) return

    // Kill existing sandbox if any to prevent concurrent sandboxes
    if (project.sandboxId) {
      try {
        await fetch("/api/sandbox", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: project.sandboxId }),
        })
      } catch (e) {
        console.warn("Failed to kill existing sandbox:", e)
      }
    }

    setIsSandboxLoading(true)
    setBuildError(null)
    setBuildLogs({})
    setBuildFailureCategory(undefined)
    setBuildFailureReason(null)
    setLogsTail("")
    setBuildSteps([
      { key: "write", label: "Writing files", status: "success", startedAt: Date.now() - 1000, finishedAt: Date.now() - 500 },
      { key: "install", label: "Installing dependencies", status: "idle" },
      { key: "dev", label: "Starting dev server", status: "idle" },
    ])
    const projectRef = doc(db, "projects", projectId)
    
    // Clear old sandboxUrl so timeline is shown instead of old iframe
    try {
      await updateDoc(projectRef, {
        sandboxUrl: undefined,
        sandboxId: undefined,
      })
    } catch (e) {
      console.warn("Failed to clear old sandbox URL:", e)
    }

    try {
      const authHeader = await getAuthHeader()
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ files, projectId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          setLogsTail(prev => prev + chunk)

          // Process each line
          const lines = chunk.split('\n').filter(line => line.trim())
          for (const line of lines) {
            try {
              const data = JSON.parse(line)
              
              if (data.type === 'step') {
                setBuildSteps(prev => prev.map(step => 
                  step.key === data.step 
                    ? { 
                        ...step, 
                        status: data.status, 
                        message: data.message,
                        startedAt: data.status === 'running' ? Date.now() : step.startedAt,
                        finishedAt: data.status === 'success' || data.status === 'failed' ? Date.now() : step.finishedAt
                      }
                    : step
                ))
              } else if (data.type === 'error') {
                setBuildError(data.error)
                setBuildLogs(prev => ({ ...prev, ...(data.logs || {}) }))
                setBuildFailureCategory(data.failureCategory)
                setBuildFailureReason(data.failureReason)
                
                // Update step status to failed
                setBuildSteps(prev => prev.map(step => 
                  step.key === (data.failureCategory === 'deps' ? 'install' : 'dev')
                    ? { ...step, status: 'failed', finishedAt: Date.now() }
                    : step
                ))
              } else if (data.type === 'success') {
                await updateDoc(projectRef, {
                  sandboxUrl: data.url,
                  sandboxId: data.sandboxId,
                })
                
                // Mark all steps as success
                const now = Date.now()
                setBuildSteps(prev => prev.map((step, index) => ({
                  ...step,
                  status: 'success' as const,
                  finishedAt: now - (prev.length - index - 1) * 1000
                })))
                
                // Hide build timeline and show iframe
                setIsSandboxLoading(false)
                
                // Auto-switch to preview tab after successful build
                setActiveTab("preview")
              }
            } catch (e) {
              console.warn("Failed to parse sandbox stream data:", e)
            }
          }
        }
      }
    } catch (error) {
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
      setIsSandboxLoading(false)
    }
  }

  useEffect(() => {
    if (!project) return
    if (project.sandboxUrl) return
    if (!project.files || project.files.length === 0) return
    if (project.status !== "complete") return
    if (isSandboxLoading || isGenerating) return
    if (buildError) return

    const signature = `${project.id}:${project.files.length}:${project.files[0]?.path || ""}:${project.files[project.files.length - 1]?.path || ""}`
    if (lastAutoPreviewSignatureRef.current === signature) return
    lastAutoPreviewSignatureRef.current = signature

    createSandbox(project.files)
  }, [project, isSandboxLoading, isGenerating, buildError])

  const handleSendMessage = async (submittedValue?: string, submittedModel?: string) => {
    const nextMessage = (submittedValue ?? chatInput).trim()
    if (!nextMessage || !project || isGenerating) return

    if (remainingTokens < 1000) {
      alert("You don't have enough tokens. Please upgrade your plan.")
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
  const fileTree = buildFileTree(displayFiles)
  
  // Prefer explicit project name; fall back to prompt-derived title
  const displayProjectName = project?.name || project?.prompt?.split(' ').slice(0, 3).join(' ') || 'Untitled Project'

  // Calculate tokens limit based on remaining tokens
  const tokensLimit = userData ? userData.tokenUsage.used + userData.tokenUsage.remaining : 0

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
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 flex flex-col min-h-0 touch-pan-y overscroll-none">
      {/* Top Header Bar - modern glass bar */}
      <div className="h-auto lg:h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2.5 lg:py-0 border-b border-zinc-800/80 bg-zinc-900/95 backdrop-blur-xl flex-shrink-0 gap-3 shadow-[0_1px_0_0_rgba(255,255,255,0.03)] safe-area-inset-top">
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
              BuilderStudio
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
                        className="h-full rounded-full transition-all duration-300 shadow-sm bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500"
                        style={{ width: userData && tokensLimit > 0 ? `${Math.min(100, (userData.tokenUsage.used / tokensLimit) * 100)}%` : '0%' }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Used: {userData ? userData.tokenUsage.used.toLocaleString() : '—'}</span>
                      <span>Remaining: {userData ? userData.tokenUsage.remaining.toLocaleString() : '—'}</span>
                    </div>
                  </div>

                  {/* Upgrade Button */}
                  <Link
                    href="/#pricing"
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
        <div className="hidden lg:flex items-center gap-2 overflow-x-auto lg:overflow-visible max-w-[46vw] sm:max-w-[52vw] lg:max-w-none custom-scrollbar">
          <button onClick={handleOpenIntegrations} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center">
            <Plug className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-blue-400 transition-colors" />
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
      <div className="flex-1 min-h-0 flex flex-col">
        {/* AI-suggested backend: Connect Supabase? banner */}
        {project?.suggestsBackend && !project?.supabaseUrl && !suggestBackendDismissed && (
          <div className="flex-shrink-0 px-3 sm:px-4 py-2.5 border-b border-emerald-500/20 bg-emerald-950/30 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-emerald-400" />
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
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),28rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Deploy to Netlify</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Deploy this project to your Netlify account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
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
                      {isDeploying ? "Deploying..." : "Deploy"}
                    </Button>
                  )}
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
                  <div className="text-xs text-zinc-400">Links</div>
                  <div className="space-y-1 text-sm">
                    {deployLinks.siteUrl && (
                      <a className="text-emerald-300 hover:underline break-all" href={deployLinks.siteUrl} target="_blank" rel="noreferrer">
                        {deployLinks.siteUrl}
                      </a>
                    )}
                    {deployLinks.deployUrl && (
                      <a className="text-zinc-200 hover:underline break-all" href={deployLinks.deployUrl} target="_blank" rel="noreferrer">
                        {deployLinks.deployUrl}
                      </a>
                    )}
                    {deployLinks.adminUrl && (
                      <a className="text-zinc-400 hover:underline break-all" href={deployLinks.adminUrl} target="_blank" rel="noreferrer">
                        {deployLinks.adminUrl}
                      </a>
                    )}
                    {deployLinks.adminUrl && deployLinks.deployId && (() => {
                      try {
                        const u = new URL(deployLinks.adminUrl as string)
                        u.pathname = `${u.pathname.replace(/\/$/, "")}/deploys/${deployLinks.deployId}`
                        const href = u.toString()
                        return (
                          <a className="text-zinc-400 hover:underline break-all" href={href} target="_blank" rel="noreferrer">
                            {href}
                          </a>
                        )
                      } catch {
                        return null
                      }
                    })()}
                    {netlifyLogUrl && (
                      <a className="text-zinc-400 hover:underline break-all" href={netlifyLogUrl} target="_blank" rel="noreferrer">
                        {netlifyLogUrl}
                      </a>
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
            </div>
          </DialogContent>
        </Dialog>

        {/* Integrations modal - wider, left nav + right content */}
        <Dialog open={integrationsOpen} onOpenChange={(open) => { setIntegrationsOpen(open); if (!open) setSupabaseConnectOpen(false) }}>
          <DialogContent className="bg-zinc-950/98 border border-zinc-800/80 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[min(calc(100vw-1.5rem),48rem)] sm:max-w-3xl md:max-w-4xl w-[95vw] p-0 overflow-hidden flex flex-col max-h-[85vh]">
            <DialogHeader className="flex-shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-zinc-800/60">
              <DialogTitle className="text-zinc-100 text-lg font-semibold">Integrations</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm mt-0.5">
                Connect services to sync, deploy, and add a backend to this project.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left sidebar - integration options */}
              <nav className="flex-shrink-0 w-44 sm:w-52 border-r border-zinc-800/60 bg-zinc-900/30 py-3 flex flex-col">
                <div className="px-2 sm:px-3 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("all")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                      selectedIntegration === "all"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <LayoutGrid className="w-4 h-4 text-zinc-300" />
                    </div>
                    <span className="text-sm font-medium block">All</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("github")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                      selectedIntegration === "github"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Github className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block">GitHub</span>
                      {githubConnected === true && (
                        <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("netlify")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                      selectedIntegration === "netlify"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Rocket className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block">Netlify</span>
                      {netlifyConnected === true && (
                        <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("supabase")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                      selectedIntegration === "supabase"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block">Supabase</span>
                      {supabaseConnected && (
                        <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration("vars")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                      selectedIntegration === "vars"
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4 text-zinc-300" />
                    </div>
                    <span className="text-sm font-medium block">Vars</span>
                  </button>
                </div>
                <div className="mt-auto px-2 sm:px-3 pt-3 border-t border-zinc-800/60">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">More coming</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Vercel, Stripe, and others soon.</p>
                </div>
              </nav>
              {/* Right content - selected integration */}
              <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-5 sm:p-6">
                {selectedIntegration === "all" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                          <Github className="w-6 h-6 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">GitHub</h3>
                          <p className="text-sm text-zinc-500 mt-1">Create a repo and sync your project code. Re-sync whenever you make changes.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {githubConnected === false ? (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectGitHub}>
                                <Github className="w-3.5 h-3.5 mr-2" /> Connect GitHub
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
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0">
                          <Rocket className="w-6 h-6 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">Netlify</h3>
                          <p className="text-sm text-zinc-500 mt-1">Deploy this project to Netlify for a live URL. One-click deploy after connecting your account.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!netlifyConnected ? (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectNetlify}>Connect Netlify</Button>
                            ) : (
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployOpen(true) }}>Deploy to Netlify</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <Database className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-zinc-100">Supabase</h3>
                          <p className="text-sm text-zinc-500 mt-1">Add a backend: auth, database, and real-time. We’ll inject the Supabase client and a starter SQL migration.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!supabaseConnected ? (
                              <Button type="button" size="sm" className="h-9 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80" onClick={() => setSupabaseConnectOpen(true)}>
                                <img src="/Images/connect-supabase-light.svg" alt="Connect with Supabase" className="h-7 w-auto" />
                              </Button>
                            ) : (
                              <>
                                <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleInjectSupabase} disabled={supabaseInjecting}>
                                  {supabaseInjecting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
                                  {supabaseInjecting ? "Adding…" : "Add client & migration"}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50" onClick={() => updateDoc(doc(db, "projects", projectId), { supabaseUrl: deleteField(), supabaseAnonKey: deleteField(), supabaseServiceRoleKey: deleteField(), supabaseConnectedAt: deleteField() })}>Disconnect</Button>
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
                        <p className="text-sm text-zinc-500 mt-1">Create a repo and sync your project code. Re-sync whenever you make changes so your repository stays up to date.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {githubConnected === false ? (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectGitHub}>
                              <Github className="w-3.5 h-3.5 mr-2" /> Connect GitHub
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
                        <p className="text-sm text-zinc-500 mt-1">Deploy this project to Netlify for a live URL. One-click deploy after connecting your account.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!netlifyConnected ? (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleConnectNetlify}>Connect Netlify</Button>
                          ) : (
                            <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={() => { setIntegrationsOpen(false); setDeployOpen(true) }}>Deploy to Netlify</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {selectedIntegration === "supabase" && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Database className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-zinc-100">Supabase</h3>
                        <p className="text-sm text-zinc-500 mt-1">Add a backend: auth, database, and real-time. We’ll inject the Supabase client and a starter SQL migration into your project.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!supabaseConnected ? (
                            <Button type="button" size="sm" className="h-9 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200/80" onClick={() => setSupabaseConnectOpen(true)}>
                              <img src="/Images/connect-supabase-light.svg" alt="Connect with Supabase" className="h-7 w-auto" />
                            </Button>
                          ) : (
                            <>
                              <Button type="button" size="sm" className="h-9 px-4 text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white border-0" onClick={handleInjectSupabase} disabled={supabaseInjecting}>
                                {supabaseInjecting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
                                {supabaseInjecting ? "Adding…" : "Add client & migration"}
                              </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-9 px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50" onClick={() => updateDoc(doc(db, "projects", projectId), { supabaseUrl: deleteField(), supabaseAnonKey: deleteField(), supabaseServiceRoleKey: deleteField(), supabaseConnectedAt: deleteField() })}>Disconnect</Button>
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
                        <h3 className="text-base font-semibold text-zinc-100">Environment variables</h3>
                        <p className="text-sm text-zinc-500 mt-1">Add API keys and env vars for preview. Values are encrypted and only injected into the sandbox; they are never shown after save.</p>
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
                                    placeholder="Variable name"
                                    value={entry.name}
                                    onChange={(e) =>
                                      setEnvFormEntries((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p))
                                      )
                                    }
                                    className="flex-1 min-w-[120px] rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                  />
                                  <input
                                    type="password"
                                    placeholder="Value"
                                    value={entry.value}
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
                                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add variable
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
                              <p className="mt-3 text-[11px] text-zinc-500">You have {envVarNames.length} variable{envVarNames.length !== 1 ? "s" : ""} set. Re-run preview to use them.</p>
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
                  placeholder="https://xxxxx.supabase.co"
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
                <Button type="submit" className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30">Connect</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Mobile layout (stacked). Desktop/Laptop layout below remains unchanged and is lg+ only. */}
        <div className="lg:hidden h-full flex flex-col min-h-0 overflow-hidden">
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
              <div className="h-full flex flex-col bg-zinc-900/30 min-h-0">
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 chat-scrollbar overscroll-contain">
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
                    <div className="flex flex-col gap-2">
                      <ThinkingBar
                        text={agentStatus || "Thinking..."}
                        stopLabel="Skip thinking"
                        onStop={() => abortControllerRef.current?.abort()}
                        onClick={undefined}
                      />
                      <Reasoning isStreaming={true}>
                        <ReasoningTrigger>Show reasoning</ReasoningTrigger>
                        <ReasoningContent className="ml-2 border-l-2 border-l-slate-200 px-2 pb-1 dark:border-l-slate-700">
                          <div className="space-y-1">
                            {reasoningSteps.length > 0
                              ? reasoningSteps.map((step, i) => (
                                  <div key={i} className="text-zinc-400">
                                    {i + 1}. {step}
                                  </div>
                                ))
                              : "Reasoning in progress..."}
                          </div>
                        </ReasoningContent>
                      </Reasoning>
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
                <div className="p-3 sm:p-4 border-t border-zinc-800/50 bg-zinc-950/40 backdrop-blur-sm flex-shrink-0 safe-area-inset-bottom">
                  <AnimatedAIInput
                    mode="chat"
                    compact
                    isLoading={isGenerating}
                    placeholder="Ask for changes or describe what to build..."
                    onSubmit={(value, model) => handleSendMessage(value, model)}
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
                <div className="flex-1 min-h-0 overflow-hidden">
                {project.sandboxUrl ? (
                  <iframe
                    key={previewKey}
                    src={getPreviewUrl() || project.sandboxUrl}
                    className="w-full h-full min-h-0 border-0"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ) : (
                  <div className="relative h-full">
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

        <ResizablePanelGroup direction="horizontal" className="h-full hidden lg:flex">
          {/* Chat Panel - modern glass */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full flex flex-col bg-zinc-900/30 backdrop-blur-sm border-r border-zinc-800/50">
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
                  <div className="flex flex-col gap-2">
                    <ThinkingBar
                      text={agentStatus || "Thinking..."}
                      stopLabel="Skip thinking"
                      onStop={() => abortControllerRef.current?.abort()}
                      onClick={undefined}
                    />
                    <Reasoning isStreaming={true}>
                      <ReasoningTrigger>Show reasoning</ReasoningTrigger>
                      <ReasoningContent className="ml-2 border-l-2 border-l-slate-200 px-2 pb-1 dark:border-l-slate-700">
                        <div className="space-y-1">
                          {reasoningSteps.length > 0
                            ? reasoningSteps.map((step, i) => (
                                <div key={i} className="text-zinc-400">
                                  {i + 1}. {step}
                                </div>
                              ))
                            : "Reasoning in progress..."}
                        </div>
                      </ReasoningContent>
                    </Reasoning>
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

                  {activeTab === "preview" && (
                    <div className="hidden md:flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                          disabled
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                          disabled
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                          onClick={handlePreviewReload}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2 min-w-0 rounded-xl bg-zinc-900/50 border border-zinc-800 px-3 py-1.5">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          project.sandboxUrl ? "bg-emerald-400/80" : "bg-zinc-600"
                        )} />

                        {/* v0-like path bar */}
                        <div className="flex items-center gap-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handlePreviewNavigate("/")}
                            className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors font-mono"
                            disabled={!project.sandboxUrl}
                          >
                          </button>
                          {previewPath
                            .split("/")
                            .filter(Boolean)
                            .map((seg, idx, arr) => {
                              const to = "/" + arr.slice(0, idx + 1).join("/")
                              return (
                                <div key={`${seg}-${idx}`} className="flex items-center gap-1 min-w-0">
                                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewNavigate(to)}
                                    className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors font-mono truncate max-w-[120px]"
                                    title={to}
                                    disabled={!project.sandboxUrl}
                                  >
                                    {seg}
                                  </button>
                                </div>
                              )
                            })}
                        </div>

                        <div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />
                        <form
                          className="min-w-0 flex-1"
                          onSubmit={(e) => {
                            e.preventDefault()
                            handlePreviewNavigate(previewPathDraft || "/")
                          }}
                        >
                          <input
                            value={previewPathDraft}
                            onChange={(e) => setPreviewPathDraft(e.target.value)}
                            disabled={!project.sandboxUrl}
                            className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-600 outline-none font-mono"
                            placeholder="/"
                          />
                        </form>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === "code" && selectedFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100 h-8 w-8 p-0 hover:bg-zinc-900"
                      onClick={copyCode}
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  )}
                  {activeTab === "preview" && project.sandboxUrl && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-zinc-400 hover:text-zinc-100 h-8 w-8 p-0 hover:bg-zinc-900"
                        onClick={() => window.open(project.sandboxUrl, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </>
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
                    <div className="flex-1 min-h-0 overflow-hidden">
                    {project.sandboxUrl ? (
                      <iframe
                        key={previewKey}
                        src={getPreviewUrl() || project.sandboxUrl}
                        className="w-full h-full border-0"
                        title="Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      />
                    ) : (
                      <div className="relative h-full">
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
                  <div className="h-full flex min-w-0">
                    {/* File Tree - modern sidebar */}
                    <div className="w-56 flex-shrink-0 border-r border-zinc-800/50 bg-gradient-to-b from-zinc-950/90 to-zinc-900/70 overflow-y-auto custom-scrollbar shadow-inner backdrop-blur-sm">
                      <div className="p-2.5">
                        <div className="flex items-center justify-between px-2 py-2.5">
                          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Files
                          </span>
                          {isGenerating && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                              generating
                            </span>
                          )}
                        </div>
                        {fileTree.length > 0 ? (
                          <div className="space-y-0.5">
                            {fileTree.map(node => (
                              <FileTreeItem
                                key={node.path}
                                node={node}
                                selectedFile={selectedFile}
                                onSelect={setSelectedFile}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="px-2 py-8 text-center">
                            <FileCode className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                            <p className="text-zinc-600 text-xs">No files yet</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Monaco Editor */}
                    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#1e1e1e] to-[#1a1a1a]">
                      {selectedFile ? (
                        <>
                          <div className="h-10 border-b border-zinc-800/50 flex items-center px-4 bg-gradient-to-r from-zinc-900/50 to-zinc-950/50 backdrop-blur-sm shadow-sm">
                            <FileCode className={cn("w-4 h-4 mr-2", getLanguageFromPath(selectedFile.path).includes("typescript") ? "text-zinc-400" : "text-zinc-400")} />
                            <span className="text-sm text-zinc-400">{selectedFile.path}</span>
                          </div>
                          <div className="flex-1">
                            <Editor
                              height="100%"
                              language={getLanguageFromPath(selectedFile.path)}
                              value={selectedFile.content}
                              theme="vs-dark"
                              options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: "on",
                                scrollBeyondLastLine: false,
                                wordWrap: "on",
                                automaticLayout: true,
                                padding: { top: 16 },
                                renderLineHighlight: "none",
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                overviewRulerBorder: false,
                                scrollbar: {
                                  verticalScrollbarSize: 8,
                                  horizontalScrollbarSize: 8,
                                },
                              }}
                            />
                          </div>
                        </>
                        ) : (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                              <FileCode className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                              <p className="text-zinc-500 text-sm">Select a file to view</p>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

export default function ProjectPage() {
  return <ProjectContent />
}
