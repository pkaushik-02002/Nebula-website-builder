"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Check, ArrowLeft, Loader2, Sparkles, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import {
  PLAN_DISPLAY,
  DEFAULT_PLANS_FALLBACK,
  planIdForDisplay,
  getPaidPlanTiers,
  type PlanForApi,
  type PlanId,
} from "@/lib/plans"
import { cn } from "@/lib/utils"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── all backend logic untouched ──────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter()
  const { user, userData, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<PlanForApi[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [selectedTierByPlanId, setSelectedTierByPlanId] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch("/api/stripe/plans")
      .then((r) => r.json())
      .then((data) => {
        const apiPlans = Array.isArray(data.plans) ? data.plans : []
        const merged = DEFAULT_PLANS_FALLBACK.map((fallback) => {
          const fromApi = apiPlans.find(
            (p: PlanForApi) => planIdForDisplay(p.id) === planIdForDisplay(fallback.id)
          )
          return fromApi
            ? { ...fallback, ...fromApi, priceId: fromApi.priceId ?? fallback.priceId }
            : fallback
        })
        setPlans(merged)
      })
      .catch(() => setPlans(DEFAULT_PLANS_FALLBACK))
      .finally(() => setLoading(false))
  }, [])

  const formatPrice = (cents: number, interval: string) => {
    if (cents === 0) return { price: "$0", period: interval === "forever" ? "forever" : "/mo" }
    const dollars = cents / 100
    return {
      price: `$${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`,
      period: interval === "year" ? "/year" : "/mo",
    }
  }

  const handleSubscribe = async (priceId: string, quantity = 1) => {
    if (!user) {
      router.push("/login?redirect=/pricing")
      return
    }
    setCheckoutLoading(priceId)
    try {
      const idToken = await user.getIdToken()
      const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          priceId,
          quantity,
          successUrl: `${baseUrl}/projects?checkout=success`,
          cancelUrl: `${baseUrl}/pricing?checkout=cancelled`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Checkout failed")
      if (data.url) window.location.href = data.url
      else throw new Error("No checkout URL")
    } catch (e) {
      console.error(e)
      setCheckoutLoading(null)
      alert(e instanceof Error ? e.message : "Checkout failed")
    }
  }

  const displayPlans = plans.length > 0 ? plans : DEFAULT_PLANS_FALLBACK

  const currentPlanId = userData?.planId ? planIdForDisplay(userData.planId) : null
  const fallbackPlanName =
    currentPlanId ? currentPlanId.charAt(0).toUpperCase() + currentPlanId.slice(1) : "Free"
  const planName = userData?.planName || fallbackPlanName
  const tokensUsed = userData?.tokenUsage?.used ?? 0
  const baselineLimitByPlan: Record<PlanId, number> = { free: 10000, pro: 120000, team: 500000 }
  const tokensLimit = userData
    ? Math.max(
        0,
        Number(userData.tokensLimit ?? 0),
        Number(userData.tokenUsage?.used ?? 0) + Number(userData.tokenUsage?.remaining ?? 0),
        currentPlanId ? baselineLimitByPlan[currentPlanId as PlanId] : 0
      )
    : 0
  const remaining = userData
    ? Math.max(0, userData.tokenUsage?.remaining ?? tokensLimit - tokensUsed)
    : 0
  const agentRunLimit = userData ? getAgentRunLimitForPlan(userData.planId, userData.agentRunLimit) : 0
  const agentUsed = userData ? Math.max(0, Number(userData.agentUsage?.used ?? 0)) : 0
  const agentRemaining = userData
    ? Math.max(
        0,
        Number.isFinite(Number(userData.agentUsage?.remaining))
          ? Number(userData.agentUsage?.remaining)
          : agentRunLimit - agentUsed
      )
    : 0
  const normalizeFeatureCopy = (feature: string) => {
    const f = feature.toLowerCase()
    if (f.includes("api")) return "Website publishing and growth-ready workflows"
    if (f.includes("webhook")) return "Smart automation triggers for your website updates"
    if (f.includes("sdk")) return "Built-in visual tools and guided editing controls"
    if (f.includes("rate limit")) return "Higher generation capacity for growing teams"
    return feature
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f5f2]">
      <Navbar />

      <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8">

        {/* ── Back nav ─────────────────────────────────────────── */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back
          </Link>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 sm:block">
            Monthly billing · USD
          </span>
        </div>

        {/* ── Hero split ───────────────────────────────────────── */}
        <div className="mb-2.5 grid overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:grid-cols-2">
          {/* Left: headline */}
          <div className="flex flex-col justify-between border-b border-zinc-100 px-8 py-8 lg:border-b-0 lg:border-r lg:py-10">
            <div>
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                <Sparkles className="h-3 w-3 text-zinc-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Pricing
                </span>
              </div>
              <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-zinc-900 sm:text-[36px]">
                Build, launch,{" "}
                <span className="text-zinc-400">ship</span> — pick the plan that fits.
              </h1>
              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-zinc-500">
                One platform for every stage of your website journey. Start free, upgrade when you&apos;re ready.
              </p>
            </div>
          </div>

          {/* Right: plan guide */}
          <div className="bg-[#fafaf8] px-8 py-8 lg:py-10">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
              Which plan is right for you?
            </p>
            <div className="flex flex-col gap-2">
              {[
                { num: "01", name: "Hobby", desc: "Validate ideas and prototype fast" },
                { num: "02", name: "Pro", desc: "Launch production-ready websites" },
                { num: "03", name: "Agency", desc: "Scale teams and client delivery" },
              ].map((item) => (
                <div
                  key={item.num}
                  className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300"
                >
                  <span className="font-mono text-[10px] font-bold text-zinc-300">{item.num}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-zinc-800">{item.name}</p>
                    <p className="text-[11px] text-zinc-400">{item.desc}</p>
                  </div>
                  <span className="text-[12px] text-zinc-200 transition-colors group-hover:text-zinc-400">→</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Current plan usage (logged-in only) ──────────────── */}
        {user && userData && (
          <div className="mb-2.5 flex flex-col items-start gap-5 rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:gap-6">
            {/* Plan name */}
            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                Current plan
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight text-zinc-900">{planName}</p>
            </div>

            <div className="hidden h-10 w-px bg-zinc-100 sm:block" />

            {/* Usage bar */}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-zinc-900">
                  {remaining.toLocaleString()}
                </span>
                <span className="text-[12px] text-zinc-400">
                  of {tokensLimit.toLocaleString()} credits remaining
                </span>
              </div>
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                  style={{
                    width: `${tokensLimit ? Math.min(100, (remaining / tokensLimit) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                {userData.tokenUsage?.periodEnd
                  ? `Renews ${new Date(userData.tokenUsage.periodEnd).toLocaleDateString()} · `
                  : ""}
                Usage refreshes each billing period
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Agents: {agentRemaining.toLocaleString()} of {agentRunLimit.toLocaleString()} runs remaining this period
              </p>
            </div>

            <div className="hidden h-10 w-px bg-zinc-100 sm:block" />

            {/* Manage */}
            <Link href="/settings" className="shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg border-zinc-200 bg-white px-4 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Manage
              </Button>
            </Link>
          </div>
        )}

        {/* ── Plans section header ──────────────────────────────── */}
        <div className="mb-3 flex items-center justify-between px-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Plans
          </span>
          <span className="text-[11px] text-zinc-400">Upgrade or downgrade anytime</span>
        </div>

        {/* ── Plans grid ───────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-[13px] text-zinc-400">Loading plans…</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-zinc-200 md:grid-cols-3">
            {displayPlans.map((plan, planIdx) => {
              const planKey = planIdForDisplay(plan.id) as PlanId
              const display = PLAN_DISPLAY[planKey] || PLAN_DISPLAY.pro
              const recommended = display.recommended ?? false
              const isFree = plan.id === "free" || planKey === "free"
              const tiers = !isFree ? getPaidPlanTiers(plan) : []
              const selectedTierIndex = tiers.length ? (selectedTierByPlanId[plan.id] ?? 0) : 0
              const selectedTier = tiers[selectedTierIndex] ?? null
              const effectivePrice = selectedTier ? selectedTier.priceCents : plan.price
              const effectiveTokens = selectedTier ? selectedTier.tokensPerMonth : plan.tokensPerMonth
              const effectiveQuantity = selectedTier?.quantity ?? 1
              const effectivePriceId = selectedTier?.priceId ?? plan.priceId
              const hasPriceId = !!effectivePriceId
              const { price: priceStr, period } = formatPrice(effectivePrice, plan.interval)
              const features = display.features.length ? display.features : plan.features

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col",
                    // dividers between columns
                    planIdx > 0 && "border-t border-zinc-200 md:border-l md:border-t-0",
                    recommended ? "bg-zinc-900" : "bg-white"
                  )}
                >
                  {/* Plan header */}
                  <div
                    className={cn(
                      "border-b px-6 pb-5 pt-6",
                      recommended ? "border-white/10" : "border-zinc-100"
                    )}
                  >
                    {recommended && (
                      <div className="mb-3 inline-block rounded-[4px] bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-900">
                        Recommended
                      </div>
                    )}
                    <h2
                      className={cn(
                        "text-[18px] font-bold tracking-tight",
                        recommended ? "text-white" : "text-zinc-900"
                      )}
                    >
                      {plan.name}
                    </h2>
                    <p
                      className={cn(
                        "mt-1 text-[12px] leading-relaxed",
                        recommended ? "text-white/50" : "text-zinc-400"
                      )}
                    >
                      {display.description}
                    </p>
                  </div>

                  {/* Price row */}
                  <div
                    className={cn(
                      "flex items-baseline gap-1 border-b px-6 py-5",
                      recommended ? "border-white/10" : "border-zinc-100"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[32px] font-bold leading-none tracking-[-0.03em]",
                        recommended ? "text-white" : "text-zinc-900"
                      )}
                    >
                      {priceStr}
                    </span>
                    <span
                      className={cn(
                        "text-[12px]",
                        recommended ? "text-white/40" : "text-zinc-400"
                      )}
                    >
                      {period}
                    </span>
                  </div>

                  {/* Credits / tier selector */}
                  <div
                    className={cn(
                      "border-b px-6 py-3.5",
                      recommended
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-zinc-100 bg-zinc-50/60"
                    )}
                  >
                    {isFree ? (
                      <p className={cn("text-[12px]", recommended ? "text-white/50" : "text-zinc-500")}>
                        <span className={cn("font-semibold", recommended ? "text-white" : "text-zinc-800")}>
                          {plan.tokensPerMonth.toLocaleString()}
                        </span>{" "}
                        credits / month
                      </p>
                    ) : tiers.length > 0 ? (
                      <div>
                        <p
                          className={cn(
                            "mb-2 text-[10px] font-bold uppercase tracking-[0.1em]",
                            recommended ? "text-white/40" : "text-zinc-400"
                          )}
                        >
                          Monthly credits
                        </p>
                        <Select
                          value={String(selectedTierIndex)}
                          onValueChange={(v) =>
                            setSelectedTierByPlanId((prev) => ({ ...prev, [plan.id]: Number(v) }))
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-9 w-full rounded-lg border text-[12px] font-semibold",
                              recommended
                                ? "border-white/20 bg-white/10 text-white focus:ring-white/20"
                                : "border-zinc-200 bg-white text-zinc-800 focus:ring-zinc-200"
                            )}
                          >
                            <SelectValue>
                              <span>
                                {effectiveTokens >= 1000
                                  ? `${(effectiveTokens / 1000).toFixed(effectiveTokens % 1000 === 0 ? 0 : 1)}k`
                                  : effectiveTokens.toLocaleString()}{" "}
                                credits /mo
                              </span>
                              <span className={cn("ml-1.5 font-normal", recommended ? "text-white/40" : "text-zinc-400")}>
                                · {priceStr}{period}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-zinc-200 bg-white p-1">
                            {tiers.map((tier, i) => {
                              const tierPrice = formatPrice(tier.priceCents, plan.interval)
                              return (
                                <SelectItem
                                  key={i}
                                  value={String(i)}
                                  className="rounded-lg py-2.5 pl-3 pr-8 text-zinc-800 focus:bg-zinc-50"
                                >
                                  <span className="font-semibold">
                                    {tier.tokensPerMonth >= 1000
                                      ? `${(tier.tokensPerMonth / 1000).toFixed(tier.tokensPerMonth % 1000 === 0 ? 0 : 1)}k`
                                      : tier.tokensPerMonth.toLocaleString()}{" "}
                                    credits /mo
                                  </span>
                                  <span className="ml-2 text-xs text-zinc-400">
                                    {tierPrice.price}{tierPrice.period}
                                  </span>
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className={cn("text-[12px]", recommended ? "text-white/50" : "text-zinc-500")}>
                        <span className={cn("font-semibold", recommended ? "text-white" : "text-zinc-800")}>
                          {plan.tokensPerMonth.toLocaleString()}
                        </span>{" "}
                        credits / month
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="flex flex-1 flex-col gap-2.5 px-6 py-5">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-[1px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full",
                            recommended ? "bg-white/15" : "bg-zinc-100"
                          )}
                        >
                          <Check
                            className={cn(
                              "h-[7px] w-[7px]",
                              recommended ? "text-white/80" : "text-zinc-600"
                            )}
                            strokeWidth={3}
                          />
                        </span>
                        <span
                          className={cn(
                            "text-[12px] leading-snug",
                            recommended ? "text-white/60" : "text-zinc-500"
                          )}
                        >
                          {normalizeFeatureCopy(feature)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div
                    className={cn(
                      "border-t px-6 pb-6 pt-5",
                      recommended ? "border-white/10" : "border-zinc-100"
                    )}
                  >
                    {isFree ? (
                      <Link href="/projects" className="block w-full">
                        <Button
                          variant="outline"
                          className="h-10 w-full rounded-lg border-zinc-200 bg-white text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Start building free
                        </Button>
                      </Link>
                    ) : hasPriceId ? (
                      <Button
                        disabled={!!checkoutLoading || authLoading}
                        className={cn(
                          "h-10 w-full rounded-lg border-0 text-[13px] font-semibold transition-all active:scale-[0.99]",
                          recommended
                            ? "bg-white text-zinc-900 hover:bg-zinc-100"
                            : "bg-zinc-900 text-white hover:bg-zinc-800"
                        )}
                        onClick={() => handleSubscribe(effectivePriceId!, effectiveQuantity)}
                      >
                        {checkoutLoading === effectivePriceId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `Subscribe to ${plan.name}`
                        )}
                      </Button>
                    ) : (
                      <Button
                        disabled
                        className={cn(
                          "h-10 w-full rounded-lg border-0 text-[13px] font-semibold opacity-60",
                          recommended
                            ? "bg-white text-zinc-900"
                            : "bg-zinc-900 text-white"
                        )}
                      >
                        Subscribe to {plan.name}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Footer note ──────────────────────────────────────── */}
        <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[11px] text-zinc-400">
            Prices in USD · Upgrade or downgrade at any time
          </p>
          <Link
            href="/help"
            className="text-[11px] text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-800"
          >
            Need help choosing? Visit Help &amp; Support →
          </Link>
        </div>

      </div>

      <FooterSection />
    </main>
  )
}
