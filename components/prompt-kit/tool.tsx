"use client"

import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, 
  Globe, 
  Database, 
  Mail, 
  Loader2, 
  Check, 
  AlertTriangle,
  FileCode,
  Send,
  Server
} from "lucide-react"

interface ToolInput {
  pattern?: string
  directory?: string
  endpoint?: string
  method?: string
  table?: string
  limit?: number
  to?: string
  subject?: string
  [key: string]: any
}

interface ToolOutput {
  count?: number
  data?: any[]
  [key: string]: any
}

interface ToolPart {
  type: "file_search" | "api_call" | "database_query" | "email_send" | "code_generation" | "deployment"
  state: "input-streaming" | "input-available" | "output-available" | "output-error" | "processing"
  input?: ToolInput
  output?: ToolOutput
  errorText?: string
}

interface ToolProps {
  className?: string
  toolPart: ToolPart
}

const getToolIcon = (type: string) => {
  switch (type) {
    case "file_search":
      return <Search className="w-4 h-4" />
    case "api_call":
      return <Globe className="w-4 h-4" />
    case "database_query":
      return <Database className="w-4 h-4" />
    case "email_send":
      return <Mail className="w-4 h-4" />
    case "code_generation":
      return <FileCode className="w-4 h-4" />
    case "deployment":
      return <Server className="w-4 h-4" />
    default:
      return <Server className="w-4 h-4" />
  }
}

const getToolName = (type: string) => {
  switch (type) {
    case "file_search":
      return "File Search"
    case "api_call":
      return "API Call"
    case "database_query":
      return "Database Query"
    case "email_send":
      return "Send Email"
    case "code_generation":
      return "Code Generation"
    case "deployment":
      return "Deployment"
    default:
      return "Tool"
  }
}

const getStatusIcon = (state: string) => {
  switch (state) {
    case "input-streaming":
      return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
    case "input-available":
      return <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
    case "output-available":
      return <Check className="w-3 h-3 text-emerald-400" />
    case "output-error":
      return <AlertTriangle className="w-3 h-3 text-red-400" />
    case "processing":
      return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
    default:
      return <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
  }
}

const getStatusColor = (state: string) => {
  switch (state) {
    case "input-streaming":
      return "border-blue-500/30 bg-blue-500/5"
    case "input-available":
      return "border-zinc-700/50 bg-zinc-800/30"
    case "output-available":
      return "border-emerald-500/30 bg-emerald-500/5"
    case "output-error":
      return "border-red-500/30 bg-red-500/5"
    case "processing":
      return "border-blue-500/30 bg-blue-500/5"
    default:
      return "border-zinc-700/50 bg-zinc-800/30"
  }
}

export function Tool({ className, toolPart }: ToolProps) {
  const { type, state, input, output, errorText } = toolPart

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full rounded-xl border p-4 transition-all duration-200",
        getStatusColor(state),
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
            {getToolIcon(type)}
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">{getToolName(type)}</div>
            <div className="text-xs text-zinc-500 capitalize">{state.replace("-", " ")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(state)}
        </div>
      </div>

      {/* Input Section */}
      <AnimatePresence>
        {input && (state === "input-streaming" || state === "input-available" || state === "processing") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Input</div>
            <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700/30">
              <div className="space-y-1">
                {Object.entries(input).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 capitalize">{key.replace("_", " ")}:</span>
                    <span className="text-zinc-300 font-mono">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output Section */}
      <AnimatePresence>
        {output && state === "output-available" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 mt-3"
          >
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Output</div>
            <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700/30">
              <div className="space-y-2">
                {Object.entries(output).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-xs text-zinc-500 capitalize mb-1">{key.replace("_", " ")}:</div>
                    {Array.isArray(value) ? (
                      <div className="space-y-1 ml-2">
                        {value.slice(0, 3).map((item, index) => (
                          <div key={index} className="text-xs text-zinc-300 font-mono">
                            {JSON.stringify(item)}
                          </div>
                        ))}
                        {value.length > 3 && (
                          <div className="text-xs text-zinc-500 italic">
                            ... and {value.length - 3} more items
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-300 font-mono ml-2">
                        {JSON.stringify(value)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Section */}
      <AnimatePresence>
        {errorText && state === "output-error" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <div className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">Error</div>
            <div className="bg-red-900/20 rounded-lg p-3 border border-red-800/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-red-300">{errorText}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
