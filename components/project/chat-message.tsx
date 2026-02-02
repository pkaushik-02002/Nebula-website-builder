"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { User, Bot, Edit2, Copy, Check, Lightbulb, FileCode, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { toast } from "@/hooks/use-toast"
import type { Message, GeneratedFile } from "@/app/project/[id]/types"
import { formatMessageTime } from "@/app/project/[id]/utils"

export interface ChatMessageProps {
  message: Message
  isLast: boolean
  onEdit?: () => void
  isEditing?: boolean
  onEditSubmit?: (newContent: string) => void
  onCancelEdit?: () => void
  projectFiles?: GeneratedFile[]
  setSelectedFile?: (file: GeneratedFile) => void
  setActiveTab?: (tab: "preview" | "code") => void
}

export function ChatMessage({
  message,
  onEdit,
  isEditing,
  onEditSubmit,
  onCancelEdit,
  projectFiles,
  setSelectedFile,
  setActiveTab,
}: ChatMessageProps) {
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
    if (editContent.trim() && onEditSubmit) onEditSubmit(editContent.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleEditSubmit()
    }
    if (e.key === "Escape" && onCancelEdit) onCancelEdit()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "")}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-zinc-700" : ""
        )}
      >
        {isUser ? (
          <User className="w-5 h-5 text-zinc-300" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
            <Bot className="w-5 h-5 text-zinc-300" />
          </div>
        )}
      </div>
      <div className={cn("flex-1 min-w-0", isUser ? "text-right" : "")}>
        {isUser && (
          <div className="inline-block max-w-[85%] sm:max-w-[75%] ml-auto group">
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
              <div>
                <div className="rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 bg-zinc-700 text-zinc-100 rounded-tr-sm">
                  <p className="text-xs sm:text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
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
                        <span className="text-xs" />
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
                      {isCopied ? (
                        <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-300" />
                      ) : (
                        <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      )}
                      <span className="text-xs" />
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
                      const isDirectory = file.includes("/")
                      const fileName = file.split("/").pop() || file
                      const directory = file.includes("/") ? file.split("/").slice(0, -1).join("/") : null
                      const handleFileClick = () => {
                        const projectFile = projectFiles?.find((f) => f.path === file)
                        if (projectFile && setSelectedFile) {
                          setSelectedFile(projectFile)
                          if (setActiveTab && typeof window !== "undefined") {
                            const isDesktop = window.matchMedia("(min-width: 1024px)").matches
                            if (isDesktop) setActiveTab("code")
                            else {
                              setActiveTab("preview")
                              toast({ title: "Switched to code view", description: "Check the Code tab to see files." })
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
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
