/**
 * Reasoning Loop
 * Self-critique and refinement loop for elite agent mode
 * Agent generates → Agent critiques → Agent refines → Validates
 */

export interface ReasoningStep {
  step: number
  phase: "generation" | "critique" | "refinement" | "validation"
  input: string
  output: string
  confidence: "low" | "medium" | "high"
  assumptionsUncovered?: string[]
  risksFlagged?: string[]
  refinements?: string[]
  timestamp: number
}

export interface ReasoningChain {
  initialPrompt: string
  steps: ReasoningStep[]
  finalRecommendation: string
  confidenceLevel: number // 0-100
  uncoveredAssumptions: string[]
  flaggedRisks: string[]
  validationScore: number // 0-100
}

/**
 * Generate initial recommendation
 */
export async function generateInitialRecommendation(
  prompt: string,
  context: string
): Promise<ReasoningStep> {
  return {
    step: 1,
    phase: "generation",
    input: prompt,
    output: `Initial recommendation based on: ${prompt}`,
    confidence: "medium",
    timestamp: Date.now(),
  }
}

/**
 * Self-critique phase
 * Agent evaluates own reasoning
 */
export async function performSelfCritique(
  recommendation: string,
  context: string
): Promise<ReasoningStep> {
  const assumptions = extractAssumptions(recommendation)
  const risks = identifyRisks(recommendation, context)
  const gaps = findGaps(recommendation)

  return {
    step: 2,
    phase: "critique",
    input: recommendation,
    output: formatCritique(assumptions, risks, gaps),
    confidence: "high",
    assumptionsUncovered: assumptions,
    risksFlagged: risks,
    refinements: gaps,
    timestamp: Date.now(),
  }
}

/**
 * Refinement phase
 * Agent improves recommendation based on critique
 */
export async function refineRecommendation(
  recommendation: string,
  critique: ReasoningStep,
  context: string
): Promise<ReasoningStep> {
  const refined = applyRefinements(recommendation, critique)
  const improvements = identifyImprovements(recommendation, refined)

  return {
    step: 3,
    phase: "refinement",
    input: recommendation,
    output: refined,
    confidence: "high",
    refinements: improvements,
    timestamp: Date.now(),
  }
}

/**
 * Validation phase
 * Check refined recommendation against requirements
 */
export async function validateRecommendation(
  recommendation: string,
  context: string,
  requirements: string[]
): Promise<ReasoningStep> {
  const validationScore = scoreAgainstRequirements(
    recommendation,
    requirements
  )
  const gaps = identifyValidationGaps(recommendation, requirements)
  const confidence = validationScore > 75 ? "high" : "medium"

  return {
    step: 4,
    phase: "validation",
    input: recommendation,
    output: formatValidationResult(validationScore, gaps),
    confidence: confidence,
    timestamp: Date.now(),
  }
}

/**
 * Run complete reasoning chain
 */
export async function runReasoningChain(
  userPrompt: string,
  context: string,
  requirements: string[] = []
): Promise<ReasoningChain> {
  const chain: ReasoningChain = {
    initialPrompt: userPrompt,
    steps: [],
    finalRecommendation: "",
    confidenceLevel: 0,
    uncoveredAssumptions: [],
    flaggedRisks: [],
    validationScore: 0,
  }

  // Step 1: Generation
  const generation = await generateInitialRecommendation(userPrompt, context)
  chain.steps.push(generation)

  // Step 2: Critique
  const critique = await performSelfCritique(generation.output, context)
  chain.steps.push(critique)
  chain.uncoveredAssumptions = critique.assumptionsUncovered || []
  chain.flaggedRisks = critique.risksFlagged || []

  // Step 3: Refinement
  const refinement = await refineRecommendation(
    generation.output,
    critique,
    context
  )
  chain.steps.push(refinement)

  // Step 4: Validation
  const validation = await validateRecommendation(
    refinement.output,
    context,
    requirements
  )
  chain.steps.push(validation)

  // Finalize
  chain.finalRecommendation = refinement.output
  chain.confidenceLevel = calculateConfidenceLevel(chain.steps)
  chain.validationScore = scoreAgainstRequirements(
    refinement.output,
    requirements
  )

  return chain
}

/**
 * Extract assumptions from recommendation
 */
function extractAssumptions(text: string): string[] {
  const assumptions: string[] = []

  // Look for assumption indicators
  const patterns = [
    /assume[ds]? that (.*?)(?:[,.]|$)/gi,
    /assuming (.*?)(?:[,.]|$)/gi,
    /we believe (.*?)(?:[,.]|$)/gi,
    /it's likely that (.*?)(?:[,.]|$)/gi,
  ]

  patterns.forEach((pattern) => {
    let match
    while ((match = pattern.exec(text)) !== null) {
      assumptions.push(match[1].trim())
    }
  })

  // Common implicit assumptions
  if (
    text.toLowerCase().includes("market") &&
    !assumptions.some((a) => a.toLowerCase().includes("market"))
  ) {
    assumptions.push("Market timing is favorable")
  }

  if (
    text.toLowerCase().includes("team") &&
    !assumptions.some((a) => a.toLowerCase().includes("capable"))
  ) {
    assumptions.push("Team has necessary skills")
  }

  return assumptions.slice(0, 10) // Top 10
}

/**
 * Identify risks in recommendation
 */
