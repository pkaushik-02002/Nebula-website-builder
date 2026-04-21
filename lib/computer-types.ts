export type ComputerStatus = "idle"|"researching"|"planning"|
"building"|"verifying"|"fixing"|"deploying"|"complete"|"error"

export type ComputerStepKind = "clarify"|"research"|"plan"|"build"|
"verify"|"fix"|"deploy"

export type ComputerPlanningStatus =
  | "draft"
  | "needs-input"
  | "ready-for-approval"
  | "approved"

export type ComputerIntent = "website-build"|"website-clone"|"web-app"

export type ComputerBuildScope = "frontend-only"|"full-stack"

export interface ComputerPermissions {
  requirePlanApproval: boolean
}

export interface ComputerClarificationOption {
  id: string
  label: string
  answer: string
  recommended?: boolean
}

export interface ComputerClarificationQuestion {
  id: string
  prompt: string
  options: ComputerClarificationOption[]
}

export interface ComputerPlan {
  summary: string
  intent: ComputerIntent
  buildScope: ComputerBuildScope
  domain: string
  tone: string
  pages: string[]
  features: string[]
  techChoices: {
    framework: string
    styling: string
    animations: string
    graphics?: string
  }
  contentPlan: Record<string, unknown>
  assumptions: string[]
  researchHighlights: string[]
  sourceUrls: string[]
  generatedAt: string
}

export interface ComputerStep {
  id: string
  kind: ComputerStepKind
  title: string
  status: "pending"|"active"|"complete"|"failed"
  startedAt?: string
  finishedAt?: string
  summary?: string
  artifacts?: string[]
}

export interface ComputerAction {
  id: string
  timestamp: string
  type: "thinking"|"tool_call"|"tool_result"|"message"|"decision"
  content: string
  actor?: "user"|"agent"|"system"
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
}

export interface ComputerResearchSource {
  url: string
  title: string
  screenshotUrl?: string
  extractedContent: string
  extractedAt: string
  addedBy: "user"|"agent"
}

export interface Computer {
  id: string
  ownerId: string
  name: string
  prompt: string
  referenceUrls: string[]
  permissions?: ComputerPermissions
  planningStatus?: ComputerPlanningStatus
  clarificationQuestions?: ComputerClarificationQuestion[]
  plan?: ComputerPlan | null
  status: ComputerStatus
  currentStep?: ComputerStepKind
  steps: ComputerStep[]
  actions: ComputerAction[]
  researchSources: ComputerResearchSource[]
  files: Array<{path: string; content: string}>
  currentGeneratingFile?: string | null
  sandboxId?: string
  sandboxUrl?: string
  browserbaseSessionId?: string
  browserbaseLiveViewUrl?: string
  deployUrl?: string
  cancelRequested?: boolean
  approvedAt?: unknown
  createdAt: unknown
  updatedAt: unknown
}
