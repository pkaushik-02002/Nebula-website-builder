import type { GeneratedFile, Message, Project, ProjectVisibility } from "@/app/project/[id]/types"

type TimestampLike = { toDate: () => Date }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (isRecord(value) && typeof value.toDate === "function") {
    const parsed = (value as TimestampLike).toDate()
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback
}

function normalizeFiles(value: unknown): GeneratedFile[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map((file) => ({
      path: typeof file.path === "string" ? file.path : "",
      content: typeof file.content === "string" ? file.content : "",
      ...(typeof file.isGenerating === "boolean" ? { isGenerating: file.isGenerating } : {}),
    }))
    .filter((file) => file.path.length > 0)
}

function normalizeMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .flatMap((message): Message[] => {
      if (message.role !== "user" && message.role !== "assistant") return []
      if (typeof message.content !== "string") return []

      return [{
        role: message.role,
        content: message.content,
        ...(Array.isArray(message.files)
          ? { files: message.files.filter((file): file is string => typeof file === "string") }
          : {}),
        ...(typeof message.isStreaming === "boolean" ? { isStreaming: message.isStreaming } : {}),
        ...(typeof message.timestamp === "string" ? { timestamp: message.timestamp } : {}),
      }]
    })
}

function normalizeVisibility(value: unknown): ProjectVisibility {
  return value === "public" || value === "link-only" ? value : "private"
}

function normalizeStatus(value: unknown): Project["status"] {
  return value === "generating" || value === "complete" || value === "error" ? value : "pending"
}

export function normalizeProject(
  value: unknown,
  options?: { fallbackId?: string; fallbackCreatedAt?: Date }
): Project {
  const record = isRecord(value) ? value : {}
  const fallbackCreatedAt = options?.fallbackCreatedAt ?? new Date()

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : (options?.fallbackId ?? ""),
    name: typeof record.name === "string" ? record.name : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    model: typeof record.model === "string" ? record.model : undefined,
    status: normalizeStatus(record.status),
    workspaceId: typeof record.workspaceId === "string" ? record.workspaceId : undefined,
    files: normalizeFiles(record.files),
    sandboxUrl: typeof record.sandboxUrl === "string" ? record.sandboxUrl : undefined,
    sandboxId: typeof record.sandboxId === "string" ? record.sandboxId : undefined,
    createdAt: toDate(record.createdAt, fallbackCreatedAt),
    messages: normalizeMessages(record.messages),
    error: typeof record.error === "string" ? record.error : undefined,
    tokensUsed: typeof record.tokensUsed === "number" ? record.tokensUsed : undefined,
    githubRepoUrl: typeof record.githubRepoUrl === "string" ? record.githubRepoUrl : undefined,
    githubRepoFullName: typeof record.githubRepoFullName === "string" ? record.githubRepoFullName : undefined,
    githubInstallationId: typeof record.githubInstallationId === "number" ? record.githubInstallationId : undefined,
    githubSyncedAt: record.githubSyncedAt as Project["githubSyncedAt"],
    suggestsBackend: typeof record.suggestsBackend === "boolean" ? record.suggestsBackend : undefined,
    generationMeta: isRecord(record.generationMeta) ? (record.generationMeta as Project["generationMeta"]) : undefined,
    agentRuntime: isRecord(record.agentRuntime) ? (record.agentRuntime as Project["agentRuntime"]) : undefined,
    supabaseUrl: typeof record.supabaseUrl === "string" ? record.supabaseUrl : undefined,
    supabaseProjectRef: typeof record.supabaseProjectRef === "string" ? record.supabaseProjectRef : undefined,
    visibility: normalizeVisibility(record.visibility),
    ownerId: typeof record.ownerId === "string" ? record.ownerId : undefined,
    editorIds: Array.isArray(record.editorIds) ? record.editorIds.filter((id): id is string => typeof id === "string") : [],
    vercelToken: typeof record.vercelToken === "string" ? record.vercelToken : undefined,
    vercelDeployUrl: typeof record.vercelDeployUrl === "string" ? record.vercelDeployUrl : undefined,
    vercelDeploymentId: typeof record.vercelDeploymentId === "string" ? record.vercelDeploymentId : undefined,
    websiteSettings: isRecord(record.websiteSettings) ? (record.websiteSettings as Project["websiteSettings"]) : undefined,
    blueprint: isRecord(record.blueprint) ? (record.blueprint as Project["blueprint"]) : undefined,
    planningStatus: record.planningStatus as Project["planningStatus"],
    creationMode: record.creationMode as Project["creationMode"],
    agentSlug: typeof record.agentSlug === "string" ? record.agentSlug : undefined,
  }
}

export function serializeProjectForApi(value: unknown, fallbackId?: string): Record<string, unknown> {
  const project = normalizeProject(value, { fallbackId })

  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    ...(project.githubSyncedAt instanceof Date ? { githubSyncedAt: project.githubSyncedAt.toISOString() } : {}),
  }
}
