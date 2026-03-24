export type AgentRuntimeMode = "builder" | "agent"

export type AgentRuntimePhase =
  | "clarifying"
  | "planning"
  | "writing_files"
  | "installing"
  | "building"
  | "fixing"
  | "setup_required"
  | "preview_ready"
  | "blocked"

export type AgentSetupRequirementCategory = "supabase" | "auth" | "stripe" | "custom_api" | "database"

export interface AgentSetupRequirement {
  category: AgentSetupRequirementCategory
  reason: string
  blocking: boolean
  metadata?: Record<string, string>
}

export interface AgentRuntimeSnapshot {
  mode: AgentRuntimeMode
  phase: AgentRuntimePhase
  setupRequirements: AgentSetupRequirement[]
  blockedReason?: string
  updatedAt: string
}

const PHASE_SET = new Set<AgentRuntimePhase>([
  "clarifying",
  "planning",
  "writing_files",
  "installing",
  "building",
  "fixing",
  "setup_required",
  "preview_ready",
  "blocked",
])

export function normalizeSetupCategory(raw: string): AgentSetupRequirementCategory | null {
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_")
  if (normalized === "supabase") return "supabase"
  if (normalized === "auth") return "auth"
  if (normalized === "stripe") return "stripe"
  if (normalized === "custom_api") return "custom_api"
  if (normalized === "database") return "database"
  return null
}

export function normalizeAgentRuntimePhase(raw: string): AgentRuntimePhase | null {
  const normalized = raw.trim().toLowerCase() as AgentRuntimePhase
  return PHASE_SET.has(normalized) ? normalized : null
}

export function resolveTerminalAgentPhase(params: {
  suggestedPhase?: AgentRuntimePhase
  blockedReason?: string
  setupRequirementCount: number
}): AgentRuntimePhase {
  if (params.suggestedPhase) return params.suggestedPhase
  if (params.blockedReason) return "blocked"
  if (params.setupRequirementCount > 0) return "setup_required"
  return "preview_ready"
}