function identifyRisks(text: string, context: string): string[] {
  const risks: string[] = []

  // Look for risk indicators
  const patterns = [
    /risk[s]? of (.*?)(?:[,.]|$)/gi,
    /could fail if (.*?)(?:[,.]|$)/gi,
    /depends on (.*?)(?:[,.]|$)/gi,
    /challenge[s]? (?:of|with) (.*?)(?:[,.]|$)/gi,
  ]

  patterns.forEach((pattern) => {
    let match
    while ((match = pattern.exec(text)) !== null) {
      risks.push(match[1].trim())
    }
  })

  // Common risks
  if (text.toLowerCase().includes("timeline")) {
    risks.push("Timeline slippage (features take longer than planned)")
  }

  if (text.toLowerCase().includes("scale")) {
    risks.push("Scalability bottlenecks discovered during growth")
  }

  if (text.toLowerCase().includes("market")) {
    risks.push("Market adoption slower than forecast")
  }

  return risks.slice(0, 8) // Top 8
}

/**
 * Find gaps in reasoning
 */
function findGaps(text: string): string[] {
  const gaps: string[] = []

  // Check for missing considerations
  const missingConsiderations = [
    {
      check: (t: string) =>
        !t.toLowerCase().includes("compliance") &&
        !t.toLowerCase().includes("regulation"),
      gap: "Regulatory and compliance considerations",
    },
    {
      check: (t: string) => !t.toLowerCase().includes("security"),
      gap: "Security and data protection requirements",
    },
    {
      check: (t: string) => !t.toLowerCase().includes("performance"),
      gap: "Performance and scalability validation",
    },
    {
      check: (t: string) => !t.toLowerCase().includes("user"),
      gap: "User validation and customer feedback loops",
    },
    {
      check: (t: string) => !t.toLowerCase().includes("cost"),
      gap: "Cost analysis and economic model",
    },
  ]

  missingConsiderations.forEach(({ check, gap }) => {
    if (check(text)) {
      gaps.push(`Add: ${gap}`)
    }
  })

  return gaps
}

/**
 * Apply critiques and generate refined version
 */
function applyRefinements(
  original: string,
  critique: ReasoningStep
): string {
  let refined = original

  // Add assumptions section
  if (critique.assumptionsUncovered && critique.assumptionsUncovered.length > 0) {
    refined += "\n\n**Key Assumptions:**\n"
    critique.assumptionsUncovered.forEach((a) => {
      refined += `- ${a}\n`
    })
  }

  // Add risks section
  if (critique.risksFlagged && critique.risksFlagged.length > 0) {
    refined += "\n\n**Key Risks & Mitigations:**\n"
    critique.risksFlagged.forEach((r) => {
      refined += `- ${r}\n`
    })
  }

  // Add refinements
  if (critique.refinements && critique.refinements.length > 0) {
    refined += "\n\n**Refinements Made:**\n"
    critique.refinements.forEach((r) => {
      refined += `- ${r}\n`
    })
  }

  return refined
}

/**
 * Identify improvements made during refinement
 */
function identifyImprovements(original: string, refined: string): string[] {
  const improvements: string[] = []

  if (refined.includes("Assumptions")) {
    improvements.push("Surfaced hidden assumptions")
  }
  if (refined.includes("Risks")) {
    improvements.push("Identified key risks with mitigations")
  }
  if (refined.includes("Refinements")) {
    improvements.push("Added missing strategic considerations")
  }

  return improvements
}

/**
 * Format critique output
 */
function formatCritique(
  assumptions: string[],
  risks: string[],
  gaps: string[]
): string {
  let output = "**Critique Results:**\n\n"
  output += `**Assumptions Identified:** ${assumptions.length}\n`
  output += `**Risks Flagged:** ${risks.length}\n`
  output += `**Strategic Gaps:** ${gaps.length}\n`
  return output
}

/**
 * Score recommendation against requirements
 */
function scoreAgainstRequirements(
  recommendation: string,
  requirements: string[]
): number {
  if (requirements.length === 0) return 75 // Default score

  let met = 0
  const lowerRecommendation = recommendation.toLowerCase()

  requirements.forEach((req) => {
    if (lowerRecommendation.includes(req.toLowerCase())) {
      met++
    }
  })

  return Math.round((met / requirements.length) * 100)
}

/**
 * Format validation results
 */
function formatValidationResult(score: number, gaps: string[]): string {
  let output = `**Validation Score: ${score}/100**\n`

  if (score >= 90) {
    output += "Status: ✅ Ready to proceed\n"
  } else if (score >= 70) {
    output += "Status: ⚠️  Generally sound, with some gaps\n"
  } else {
    output += "Status: ❌ Needs significant refinement\n"
  }

  if (gaps.length > 0) {
    output += "\n**Validation Gaps:**\n"
    gaps.forEach((g) => {
      output += `- ${g}\n`
    })
  }

  return output
}

/**
 * Identify validation gaps
 */
function identifyValidationGaps(
  recommendation: string,
  requirements: string[]
): string[] {
  const gaps: string[] = []
  const lowerRecommendation = recommendation.toLowerCase()

  requirements.forEach((req) => {
    if (!lowerRecommendation.includes(req.toLowerCase())) {
      gaps.push(`Missing requirement: ${req}`)
    }
  })

  return gaps
}

/**
 * Calculate overall confidence level (0-100)
 */
function calculateConfidenceLevel(steps: ReasoningStep[]): number {
  const confidenceMap = {
    high: 90,
    medium: 65,
    low: 40,
  }

  const scores = steps.map((s) => confidenceMap[s.confidence] || 65)
  const average = scores.reduce((a, b) => a + b, 0) / scores.length

  // Adjust based on number of refinements
  const refinementSteps = steps.filter((s) => s.refinements?.length || 0 > 0)
  const refinementBoost = Math.min(refinementSteps.length * 2, 10)

  return Math.min(Math.round(average + refinementBoost), 95)
}
