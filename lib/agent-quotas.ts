export type AgentQuotaPlanId = "free" | "pro" | "team" | "enterprise"

export interface AgentUsageWindow {
  used: number
  remaining: number
  periodStart: Date
  periodEnd: Date
}

export const AGENT_RUN_LIMITS: Record<AgentQuotaPlanId, number> = {
  free: 5,
  pro: 60,
  team: 200,
  enterprise: 400,
}

export function normalizePlanIdForAgentQuota(raw: string | undefined | null): AgentQuotaPlanId {
  const value = (raw || "free").toLowerCase().trim()
  if (value === "enterprise") return "enterprise"
  if (value === "team" || value === "business" || value === "elite") return "team"
  if (value === "pro") return "pro"
  return "free"
}

export function getAgentRunLimitForPlan(planId: string | undefined | null, explicitLimit?: unknown): number {
  const fromUser = Number(explicitLimit)
  if (Number.isFinite(fromUser) && fromUser > 0) {
    return Math.floor(fromUser)
  }
  const normalized = normalizePlanIdForAgentQuota(planId)
  return AGENT_RUN_LIMITS[normalized]
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate()
  }
  const parsed = new Date(raw as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function resolveAgentUsageWindow(params: {
  rawUsage?: unknown
  limit: number
  fallbackPeriodStart: Date
  fallbackPeriodEnd: Date
}): AgentUsageWindow {
  const usage = (params.rawUsage || {}) as Record<string, unknown>
  const used = Math.max(0, Number(usage.used ?? 0))
  const remainingRaw = usage.remaining
  const remaining = Number.isFinite(Number(remainingRaw))
    ? Math.max(0, Number(remainingRaw))
    : Math.max(0, params.limit - used)
  const periodStart = toDate(usage.periodStart) || params.fallbackPeriodStart
  const periodEnd = toDate(usage.periodEnd) || params.fallbackPeriodEnd

  return { used, remaining, periodStart, periodEnd }
}

