"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, FileCode, FolderOpen, Folder as FolderIcon, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { FileNode, GeneratedFile } from "@/app/project/[id]/types"
import { buildFileTree, getLanguageFromPath } from "@/app/project/[id]/utils"

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  const colors: Record<string, string> = {
    tsx: "text-zinc-400",
    ts: "text-zinc-400",
    jsx: "text-zinc-400",
    js: "text-zinc-400",
    css: "text-zinc-400",
    scss: "text-zinc-400",
    json: "text-zinc-400",
    md: "text-zinc-400",
    yml: "text-zinc-400",
    yaml: "text-zinc-400",
    env: "text-zinc-400",
    txt: "text-zinc-400",
    html: "text-zinc-400",
    svg: "text-zinc-400",
    png: "text-zinc-400",
    jpg: "text-zinc-400",
    jpeg: "text-zinc-400",
    gif: "text-zinc-400",
  }
  return colors[ext || ""] || "text-zinc-400"
}

function FileTreeItem({
  node,
  selectedFile,
  onSelect,
  depth = 0,
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
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-zinc-400" />
          ) : (
            <FolderIcon className="w-4 h-4 text-zinc-400" />
          )}
          <span className="text-zinc-300 truncate">{node.name}</span>
        </button>
        <AnimatePresence>
          {isOpen && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children.map((child) => (
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

  return (
    <motion.button
      type="button"
      initial={node.isGenerating ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onSelect({ path: node.path, content: node.content || "" })}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1 text-sm rounded transition-colors",
        isSelected ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <div className="w-3.5 h-3.5" />
      {node.isGenerating ? (
        <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
      ) : (
        <FileCode className={cn("w-4 h-4", getFileIcon(node.name))} />
      )}
      <span className="truncate">{node.name}</span>
      {node.isGenerating && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ml-auto text-[10px] text-zinc-500 flex items-center gap-1"
        >
          <span className="w-1 h-1 rounded-full bg-zinc-400 animate-pulse" />
          writing...
        </motion.span>
      )}
    </motion.button>
  )
}

export interface ProjectFileTreeProps {
  files: GeneratedFile[]
  selectedFile: GeneratedFile | null
  onSelectFile: (file: GeneratedFile) => void
  isGenerating?: boolean
}

export function ProjectFileTree({ files, selectedFile, onSelectFile, isGenerating }: ProjectFileTreeProps) {
  const fileTree = buildFileTree(files)
  return (
    <div className="w-56 flex-shrink-0 border-r border-zinc-800/50 bg-gradient-to-b from-zinc-950/90 to-zinc-900/70 overflow-y-auto custom-scrollbar shadow-inner backdrop-blur-sm">
      <div className="p-2.5">
        <div className="flex items-center justify-between px-2 py-2.5">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Files</span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            {isGenerating && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                generating
              </>
            )}
            {files.length > 0 && (
              <span className="font-mono">
                {files.length} · {(files.reduce((acc, f) => acc + (f.content?.length ?? 0), 0) / 1024).toFixed(1)}k
              </span>
            )}
          </span>
        </div>
        {fileTree.length > 0 ? (
          <div className="space-y-0.5">
            {fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                selectedFile={selectedFile}
                onSelect={onSelectFile}
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
  )
}

export { getLanguageFromPath }
