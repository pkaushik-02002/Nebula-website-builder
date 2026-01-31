import type { Metadata } from "next"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import Link from "next/link"
import { Check, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Pricing | Builder Studio",
  description: "Start free, scale as you grow. Compare Hobby, Pro, and Team plans.",
}

const plans = [
  {
    name: "Hobby",
    description: "Perfect for trying out Builder Studio",
    price: "$0",
    period: "forever",
    features: [
      "5 AI-generated apps",
      "Basic templates",
      "Community support",
      "Public projects only",
      "Export to GitHub",
    ],
    cta: "Start Building",
    href: "/",
    highlighted: false,
  },
  {
    name: "Pro",
    description: "For developers and small teams",
    price: "$20",
    period: "/month",
    features: [
      "Unlimited AI generations",
      "All premium templates",
      "Priority AI queue",
      "Private projects",
      "Custom domains",
      "Database integrations",
      "API access",
    ],
    cta: "Start Free Trial",
    href: "#",
    highlighted: true,
  },
  {
    name: "Team",
    description: "For agencies and growing teams",
    price: "$49",
    period: "/user/month",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Shared component library",
      "White-label exports",
      "Advanced analytics",
      "Dedicated support",
      "Custom AI training",
    ],
    cta: "Contact Sales",
    href: "#",
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 overflow-x-hidden">
      <Navbar />
      <div className="pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 safe-area-inset-top safe-area-inset-bottom">
        <div className="max-w-5xl mx-auto w-full min-w-0">
          {/* Back link - touch-friendly on mobile */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 min-h-[44px] py-2 -ml-1 pr-2 text-sm text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors mb-8 sm:mb-10 touch-manipulation"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to home</span>
          </Link>

          {/* Header - responsive typography and spacing */}
          <div className="text-center mb-10 sm:mb-14 md:mb-16 px-0 sm:px-2">
            <p className="text-xs sm:text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3 sm:mb-4">
              Pricing
            </p>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-zinc-100 mb-3 sm:mb-4 leading-tight">
              Build without limits
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto text-balance text-sm sm:text-base md:text-lg px-1">
              Start free, scale as you grow. No credit card required.
            </p>
          </div>

          {/* Pricing grid - 1 col mobile, 2 col tablet, 3 col desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl border flex flex-col min-h-0 transition-shadow hover:shadow-lg ${
                  plan.highlighted
                    ? "bg-zinc-100 border-zinc-100 shadow-xl"
                    : "bg-zinc-900/50 border-zinc-800/50"
                }`}
              >
                <div className="mb-4 sm:mb-6">
                  <h2
                    className={`font-heading text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2 ${
                      plan.highlighted ? "text-zinc-900" : "text-zinc-100"
                    }`}
                  >
                    {plan.name}
                  </h2>
                  <p className={`text-xs sm:text-sm ${plan.highlighted ? "text-zinc-600" : "text-zinc-500"}`}>
                    {plan.description}
                  </p>
                </div>
                <div className="mb-4 sm:mb-6">
                  <span
                    className={`font-display text-2xl sm:text-3xl lg:text-4xl font-bold ${
                      plan.highlighted ? "text-zinc-900" : "text-zinc-100"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className={`text-xs sm:text-sm ${plan.highlighted ? "text-zinc-600" : "text-zinc-500"}`}>
                    {plan.period}
                  </span>
                </div>
                <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-1 min-h-0">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                      <Check
                        className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5 ${
                          plan.highlighted ? "text-zinc-900" : "text-zinc-400"
                        }`}
                      />
                      <span
                        className={`text-xs sm:text-sm break-words ${
                          plan.highlighted ? "text-zinc-700" : "text-zinc-400"
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className="block w-full mt-auto min-w-0">
                  <Button
                    className={`w-full rounded-full font-medium text-xs sm:text-sm min-h-[44px] h-10 sm:h-11 touch-manipulation ${
                      plan.highlighted
                        ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                        : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border-0"
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ teaser */}
          <p className="text-center text-xs sm:text-sm text-zinc-500 mt-8 sm:mt-12 px-2">
            Questions?{" "}
            <Link
              href="/help"
              className="text-zinc-300 hover:text-zinc-100 active:text-zinc-100 transition-colors underline underline-offset-2"
            >
              Visit Help & Support
            </Link>
          </p>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
