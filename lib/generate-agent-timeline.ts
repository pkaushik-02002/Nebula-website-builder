interface TimelineGenerationOptions {
  creationMode: "agent" | "build"
  planningStatus: "draft" | "needs-input" | "plan-generated" | "approved" | "skipped"
  currentGeneratingFile?: string
  agentStatus: string
  reasoningSteps: string[]
  thinkingSteps?: Array<{
    phase: "analysis" | "planning" | "generation" | "validation"
    status: "pending" | "active" | "complete" | "error"
  }>
  suggestsBackend?: boolean
  backendSetupStatus?: "pending" | "in-progress" | "complete" | "failed"
}

interface AgentTimelineItem {
  key: string
  title: string
  description: string
  detail: string
  accent: string
  status?: "complete" | "active" | "pending"
}

const TIMELINE_STEPS = {
  analyze: {
    key: "analyze" as const,
    title: "Understanding your request",
    description: "Reviewing the prompt, website context, and current project files.",
    detail: "Parsing intent, product scope, and constraints before touching the build.",
    accent: "Brief",
  },
  plan: {
    key: "plan" as const,
    title: "Planning the update",
    description: "Choosing components, layout changes, and implementation steps.",
    detail: "Sequencing the right changes and reducing risky assumptions first.",
    accent: "Strategy",
  },
  build: {
    key: "build" as const,
    title: "Generating files",
    description: "Writing and updating the files needed for this change.",
    detail: "Turning the approved direction into concrete file edits.",
    accent: "Execution",
  },
  backendSetup: {
    key: "backend-setup" as const,
    title: "Setting up backend",
    description: "Provisioning database, auth, and API integration.",
    detail: "Connecting your Supabase project and generating integration code.",
    accent: "Infrastructure",
  },
  finalize: {
    key: "finalize" as const,
    title: "Finalizing output",
    description: "Wrapping up the response and preparing the updated website state.",
    detail: "Preparing the handoff back into preview and the next edit loop.",
    accent: "Handoff",
  },
} as const

/**
 * Determines if the AI is requesting clarifications based on agent status and reasoning steps
 */
function isAiRequestingClarifications(agentStatus: string, reasoningSteps: string[]): boolean {
  const normalized = reasoningSteps.map((step) => step.toLowerCase())

  // Check if agent status indicates clarification request
  const clarificationKeywords = ["clarif", "need", "asking", "question", "waiting", "require", "unclear"]
  const hasStatus = clarificationKeywords.some((keyword) =>
    agentStatus.toLowerCase().includes(keyword)
  )

  // Check if any reasoning step indicates planning/clarification
  const hasPlanningStep = normalized.some((step) =>
    /plan|scope|analy|reason|understand|design|clarif|ask|question|waiting/.test(step)
  )

  return hasStatus || hasPlanningStep
}

/**
 * Generates dynamic timeline steps based on mode, planning status, and AI state
 *
 * Rules:
 * - Agent mode: Skip "Plan" (already planned upfront)
 * - Build/Skip mode + AI needs clarifications: Include "Plan"
 * - Build/Skip mode + straightforward: Skip "Plan"
 * - If backend needed: Include "Backend Setup" before finalize
 */
export function generateDynamicTimeline(options: TimelineGenerationOptions): AgentTimelineItem[] {
  const {
    creationMode,
    planningStatus,
    currentGeneratingFile,
    agentStatus,
    reasoningSteps,
    thinkingSteps = [],
    suggestsBackend,
    backendSetupStatus,
  } = options

  // Determine which steps to include
  let steps: AgentTimelineItem[] = [TIMELINE_STEPS.analyze]

  // Add planning step only in specific conditions
  const shouldIncludePlanning =
    creationMode !== "agent" && // Not already in agent mode (planning was done upfront)
    (planningStatus === "draft" || planningStatus === "needs-input" || planningStatus === "skipped") && // Initial planning not yet complete or was skipped
    isAiRequestingClarifications(agentStatus, reasoningSteps) // AI actually needs clarifications

  if (shouldIncludePlanning) {
    steps.push(TIMELINE_STEPS.plan)
  }

  // Build step with dynamic description if generating a file
  const buildStep: AgentTimelineItem = {
    ...TIMELINE_STEPS.build,
    description: currentGeneratingFile
      ? `Working on ${currentGeneratingFile}`
      : "Writing and updating the files needed for this change.",
    detail: currentGeneratingFile
      ? "Applying the current file-level update inside the project workspace."
      : "Turning the approved direction into concrete file edits.",
  }

  steps.push(buildStep)

  // Add backend setup step if backend is needed
  if (suggestsBackend && backendSetupStatus && backendSetupStatus !== "pending") {
    const backendStep: AgentTimelineItem = {
      ...TIMELINE_STEPS.backendSetup,
    }
    steps.push(backendStep)
  }

  steps.push(TIMELINE_STEPS.finalize)

  // Determine current stage using live thinking phases first (more dynamic than static reasoning text)
  const normalized = reasoningSteps.map((step) => step.toLowerCase())
  const activeThinking = thinkingSteps.find((step) => step.status === "active")
  let currentStage: number

  if (backendSetupStatus === "in-progress") {
    // Backend setup step - find its index
    currentStage = steps.findIndex((s) => s.key === "backend-setup")
    if (currentStage === -1) currentStage = steps.length - 2 // Default to finalize if not found
  } else if (activeThinking) {
    switch (activeThinking.phase) {
      case "analysis":
        currentStage = steps.findIndex((s) => s.key === "analyze")
        break
      case "planning":
        // In agent mode, planning is reflected in reasoning panel rather than a duplicate timeline step.
        currentStage = steps.findIndex((s) => s.key === (shouldIncludePlanning ? "plan" : "analyze"))
        break
      case "generation":
        currentStage = steps.findIndex((s) => s.key === "build")
        break
      case "validation":
        currentStage = steps.findIndex((s) => s.key === "finalize")
        break
      default:
        currentStage = 0
    }
    if (currentStage === -1) currentStage = 0
  } else if (agentStatus.toLowerCase().includes("final")) {
    // Finalize step
    currentStage = steps.length - 1
  } else if (
    normalized.some((step) => step.includes("creating files")) ||
    !!currentGeneratingFile
  ) {
    // Build step - find its index
    currentStage = steps.findIndex((s) => s.key === "build")
  } else if (normalized.length >= 2) {
    // Planning or analyzing - find index of plan or analyze
    const planIndex = steps.findIndex((s) => s.key === "plan")
    currentStage = planIndex !== -1 ? planIndex : 1
  } else {
    // Analyze
    currentStage = 0
  }

  // Ensure currentStage is within bounds
  currentStage = Math.min(currentStage, steps.length - 1)

  // Map steps with status
  return steps.map((step, index) => {
    const status = index < currentStage ? "complete" : index === currentStage ? "active" : "pending"
    return {
      ...step,
      status: status as "complete" | "active" | "pending",
    }
  })
}
