import type { AgentRuntimePhase, AgentRuntimeSnapshot, AgentSetupRequirement } from "@/lib/agent-runtime"

export interface GeneratedFile {
  path: string
  content: string
  isGenerating?: boolean
}

export interface Message {
  role: "user" | "assistant"
  content: string
  files?: string[]
  isStreaming?: boolean
  timestamp?: string
}

export type BlueprintItemStatus = "confirmed" | "suggested" | "unknown"

export interface BlueprintItem {
  key: string
  label: string
  value: string
  status: BlueprintItemStatus
}

export interface BlueprintSection {
  id: string
  title: string
  description?: string
  items: BlueprintItem[]
}

export interface ProjectBlueprint {
  summary: string
  readiness: number
  sections: BlueprintSection[]
  openQuestions: string[]
  assumptions: string[]
}

export type PlanningStatus = "draft" | "needs-input" | "plan-generated" | "approved" | "skipped"
export type ProjectCreationMode = "build" | "agent"

export type ProjectVisibility = "public" | "private" | "link-only"

export interface ProjectGenerationMeta {
  suggestsBackend?: boolean
  setupRequirements?: AgentSetupRequirement[]
  agentPhase?: AgentRuntimePhase
  blockedReason?: string
}

export interface WebsiteSettings {
  siteName?: string
  envVars?: Array<{ key: string; value: string }>
}

export interface Project {
  id: string
  name?: string
  prompt: string
  model?: string
  status: "pending" | "generating" | "complete" | "error"
  workspaceId?: string
  files?: GeneratedFile[]
  sandboxUrl?: string
  sandboxId?: string
  createdAt: Date
  messages?: Message[]
  error?: string
  tokensUsed?: number
  githubRepoUrl?: string
  githubRepoFullName?: string
  githubInstallationId?: number
  githubSyncedAt?: Date | { toDate: () => Date }
  suggestsBackend?: boolean
  generationMeta?: ProjectGenerationMeta
  agentRuntime?: AgentRuntimeSnapshot
  supabaseUrl?: string
  supabaseProjectRef?: string
  visibility?: ProjectVisibility
  ownerId?: string
  editorIds?: string[]
  vercelToken?: string
  vercelDeployUrl?: string
  vercelDeploymentId?: string
  websiteSettings?: WebsiteSettings
  blueprint?: ProjectBlueprint
  planningStatus?: PlanningStatus
  creationMode?: ProjectCreationMode
  agentSlug?: string
}

export interface FileNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isGenerating?: boolean
}
