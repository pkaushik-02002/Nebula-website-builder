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

export interface Project {
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
  vercelToken?: string
  vercelDeployUrl?: string
  vercelDeploymentId?: string
}

export interface FileNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isGenerating?: boolean
}
