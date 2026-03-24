/**
 * Shared plan display config and fallbacks.
 * Used by the /pricing page for consistent, dynamic pricing UI.
 */

export type PlanId = "free" | "pro" | "team"

export interface PlanDisplayConfig {
  description: string
  recommended?: boolean
  features: string[]
}

export const PLAN_DISPLAY: Record<PlanId, PlanDisplayConfig> = {
  free: {
    description: "Perfect for trying BuildKit before going live.",
    features: [
      "10,000 credits/month",
      "5 agent runs per period",
      "Community support",
      "Public projects",
      "Export to GitHub",
    ],
  },
  pro: {
    description: "For founders shipping production sites with AI speed.",
    recommended: true,
    features: [
      "120,000 credits/month",
      "60 agent runs per period",
      "Premium templates + visual edit",
      "Priority support",
    ],
  },
  team: {
    description: "Agency-grade scale for teams shipping many client sites.",
    features: [
      "500,000 credits/month",
      "200 agent runs per period",
      "Client handoff + white-label",
      "Priority support",
    ],
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
  if (lower === "team" || lower === "business" || lower === "elite") return "team"
  return "pro"
}
