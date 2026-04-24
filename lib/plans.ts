/**
 * Shared plan display config and fallbacks.
 * Used by the /pricing page for consistent, dynamic pricing UI.
 */

export type PlanId = "free" | "pro" | "team"

export interface PlanDisplayConfig {
  description: string
  recommended?: boolean
  agentRunsPerPeriod: number
  features: string[]
}

function createPlanFeatures(tokenLabel: string, agentRunsPerPeriod: number, extras: string[]) {
  return [
    tokenLabel,
    `${agentRunsPerPeriod} agent runs per period`,
    ...extras,
  ]
}

export const PLAN_DISPLAY: Record<PlanId, PlanDisplayConfig> = {
  free: {
    description: "Perfect for trying lotus.build before going live.",
    agentRunsPerPeriod: 5,
    features: createPlanFeatures("10,000 credits/month", 5, [
      "Community support",
      "Public projects",
      "Export to GitHub",
    ]),
  },
  pro: {
    description: "For founders shipping production sites with AI speed.",
    recommended: true,
    agentRunsPerPeriod: 60,
    features: createPlanFeatures("120,000 credits/month", 60, [
      "Premium templates + visual edit",
      "Priority support",
    ]),
  },
  team: {
    description: "Agency-grade scale for teams shipping many client sites.",
    agentRunsPerPeriod: 200,
    features: createPlanFeatures("500,000 credits/month", 200, [
      "Client handoff + white-label",
      "Priority support",
    ]),
  },
}

export interface PlanForApi {
  id: string
  name: string
  price: number
  interval: string
  priceId: string | null
  tokensPerMonth: number
  features: string[]
}

/** Credit/token tier for paid plans; user selects one and pricing updates. */
export interface PlanTier {
  tokensPerMonth: number
  priceCents: number
  priceId: string | null
  quantity: number
}

/**
 * Get tiers for a paid plan based purely on live Stripe/plan data.
 * For now, each paid plan exposes a single tier that matches its
 * configured tokensPerMonth and price. If you add additional Stripe
 * prices per plan in the API, you can extend this to return multiple
 * tiers per plan.
 */
export function getPaidPlanTiers(plan: PlanForApi): PlanTier[] {
  const baseTokens = Math.max(1, plan.tokensPerMonth || 1)
  const basePrice = Math.max(0, plan.price || 0)

  const multipliers =
    baseTokens >= 500000
      ? [1, 2, 3, 4]
      : [1, 2, 3, 4, 6]

  return multipliers.map((quantity) => ({
    tokensPerMonth: baseTokens * quantity,
    priceCents: basePrice * quantity,
    priceId: plan.priceId,
    quantity,
  }))
}

/** Default plans when API returns empty or fails. */
export const DEFAULT_PLANS_FALLBACK: PlanForApi[] = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    interval: "forever",
    priceId: null,
    tokensPerMonth: 10000,
    features: PLAN_DISPLAY.free.features,
  },
  {
    id: "pro",
    name: "Pro",
    price: 9900,
    interval: "month",
    priceId: null,
    tokensPerMonth: 120000,
    features: PLAN_DISPLAY.pro.features,
  },
  {
    id: "team",
    name: "Agency",
    price: 29900,
    interval: "month",
    priceId: null,
    tokensPerMonth: 500000,
    features: PLAN_DISPLAY.team.features,
  },
]

/** Normalize API plan id to PlanId for display config lookup. */
export function planIdForDisplay(id: string): PlanId {
  const lower = id.toLowerCase()
  if (lower === "free" || lower === "hobby" || lower === "starter") return "free"
  if (lower === "team" || lower === "agency" || lower === "business" || lower === "elite" || lower === "enterprise") return "team"
  return "pro"
}

export function getAgentRunLimitForPlan(planId: string): number {
  return PLAN_DISPLAY[planIdForDisplay(planId)].agentRunsPerPeriod
}
