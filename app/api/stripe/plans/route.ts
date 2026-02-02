import { NextRequest } from "next/server"
import Stripe from "stripe"

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!stripe) {
    return Response.json({
      plans: [
        { id: "free", name: "Hobby", price: 0, interval: "forever", priceId: null, tokensPerMonth: 10000, features: ["10,000 tokens/month", "Basic templates", "Community support", "Public projects", "Export to GitHub"] },
        { id: "pro", name: "Pro", price: 2000, interval: "month", priceId: process.env.STRIPE_PRICE_ID_PRO || null, tokensPerMonth: 50000, features: ["50,000 tokens/month", "All templates", "Priority queue", "Private projects", "Custom domains", "Database integrations", "API access"] },
        { id: "team", name: "Team", price: 4900, interval: "month", priceId: process.env.STRIPE_PRICE_ID_TEAM || null, tokensPerMonth: 500000, features: ["500,000 tokens/month", "Everything in Pro", "Team collaboration", "Shared library", "White-label", "Dedicated support"] },
      ],
    })
  }

  try {
    const prices = await stripe.prices.list({
      active: true,
      type: "recurring",
      expand: ["data.product"],
    })

    const plans: Array<{
      id: string
      name: string
      price: number
      interval: string
      priceId: string
      tokensPerMonth: number
      features: string[]
    }> = [
      {
        id: "free",
        name: "Hobby",
        price: 0,
        interval: "forever",
        priceId: "",
        tokensPerMonth: 10000,
        features: ["10,000 tokens/month", "Basic templates", "Community support", "Public projects", "Export to GitHub"],
      },
    ]

    for (const p of prices.data) {
      const product = p.product as Stripe.Product
      if (typeof product === "string" || !product) continue
      const meta = (p as any).metadata || {}
      const name = (product.name || p.nickname || "Plan").trim()
      const planId = meta.plan_id || (name.toLowerCase().includes("pro") ? "pro" : name.toLowerCase().includes("team") ? "team" : "pro")
      const tokensPerMonth = meta.tokens_per_month ? parseInt(meta.tokens_per_month, 10) : planId === "team" ? 500000 : 50000
      const amount = p.unit_amount ?? 0
      plans.push({
        id: planId,
        name,
        price: amount,
        interval: p.recurring?.interval === "year" ? "year" : "month",
        priceId: p.id,
        tokensPerMonth,
        features: product.metadata?.features ? (typeof product.metadata.features === "string" ? product.metadata.features.split(",").map((s) => s.trim()) : []) : [`${tokensPerMonth.toLocaleString()} tokens/month`],
      })
    }

    return Response.json({ plans })
  } catch (err) {
    console.error("[Stripe plans]", err)
    return Response.json({
      plans: [
        { id: "free", name: "Hobby", price: 0, interval: "forever", priceId: null, tokensPerMonth: 10000, features: ["10,000 tokens/month", "Basic templates", "Community support"] },
        { id: "pro", name: "Pro", price: 2000, interval: "month", priceId: process.env.STRIPE_PRICE_ID_PRO || null, tokensPerMonth: 50000, features: ["50,000 tokens/month", "Priority support", "Private projects"] },
        { id: "team", name: "Team", price: 4900, interval: "month", priceId: process.env.STRIPE_PRICE_ID_TEAM || null, tokensPerMonth: 500000, features: ["500,000 tokens/month", "Team collaboration", "Dedicated support"] },
      ],
    })
  }
}
