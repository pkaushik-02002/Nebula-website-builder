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

export type ProjectVisibility = "public" | "private" | "link-only"

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
  supabaseUrl?: string
  supabaseProjectRef?: string
  visibility?: ProjectVisibility
  ownerId?: string
  editorIds?: string[]
  vercelToken?: string
  vercelDeployUrl?: string
  vercelDeploymentId?: string
  websiteSettings?: WebsiteSettings
}

export interface FileNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isGenerating?: boolean
}
