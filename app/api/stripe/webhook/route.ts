import { NextRequest } from "next/server"
import Stripe from "stripe"
import { adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return Response.json({ error: "Stripe webhook not configured" }, { status: 500 })
  }

  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error("[Stripe webhook] Signature verification failed:", err.message)
    return Response.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const uid = session.client_reference_id as string | null
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
        if (subscriptionId && uid) {
          await syncSubscriptionToUser(subscriptionId, uid)
        } else if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          const fallbackUid = sub.metadata?.firebase_uid || uid
          if (fallbackUid) await syncSubscriptionToUser(subscriptionId, fallbackUid)
        }
        break
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription
        const uid = subscription.metadata?.firebase_uid
        if (uid) await syncSubscriptionToUser(subscription.id, uid)
        break
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const uid = subscription.metadata?.firebase_uid
        if (uid) await setUserPlan(uid, "free", 10000, null)
        break
      }
      default:
        // ignore other events
        break
    }
  } catch (err) {
    console.error("[Stripe webhook] Handler error:", err)
    return Response.json({ error: "Webhook handler failed" }, { status: 500 })
  }

  return Response.json({ received: true })
}

async function syncSubscriptionToUser(subscriptionId: string, uid: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price.product"] })
  if (sub.status !== "active" && sub.status !== "trialing") {
    await setUserPlan(uid, "free", 10000, null)
    return
  }

  const price = sub.items.data[0]?.price
  const quantity = Math.max(1, sub.items.data[0]?.quantity || 1)
  if (!price) return

  const product = price.product as Stripe.Product
  const productName = (product?.name || "").toLowerCase()
  const meta = (price as any).metadata || {}
  const planId = meta.plan_id || (productName.includes("pro") ? "pro" : productName.includes("team") ? "team" : "pro")
  const baseTokensPerMonth = meta.tokens_per_month ? parseInt(meta.tokens_per_month, 10) : planId === "team" ? 500000 : 120000
  const tokensPerMonth = Math.max(1, baseTokensPerMonth) * quantity

  await setUserPlan(uid, planId, tokensPerMonth, subscriptionId)
}

function getFirstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

async function setUserPlan(uid: string, planId: string, tokensPerMonth: number, stripeSubscriptionId: string | null) {
  const userRef = adminDb.collection("users").doc(uid)
  const snap = await userRef.get()
  if (!snap.exists) return

  const data = snap.data() as any
  const prevPlanId = data?.planId || "free"
  const existingUsage = data?.tokenUsage || {}
  const now = new Date()

  let used = typeof existingUsage.used === "number" ? existingUsage.used : 0
  let remaining =
    typeof existingUsage.remaining === "number"
      ? existingUsage.remaining
      : Math.max(0, tokensPerMonth - used)
  const existingAgentUsage = data?.agentUsage || {}
  let agentUsed = typeof existingAgentUsage.used === "number" ? existingAgentUsage.used : 0
  const agentRunLimit = getAgentRunLimitForPlan(planId, data?.agentRunLimit)
  let agentRemaining =
    typeof existingAgentUsage.remaining === "number"
      ? existingAgentUsage.remaining
      : Math.max(0, agentRunLimit - agentUsed)

  let periodStartRaw = existingUsage.periodStart
  let periodEndRaw = existingUsage.periodEnd

  const periodStart =
    periodStartRaw && typeof (periodStartRaw as any).toDate === "function"
      ? (periodStartRaw as any).toDate()
      : periodStartRaw
      ? new Date(periodStartRaw)
      : now

  const periodEnd =
    periodEndRaw && typeof (periodEndRaw as any).toDate === "function"
      ? (periodEndRaw as any).toDate()
      : periodEndRaw
      ? new Date(periodEndRaw)
      : getFirstDayOfNextMonth(now)

  const planChanged = prevPlanId !== planId

  // If the user upgraded/downgraded plan, start a fresh monthly bucket
  if (planChanged) {
    used = 0
    remaining = tokensPerMonth
    agentUsed = 0
    agentRemaining = agentRunLimit
  }

  const planName = planId.charAt(0).toUpperCase() + planId.slice(1)

  await userRef.update({
    planId,
    planName,
    tokensLimit: tokensPerMonth,
    agentRunLimit,
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    tokenUsage: {
      used,
      remaining: Math.max(0, remaining),
      periodStart: Timestamp.fromDate(planChanged ? now : periodStart),
      periodEnd: Timestamp.fromDate(planChanged ? getFirstDayOfNextMonth(now) : periodEnd),
    },
    agentUsage: {
      used: Math.max(0, agentUsed),
      remaining: Math.max(0, agentRemaining),
      periodStart: Timestamp.fromDate(planChanged ? now : periodStart),
      periodEnd: Timestamp.fromDate(planChanged ? getFirstDayOfNextMonth(now) : periodEnd),
    },
  })
  console.log("[Stripe webhook] Updated user", uid, "to plan", planId, "tokensLimit", tokensPerMonth)
}
