import { ThinkingPhase, ThinkingStep } from "@/components/project/agent-thinking-stream"

/**
 * Extracts structured reasoning steps from agent response stream
 * Parses markers like ===THINKING_START=== to track phases
 */
export function extractThinkingSteps(
  content: string,
  existingSteps: ThinkingStep[] = []
): ThinkingStep[] {
  const steps = [...existingSteps]
  const now = Date.now()

  // Pattern: ===THINKING_PHASE_START:analysis=== ... ===THINKING_PHASE_END===
  const thinkingBlocks = content.match(
    /===THINKING_PHASE_START:(\w+)===\n([\s\S]*?)\n===THINKING_PHASE_END===/g
  )

  if (thinkingBlocks) {
    for (const block of thinkingBlocks) {
      const match = block.match(
        /===THINKING_PHASE_START:(\w+)===\n([\s\S]*?)\n===THINKING_PHASE_END===/
      )
      if (!match) continue

      const [, phase, content] = match
      const phaseType = phase.toLowerCase() as ThinkingPhase

      // Parse title and description from content
      const lines = content.trim().split("\n")
      const title = lines[0] || phaseType
      const description = lines.slice(1).join("\n").trim()

      // Extract bullet points as details
      const details = lines
        .slice(1)
        .filter((line) => line.trim().startsWith("•") || line.trim().startsWith("-"))
        .map((line) => line.trim().replace(/^[•-]\s*/, ""))

      // Generate ID from phase + timestamp to avoid duplicates
      const stepId = `${phaseType}-${now}`

      // Only add if not already present
      if (!steps.find((s) => s.id === stepId)) {
        steps.push({
          id: stepId,
          phase: phaseType,
          title,
          description: description || `${phaseType} in progress`,
          status: "complete",
          details: details.length > 0 ? details : undefined,
          timestamp: now,
        })
      }
    }
  }

  return steps
}

/**
 * Creates a new active thinking step
 */
export function createThinkingStep(
  phase: ThinkingPhase,
  title: string,
  description: string,
  details?: string[]
): ThinkingStep {
  return {
    id: `${phase}-${Date.now()}`,
    phase,
    title,
    description,
    status: "active",
    details,
    timestamp: Date.now(),
  }
}

/**
 * Marks a thinking step as complete
 */
export function completeThinkingStep(step: ThinkingStep): ThinkingStep {
  return {
    ...step,
    status: "complete",
  }
}

/**
 * High-level phase generation based on agent status
 * Used when streaming doesn't include explicit thinking markers
 */
export function generateImplicitThinkingSteps(
  agentStatus: string,
  currentGeneratingFile: string | null,
  generatingFilesCount: number
): ThinkingStep[] {
  const steps: ThinkingStep[] = []
  const now = Date.now()

  // Phase 1: Initial analysis
  if (
    agentStatus.includes("Understanding") ||
    agentStatus.includes("analyzing") ||
    agentStatus.includes("reading")
  ) {
    steps.push({
      id: `analysis-${now}`,
      phase: "analysis",
      title: "Understanding requirements",
      description: "Analyzing your project brief and gathering context",
      status: "active",
      details: ["Reading project brief", "Identifying core features", "Planning architecture"],
      timestamp: now,
    })
  }

  // Phase 2: Planning
  if (
    agentStatus.includes("Planning") ||
    agentStatus.includes("planning") ||
    agentStatus.includes("schema")
  ) {
    steps.push({
      id: `planning-${now}`,
      phase: "planning",
      title: "Planning structure",
      description: "Designing application structure and data models",
      status: steps.length > 0 ? "active" : "pending",
      details: [
        "Defining components",
        "Planning data schemas",
        "Mapping user flows",
      ],
      timestamp: now,
    })
  }

  // Phase 3: Generation (if creating files)
  if (currentGeneratingFile || generatingFilesCount > 0) {
    steps.push({
      id: `generation-${now}`,
      phase: "generation",
      title: "Generating files",
      description: `Creating application code (${generatingFilesCount} files)`,
      status: "active",
      details: currentGeneratingFile
        ? [`Writing: ${currentGeneratingFile}`]
        : [`Generated ${generatingFilesCount} file(s)`],
      timestamp: now,
    })
  }

  // Phase 4: Validation (if nearly done)
  if (agentStatus.includes("Validating") || agentStatus.includes("Wrapping")) {
    steps.push({
      id: `validation-${now}`,
      phase: "validation",
      title: "Validating output",
      description: "Checking code quality and consistency",
      status: "active",
      details: ["Verifying imports", "Checking types", "Validating structure"],
      timestamp: now,
    })
  }

  return steps
}

/**
 * Parse agent stream for embedded thinking markers
 * Format: ===THINKING:analysis=== Title | Description | detail1;detail2 ===END===
 */
export function parseStreamingThinkingMarkers(chunk: string): ThinkingStep[] {
  const steps: ThinkingStep[] = []
  const markerPattern = /===THINKING:(\w+)===(.*?)===END===/g
  let match

  while ((match = markerPattern.exec(chunk)) !== null) {
    const [, phase, content] = match
    const parts = content.split("|").map((p) => p.trim())

    if (parts.length > 0) {
      steps.push({
        id: `${phase}-${Date.now()}`,
        phase: phase.toLowerCase() as ThinkingPhase,
        title: parts[0] || phase,
        description: parts[1] || "processing",
        status: "complete",
        details: parts[2]?.split(";").map((d) => d.trim()),
        timestamp: Date.now(),
      })
    }
  }

  return steps
}

/**
 * Format thinking steps for display in compact mode
 */
export function formatThinkingStepsSummary(steps: ThinkingStep[]): string {
  const phases = [...new Set(steps.map((s) => s.phase))]
  return phases.join(" → ")
}

/**
 * Categorize steps by phase
 */
export function groupThinkingStepsByPhase(
  steps: ThinkingStep[]
): Record<ThinkingPhase, ThinkingStep[]> {
  const grouped: Record<ThinkingPhase, ThinkingStep[]> = {
    analysis: [],
    planning: [],
    generation: [],
    validation: [],
  }

  steps.forEach((step) => {
    grouped[step.phase].push(step)
  })

  return grouped
}
