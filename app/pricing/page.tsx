"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Check, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

type Plan = {
  id: string
  name: string
  price: number
  interval: string
  priceId: string | null
  tokensPerMonth: number
  features: string[]
}

export default function PricingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/stripe/plans")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.plans)) setPlans(data.plans)
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }, [])

  const formatPrice = (cents: number, interval: string) => {
    if (cents === 0) return { price: "$0", period: interval === "forever" ? "forever" : "/month" }
    const dollars = cents / 100
    return {
      price: `$${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`,
      period: interval === "year" ? "/year" : "/month",
    }
  }

  const handleSubscribe = async (priceId: string) => {
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

  const defaultPlans: Plan[] = [
    { id: "free", name: "Hobby", price: 0, interval: "forever", priceId: null, tokensPerMonth: 10000, features: ["10,000 tokens/month", "Basic templates", "Community support", "Public projects", "Export to GitHub"] },
    { id: "pro", name: "Pro", price: 2000, interval: "month", priceId: null, tokensPerMonth: 50000, features: ["50,000 tokens/month", "All templates", "Priority queue", "Private projects", "Custom domains", "Database integrations", "API access"] },
    { id: "team", name: "Team", price: 4900, interval: "month", priceId: null, tokensPerMonth: 500000, features: ["500,000 tokens/month", "Everything in Pro", "Team collaboration", "Shared library", "White-label", "Dedicated support"] },
  ]

  const displayPlans = plans.length > 0 ? plans : defaultPlans

  return (
    <main className="min-h-screen bg-zinc-950 overflow-x-hidden">
      <Navbar />
      <div className="pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 safe-area-inset-top safe-area-inset-bottom">
        <div className="max-w-5xl mx-auto w-full min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-2 min-h-[44px] py-2 -ml-1 pr-2 text-sm text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors mb-8 sm:mb-10 touch-manipulation"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to home</span>
          </Link>

          <div className="text-center mb-10 sm:mb-14 md:mb-16 px-0 sm:px-2">
            <p className="text-xs sm:text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3 sm:mb-4">
              Pricing
            </p>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-zinc-100 mb-3 sm:mb-4 leading-tight">
              Build without limits
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto text-balance text-sm sm:text-base md:text-lg px-1">
              Start free, scale as you grow. Upgrade anytime via Stripe — no plan IDs, everything through the API.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-6">
              {displayPlans.map((plan, index) => {
                const highlighted = plan.id === "pro"
                const { price: priceStr, period } = formatPrice(plan.price, plan.interval)
                const isFree = plan.id === "free"
                const hasPriceId = !!plan.priceId

                return (
                  <div
                    key={plan.id}
                    className={`p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl border flex flex-col min-h-0 transition-shadow hover:shadow-lg ${
                      highlighted ? "bg-zinc-100 border-zinc-100 shadow-xl" : "bg-zinc-900/50 border-zinc-800/50"
                    }`}
                  >
                    <div className="mb-4 sm:mb-6">
                      <h2 className={`font-heading text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2 ${highlighted ? "text-zinc-900" : "text-zinc-100"}`}>
                        {plan.name}
                      </h2>
                      <p className={`text-xs sm:text-sm ${highlighted ? "text-zinc-600" : "text-zinc-500"}`}>
                        {plan.tokensPerMonth.toLocaleString()} tokens/month · {plan.features.length} features
                      </p>
                    </div>
                    <div className="mb-4 sm:mb-6">
                      <span className={`font-display text-2xl sm:text-3xl lg:text-4xl font-bold ${highlighted ? "text-zinc-900" : "text-zinc-100"}`}>
                        {priceStr}
                      </span>
                      <span className={`text-xs sm:text-sm ${highlighted ? "text-zinc-600" : "text-zinc-500"}`}>
                        {period}
                      </span>
                    </div>
                    <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-1 min-h-0">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                          <Check className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5 ${highlighted ? "text-zinc-900" : "text-zinc-400"}`} />
                          <span className={`text-xs sm:text-sm break-words ${highlighted ? "text-zinc-700" : "text-zinc-400"}`}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="w-full mt-auto min-w-0">
                      {isFree ? (
                        <Link href="/projects" className="block w-full">
                          <Button
                            className="w-full rounded-full font-medium text-xs sm:text-sm min-h-[44px] h-10 sm:h-11 touch-manipulation bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border-0"
                          >
                            Start Building
                          </Button>
                        </Link>
                      ) : hasPriceId ? (
                        <Button
                          disabled={!!checkoutLoading || authLoading}
                          className={`w-full rounded-full font-medium text-xs sm:text-sm min-h-[44px] h-10 sm:h-11 touch-manipulation border-0 ${
                            highlighted ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                          }`}
                          onClick={() => handleSubscribe(plan.priceId!)}
                        >
                          {checkoutLoading === plan.priceId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Subscribe"
                          )}
                        </Button>
                      ) : (
                        <Link href="/help" className="block w-full">
                          <Button
                            className={`w-full rounded-full font-medium text-xs sm:text-sm min-h-[44px] h-10 sm:h-11 touch-manipulation border-0 ${
                              highlighted ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            }`}
                          >
                            Contact Sales
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-center text-xs sm:text-sm text-zinc-500 mt-8 sm:mt-12 px-2">
            Questions?{" "}
            <Link href="/help" className="text-zinc-300 hover:text-zinc-100 active:text-zinc-100 transition-colors underline underline-offset-2">
              Visit Help & Support
            </Link>
          </p>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
