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
    description: "Perfect for trying out BuildKit",
    features: [
      "Basic templates",
      "Community support",
      "Public projects",
      "Export to GitHub",
    ],
  },
  pro: {
    description: "Designed for fast-moving teams building together in real time.",
    recommended: true,
    features: [
      "All templates",
      "Priority queue",
      "Private projects",
      "Custom domains",
      "Database integrations",
      "API access",
    ],
  },
  team: {
    description: "Advanced controls and power features for growing teams.",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Shared library",
      "White-label",
      "Dedicated support",
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
}

/**
 * Get tiers for a paid plan based purely on live Stripe/plan data.
 * For now, each paid plan exposes a single tier that matches its
 * configured tokensPerMonth and price. If you add additional Stripe
 * prices per plan in the API, you can extend this to return multiple
 * tiers per plan.
 */
export function getPaidPlanTiers(plan: PlanForApi): PlanTier[] {
  return [
    {
      tokensPerMonth: plan.tokensPerMonth,
      priceCents: plan.price,
      priceId: plan.priceId,
    },
  ]
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
    price: 2000,
    interval: "month",
    priceId: null,
    tokensPerMonth: 50000,
    features: PLAN_DISPLAY.pro.features,
  },
  {
    id: "team",
    name: "Team",
    price: 4900,
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
