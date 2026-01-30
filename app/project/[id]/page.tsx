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
import { doc, getDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp } from "firebase/firestore"
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
  Search,
  Lightbulb,
  Target
} from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { Tool } from "@/components/prompt-kit/tool"
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
import { ProtectedRoute } from "@/components/auth/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { motion, AnimatePresence } from "framer-motion"
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
}

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

// Agent Status Component with Modern UI and Tools
function AgentStatus({ status, currentFile }: { status: string; currentFile?: string }) {
  const getStatusSteps = () => {
    if (status.includes("Analyzing")) {
      return [
        { icon: <Search className="w-4 h-4" />, title: "Analyzing your request", description: "Processing requirements and understanding scope" },
        { icon: <Lightbulb className="w-4 h-4" />, title: "Planning approach", description: "Identifying components and architecture" }
      ]
    }
    
    if (status.includes("Generating")) {
      return [
        { icon: <Lightbulb className="w-4 h-4" />, title: "Planning structure", description: "Designing component hierarchy" },
        { icon: <Target className="w-4 h-4" />, title: "Generating files", description: currentFile ? `Working on: ${currentFile}` : "Creating application files" }
      ]
    }
    
    if (status.includes("Finalizing")) {
      return [
        { icon: <Target className="w-4 h-4" />, title: "Finalizing project", description: "Reviewing code quality" },
        { icon: <Zap className="w-4 h-4" />, title: "Preparing preview", description: "Setting up development environment" }
      ]
    }
    
    return [
      { icon: <Search className="w-4 h-4" />, title: "Processing", description: status }
    ]
  }

  const getActiveTools = () => {
    if (status.includes("Analyzing")) {
      return [
        {
          type: "file_search" as const,
          state: "input-streaming" as const,
          input: {
            pattern: "*.tsx",
            directory: "/components",
          }
        },
        {
          type: "api_call" as const,
          state: "input-available" as const,
          input: {
            endpoint: "/api/project/templates",
            method: "GET",
          }
        }
      ]
    }
    
    if (status.includes("Generating")) {
      return [
        {
          type: "code_generation" as const,
          state: "processing" as const,
          input: {
            framework: "React/Next.js",
            language: "TypeScript",
            styling: "Tailwind CSS"
          }
        },
        {
          type: "file_search" as const,
          state: "output-available" as const,
          input: {
            pattern: currentFile || "*.tsx",
            directory: "/src"
          },
          output: {
            count: 1,
            data: [
              { path: currentFile || "src/components/App.tsx", status: "created" }
            ]
          }
        }
      ]
    }
    
    if (status.includes("Finalizing")) {
      return [
        {
          type: "deployment" as const,
          state: "input-available" as const,
          input: {
            environment: "development",
            port: 3000
          }
        }
      ]
    }
    
    return []
  }

  const steps = getStatusSteps()
  const tools = getActiveTools()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0 ring-2 ring-blue-500/20">
        <Sparkles className="w-4 h-4 text-white animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-zinc-800/30 rounded-2xl rounded-tl-sm p-4 border border-zinc-700/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-zinc-400">AI Assistant Working</span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="w-1 h-1 rounded-full bg-blue-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          </div>
          
          {/* Status Steps */}
          <div className="space-y-3 mb-4">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-700/30"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-100 mb-1">{step.title}</div>
                  <div className="text-xs text-zinc-400">
                    {step.description.includes(currentFile || '') ? (
                      <TextShimmer className="text-xs">{step.description}</TextShimmer>
                    ) : (
                      step.description
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Active Tools */}
          {tools.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Tools</div>
              {tools.map((tool, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                >
                  <Tool
                    className="w-full"
                    toolPart={tool}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function ProjectContent() {
  const params = useParams()
  const projectId = params?.id as string

  const { user, userData, hasTokens, remainingTokens, updateTokensUsed } = useAuth()
  
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
  const [netlifyConnected, setNetlifyConnected] = useState<boolean | null>(null)
  const [deployStep, setDeployStep] = useState<string>("")
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployLinks, setDeployLinks] = useState<{ siteUrl?: string | null; deployUrl?: string | null; adminUrl?: string | null; siteId?: string | null; deployId?: string | null } | null>(null)
  const [netlifyDeployState, setNetlifyDeployState] = useState<string | null>(null)
  const [netlifyLogUrl, setNetlifyLogUrl] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
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
    if (!project) return
    try {
      const projectData = { ...project }
      // remove id and timestamps to let Firestore create new
      delete (projectData as any).id
      projectData.createdAt = serverTimestamp()
      const col = collection(db, 'projects')
      const ref = await addDoc(col, projectData as any)
      // navigate to new project
      router.push(`/project/${ref.id}`)
    } catch (e) {
      console.error('Duplicate failed', e)
      alert('Failed to duplicate project')
    }
  }

  const remixProject = async () => {
    if (!project) return
    try {
      const projectData = { ...project }
      delete (projectData as any).id
      projectData.name = (projectData.name || 'Untitled Project') + ' (remix)'
      projectData.createdAt = serverTimestamp()
      const col = collection(db, 'projects')
      const ref = await addDoc(col, projectData as any)
      router.push(`/project/${ref.id}`)
    } catch (e) {
      console.error('Remix failed', e)
      alert('Failed to remix project')
    }
  }

  const handleOpenIntegrations = () => {
    router.push('/settings#integrations')
  }

  const handleOpenGitHub = () => {
    router.push('/settings#github')
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      alert('Project URL copied to clipboard')
    } catch (e) {
      console.error('Share failed', e)
      alert('Failed to copy link')
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

  // Fetch project data
  useEffect(() => {
    if (!projectId) return

    const projectRef = doc(db, "projects", projectId)
    
    const unsubscribe = onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        const projectData = { id: docSnap.id, ...data } as Project
        setProject(projectData)
        
        // Auto-switch to preview if project has sandbox URL and is complete
        if (projectData.sandboxUrl && projectData.status === "complete") {
          setActiveTab("preview")
        }
        
        if (data.files && data.files.length > 0 && !selectedFile) {
          setSelectedFile(data.files[0])
        }
      }
      setLoading(false)
    }, (error) => {
      console.error("Error fetching project:", error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [projectId, selectedFile])

  // Start generation on mount if pending
  useEffect(() => {
    if (project?.status === "pending" && !isGenerating) {
      generateCode(project.prompt, project.model)
    }
  }, [project?.status])

  const mergeDiffsWithExistingFiles = (
    existingFiles: GeneratedFile[],
    diffFiles: GeneratedFile[],
    newFiles: GeneratedFile[]
  ): GeneratedFile[] => {
    const result = [...existingFiles]
    
    // Apply diffs to existing files
    for (const diff of diffFiles) {
      const existingIndex = result.findIndex(f => f.path === diff.path)
      if (existingIndex !== -1) {
        // Apply diff to existing file (simplified - just replace content for now)
        result[existingIndex] = {
          ...result[existingIndex],
          content: diff.content
        }
      }
    }
    
    // Add completely new files
    for (const newFile of newFiles) {
      const exists = result.findIndex(f => f.path === newFile.path)
      if (exists === -1) {
        result.push(newFile)
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

  const parseDiffs = (content: string): GeneratedFile[] => {
    const files: GeneratedFile[] = []
    const diffRegex = /===FILE: (.+?)===\n--- a\/(.+?)\n\+\+\+ b\/(.+?)\n@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n([\s\S]*?)(?====END_FILE===|===FILE:|$)/g
    let match

    while ((match = diffRegex.exec(content)) !== null) {
      const path = match[1].trim()
      const diffContent = match[7].trim()
      files.push({ path, content: diffContent })
    }

    return files
  }

  const generateCode = async (prompt: string, model?: string) => {
    if (!project) return
    
    setIsGenerating(true)
    setGeneratingFiles([])
    setAgentStatus("Analyzing your request...")

    const projectRef = doc(db, "projects", projectId)
    await updateDoc(projectRef, { status: "generating" })

    try {
      setAgentStatus("Generating application structure...")
      
      // include Firebase ID token so server can authenticate and charge tokens
      const idToken = await user?.getIdToken()
      if (!idToken) {
        throw new Error("Not authenticated - please sign in")
      }
      
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: model || "GPT-4-1 Mini", idToken }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Generation failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ""
      let lastFileCount = 0

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        fullContent += chunk

        // Parse files from streaming content (handle both full files and diffs)
        const parsedFiles = parseStreamingFiles(fullContent)
        const diffFiles = parseDiffs(fullContent)
        
        // For follow-up prompts, we need to be smarter about file handling
        let allFiles: GeneratedFile[]
        if (project.files && project.files.length > 0) {
          // This is a follow-up - merge diffs with existing files
          allFiles = mergeDiffsWithExistingFiles(project.files, diffFiles, parsedFiles)
        } else {
          // This is initial generation
          allFiles = [...parsedFiles, ...diffFiles]
        }
        
        // Detect new files being generated
        if (parsedFiles.length > lastFileCount) {
          const newFile = parsedFiles[parsedFiles.length - 1]
          setCurrentGeneratingFile(newFile.path)
          setAgentStatus(`Creating ${newFile.path}...`)
          lastFileCount = parsedFiles.length
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

      // Final parse
      const parsedFiles = parseStreamingFiles(fullContent)
      const diffFiles = parseDiffs(fullContent)
      
      // For follow-up prompts, merge diffs with existing files, otherwise use new files
      let finalFiles: GeneratedFile[]
      if (project.files && project.files.length > 0) {
        // This is a follow-up prompt - merge diffs with existing files
        finalFiles = mergeDiffsWithExistingFiles(project.files, diffFiles, parsedFiles)
      } else {
        // This is initial generation - use all files
        finalFiles = [...parsedFiles, ...diffFiles]
      }
      
      const tokensUsed = Math.floor(fullContent.length / 4)

      setAgentStatus("Finalizing...")

      // Update tokens used
      await updateTokensUsed(tokensUsed)

      // Update project with files
      await updateDoc(projectRef, {
        status: "complete",
        files: finalFiles,
        tokensUsed: (project.tokensUsed || 0) + tokensUsed,
        messages: [
          ...(project.messages || []),
          { role: "assistant", content: `Generated ${finalFiles.length} files successfully. You can view them in the code panel.`, files: finalFiles.map(f => f.path) }
        ]
      })

      if (finalFiles.length > 0) {
        setSelectedFile(finalFiles[0])
      }

      // Create E2B sandbox (auto-start)
      await createSandbox(finalFiles)

    } catch (error) {
      console.error("Generation error:", error)
      await updateDoc(projectRef, {
        status: "error",
        error: error instanceof Error ? error.message : "Generation failed"
      })
    } finally {
      setIsGenerating(false)
      setGeneratingFiles([])
      setCurrentGeneratingFile("")
      setAgentStatus("")
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
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          </div>
          <TextShimmer className="text-sm">Loading project...</TextShimmer>
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
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 flex flex-col">
      {/* Top Header Bar */}
      <div className="h-auto lg:h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 lg:py-0 border-b border-zinc-800 bg-zinc-900 flex-shrink-0 gap-3">
        {/* Mobile: Burger menu */}
        <div className="lg:hidden flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-950/40 text-zinc-200 shadow-sm shadow-black/30 ring-1 ring-white/5 hover:text-zinc-50 hover:bg-zinc-900/70 hover:border-zinc-700/80 transition-colors active:scale-[0.98]"
                aria-label="Open menu"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[calc(100vw-1.5rem)] max-w-80 bg-zinc-950/95 border-zinc-800/80 shadow-2xl rounded-2xl p-1 ring-1 ring-white/10 backdrop-blur-xl">
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

                <button onClick={handleOpenIntegrations} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                  <Plug className="w-4 h-4 text-zinc-300" />
                  <span className="text-sm text-zinc-100">Integrations</span>
                </button>

                <button onClick={handleOpenGitHub} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                  <Github className="w-4 h-4 text-zinc-300" />
                  <span className="text-sm text-zinc-100">GitHub</span>
                </button>

                <div className="pt-2">
                  <button onClick={() => setDeployOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left">
                    <Rocket className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-semibold text-zinc-100">Deploy</span>
                  </button>
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
          <DialogContent>
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
        <div className="flex-1 flex justify-center lg:justify-start min-w-0">
          <div className="lg:hidden text-sm font-semibold text-zinc-100 truncate text-center max-w-[60vw]">
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
              <DropdownMenuItem className="px-3 py-2.5 cursor-pointer">
                <div className="flex items-center gap-2.5 w-full">
                  <div className="p-1.5 rounded-md bg-zinc-800">
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                  <span className="text-sm text-zinc-100">Remix Project</span>
                </div>
              </DropdownMenuItem>

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

        {/* Right: Action Buttons (desktop only) */}
        <div className="hidden lg:flex items-center gap-2 overflow-x-auto lg:overflow-visible max-w-[46vw] sm:max-w-[52vw] lg:max-w-none custom-scrollbar">
          <button onClick={handleOpenIntegrations} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center">
            <Plug className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-blue-400 transition-colors" />
            Integrations
          </button>
          <button onClick={handleOpenGitHub} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 group shadow-sm hover:shadow-md flex items-center">
            <Github className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            GitHub
          </button>
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 bg-transparent min-w-fit flex items-center"
          >
            <Rocket className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Deploy
          </button>
          <button onClick={handleShare} className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 bg-transparent min-w-fit flex items-center">
            <Share className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Share
          </button>
        </div>

        {/* Mobile Share Button */}
        <div className="lg:hidden flex items-center">
          <button 
            onClick={handleShare} 
            className="h-9 px-4 text-xs font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/90 border border-zinc-800/50 hover:border-zinc-700/70 rounded-lg transition-all duration-200 bg-transparent min-w-fit flex items-center"
          >
            <Share className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            Share
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
          <DialogContent className="bg-zinc-950 border border-zinc-800 max-w-[calc(100%-2rem)] sm:max-w-2xl">
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

        {/* Mobile layout (stacked). Desktop/Laptop layout below remains unchanged and is lg+ only. */}
        <div className="lg:hidden h-full flex flex-col">
          {/* Mobile tabs */}
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/40">
            <div className="flex items-center gap-1 rounded-xl bg-zinc-900/50 border border-zinc-800 p-1">
              <button
                type="button"
                onClick={() => setMobileTab("chat")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                  mobileTab === "chat"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileTab("preview")
                  setActiveTab("preview")
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                  mobileTab === "preview"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                )}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>

          {/* Mobile content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobileTab === "chat" ? (
              <div className="h-full flex flex-col bg-zinc-900/30">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scrollbar">
                  <ChatMessage
                    message={{ role: "user", content: project.prompt }}
                    isLast={false}
                    onEdit={() => setEditingTarget({ kind: "prompt" })}
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
                      onEdit={msg.role === "user" ? () => setEditingTarget({ kind: "message", index: i }) : undefined}
                      isEditing={editingTarget?.kind === "message" && editingTarget.index === i}
                      onEditSubmit={handleEditSubmit}
                      onCancelEdit={handleCancelEdit}
                      projectFiles={project?.files}
                      setSelectedFile={setSelectedFile}
                      setActiveTab={setActiveTab}
                    />
                  ))}

                  {isGenerating && (
                    <AgentStatus status={agentStatus} currentFile={currentGeneratingFile || undefined} />
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

                <div className="p-3 border-t border-zinc-800/50">
                  <AnimatedAIInput
                    mode="chat"
                    compact
                    isLoading={isGenerating}
                    placeholder="Ask for changes or describe what to build..."
                    onSubmit={(value, model) => handleSendMessage(value, model)}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full bg-zinc-900 relative">
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
                          onRetry={() => project.files && createSandbox(project.files)}
                        />
                      </div>
                    ) : (
                      <div className="h-full bg-zinc-950 flex items-center justify-center p-6">
                        <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
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
            )}
          </div>
        </div>

        <ResizablePanelGroup direction="horizontal" className="h-full hidden lg:flex">
          {/* Chat Panel */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full flex flex-col bg-zinc-900/30">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scrollbar">
                {/* Initial prompt */}
                <ChatMessage
                  message={{ role: "user", content: project.prompt }}
                  isLast={false}
                  onEdit={() => setEditingTarget({ kind: "prompt" })}
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
                    onEdit={msg.role === "user" ? () => setEditingTarget({ kind: "message", index: i }) : undefined}
                    isEditing={editingTarget?.kind === "message" && editingTarget.index === i}
                    onEditSubmit={handleEditSubmit}
                    onCancelEdit={handleCancelEdit}
                    projectFiles={project?.files}
                    setSelectedFile={setSelectedFile}
                    setActiveTab={setActiveTab}
                  />
                ))}

                {/* Agent status */}
                {isGenerating && (
                  <AgentStatus 
                    status={agentStatus} 
                    currentFile={currentGeneratingFile || undefined}
                  />
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

              {/* Chat Input - Using Hero Section AnimatedAIInput */}
              <div className="p-3 border-t border-zinc-800/50">
                <AnimatedAIInput
                  mode="chat"
                  compact
                  isLoading={isGenerating}
                  placeholder="Ask for changes or describe what to build..."
                  onSubmit={(value, model) => handleSendMessage(value, model)}
                />
              </div>
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
                  <div className="h-full bg-gradient-to-b from-zinc-900 to-zinc-950 relative">
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
                              onRetry={() => project.files && createSandbox(project.files)}
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
                ) : (
                  <div className="h-full flex">
                    {/* File Tree */}
                    <div className="w-56 border-r border-zinc-800/50 bg-gradient-to-b from-zinc-950/80 to-zinc-900/60 overflow-y-auto custom-scrollbar shadow-inner">
                      <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-2">
                          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
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
  return (
    <ProtectedRoute requiredTokens={0}>
      <ProjectContent />
    </ProtectedRoute>
  )
}
