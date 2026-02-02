import { NextRequest } from "next/server"
import Stripe from "stripe"
import { adminAuth } from "@/lib/firebase-admin"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Stripe is not configured" }, { status: 500 })
  }

  let uid: string
  const authHeader = req.headers.get("authorization")
  let body: { idToken?: string; priceId?: string; successUrl?: string; cancelUrl?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const idToken = authHeader?.replace(/Bearer\s+/i, "")?.trim() || body.idToken
  if (!idToken) {
    return Response.json({ error: "Missing idToken" }, { status: 401 })
  }
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return Response.json({ error: "Invalid idToken" }, { status: 401 })
  }

  const priceId = body.priceId as string
  const successUrl = body.successUrl as string
  const cancelUrl = body.cancelUrl as string

  if (!priceId || typeof priceId !== "string") {
    return Response.json({ error: "Missing priceId" }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
  const success = successUrl || `${baseUrl}/projects?checkout=success`
  const cancel = cancelUrl || `${baseUrl}/pricing?checkout=cancelled`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      client_reference_id: uid,
      subscription_data: {
        metadata: { firebase_uid: uid },
        ...(process.env.FRIEND_STRIPE_ACCOUNT_ID
          ? {
              transfer_data: {
                destination: process.env.FRIEND_STRIPE_ACCOUNT_ID,
                amount_percent: 50,
              },
            }
          : {}),
      },
      allow_promotion_codes: true,
    })

    return Response.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error("[Stripe checkout]", err)
    return Response.json({ error: err?.message || "Checkout failed" }, { status: 500 })
  }
}
