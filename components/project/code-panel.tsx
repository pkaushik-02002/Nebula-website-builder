"use client"

import { FileCode } from "lucide-react"
import Editor from "@monaco-editor/react"
import { cn } from "@/lib/utils"
import { ProjectFileTree, getLanguageFromPath } from "./file-tree"
import type { GeneratedFile } from "@/app/project/[id]/types"

export interface CodePanelProps {
  files: GeneratedFile[]
  selectedFile: GeneratedFile | null
  onSelectFile: (file: GeneratedFile) => void
  isGenerating?: boolean
}

export function CodePanel({ files, selectedFile, onSelectFile, isGenerating }: CodePanelProps) {
  return (
    <div className="h-full flex min-w-0">
      <ProjectFileTree
        files={files}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        isGenerating={isGenerating}
      />
      <div className="flex-1 flex flex-col bg-gradient-to-br from-[#1e1e1e] to-[#1a1a1a]">
        {!selectedFile ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-zinc-500">Select a file</div>
          </div>
        ) : (
          <>
            <div className="h-10 border-b border-zinc-800/50 flex items-center px-4 bg-gradient-to-r from-zinc-900/50 to-zinc-950/50 backdrop-blur-sm shadow-sm">
              <FileCode className={cn("w-4 h-4 mr-2", getLanguageFromPath(selectedFile.path).includes("typescript") ? "text-zinc-400" : "text-zinc-400")} />
              <span className="text-sm text-zinc-400">{selectedFile.path}</span>
            </div>
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language={getLanguageFromPath(selectedFile.path)}
                value={selectedFile.content}
                theme="vs-dark"
                loading={
                  <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
                    <div className="text-zinc-500 text-sm">Loading editor…</div>
                  </div>
                }
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
        )}
      </div>
    </div>
  )
}
