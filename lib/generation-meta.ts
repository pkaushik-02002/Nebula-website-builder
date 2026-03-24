import {
  type AgentRuntimePhase,
  type AgentSetupRequirement,
  normalizeAgentRuntimePhase,
  normalizeSetupCategory,
} from "@/lib/agent-runtime"

type RawMetaEntry = { key: string; value: string }

export interface GenerationMeta {
  suggestsBackend: boolean
  setupRequirements: AgentSetupRequirement[]
  agentPhase?: AgentRuntimePhase
  blockedReason?: string
}

function parseMetaEntries(content: string): RawMetaEntry[] {
  const entries: RawMetaEntry[] = []
  const regex = /===META:\s*([a-zA-Z0-9._-]+)\s*=\s*([\s\S]*?)===/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const key = (match[1] || "").trim()
    const value = (match[2] || "").trim()
    if (key) {
      entries.push({ key, value })
    }
  }

  return entries
}

export function parseGenerationMeta(content: string): GenerationMeta {
  const entries = parseMetaEntries(content)
  const setupRequirements = new Map<string, AgentSetupRequirement>()
  let suggestsBackend = false
  let agentPhase: AgentRuntimePhase | undefined
  let blockedReason: string | undefined

  for (const entry of entries) {
    const keyLower = entry.key.toLowerCase()
    if (keyLower === "suggestsbackend" && entry.value.toLowerCase() === "true") {
      suggestsBackend = true
      continue
    }

    if (keyLower === "requiressetup") {
      const tokens = entry.value.split(",").map((token) => token.trim()).filter(Boolean)
      for (const token of tokens) {
        const category = normalizeSetupCategory(token)
        if (!category) continue
        if (!setupRequirements.has(category)) {
          setupRequirements.set(category, {
            category,
            reason: "Setup is required before continuing this build path.",
            blocking: true,
          })
        }
      }
      continue
    }

    if (keyLower.startsWith("requiressetup.")) {
      const categoryRaw = keyLower.slice("requiressetup.".length)
      const category = normalizeSetupCategory(categoryRaw)
      if (!category) continue
      if (entry.value.toLowerCase() === "true" && !setupRequirements.has(category)) {
        setupRequirements.set(category, {
          category,
          reason: "Setup is required before continuing this build path.",
          blocking: true,
        })
      }
      continue
    }

    if (keyLower.startsWith("setupreason.")) {
      const categoryRaw = keyLower.slice("setupreason.".length)
      const category = normalizeSetupCategory(categoryRaw)
      if (!category) continue
      const current = setupRequirements.get(category) || {
        category,
        reason: "",
        blocking: true,
      }
      setupRequirements.set(category, {
        ...current,
        reason: entry.value || current.reason || "Setup is required before continuing this build path.",
      })
      continue
    }

    if (keyLower.startsWith("setupblocking.")) {
      const categoryRaw = keyLower.slice("setupblocking.".length)
      const category = normalizeSetupCategory(categoryRaw)
      if (!category) continue
      const current = setupRequirements.get(category) || {
        category,
        reason: "Setup is required before continuing this build path.",
        blocking: true,
      }
      const blocking = entry.value.toLowerCase() !== "false"
      setupRequirements.set(category, {
        ...current,
        blocking,
      })
      continue
    }

    if (keyLower === "agentphase") {
      const parsedPhase = normalizeAgentRuntimePhase(entry.value)
      if (parsedPhase) {
        agentPhase = parsedPhase
      }
      continue
    }

    if (keyLower === "blockedreason" && entry.value) {
      blockedReason = entry.value
    }
  }

  return {
    suggestsBackend,
    setupRequirements: Array.from(setupRequirements.values()),
    ...(agentPhase ? { agentPhase } : {}),
    ...(blockedReason ? { blockedReason } : {}),
  }
}

export function hasGenerationMeta(meta: GenerationMeta): boolean {
  return meta.suggestsBackend || meta.setupRequirements.length > 0 || Boolean(meta.agentPhase) || Boolean(meta.blockedReason)
}
