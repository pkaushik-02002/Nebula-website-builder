import { NextRequest } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { DEFAULT_PLANS } from "@/lib/firebase"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

function getFirstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function getPeriodEndDate(raw: unknown): Date | null {
  if (!raw) return null
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate()
  }
  const d = new Date(raw as string | number)
  return isNaN(d.getTime()) ? null : d
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const idToken = authHeader?.replace(/Bearer\s+/i, "")?.trim()
  if (!idToken) {
    return Response.json({ error: "Missing authorization" }, { status: 401 })
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 })
  }

  const userRef = adminDb.collection("users").doc(uid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    return Response.json({ error: "User not found" }, { status: 404 })
  }

  const data = userSnap.data() as Record<string, unknown>
  const planId = (data?.planId as string) || "free"
  const planTokensPerMonth =
    data?.tokensLimit != null
      ? Number(data.tokensLimit)
      : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth ?? 10000)
  const agentRunLimit = getAgentRunLimitForPlan(planId, data?.agentRunLimit)

  const periodEnd = getPeriodEndDate(data?.tokenUsage && (data.tokenUsage as Record<string, unknown>)?.periodEnd)
  const now = new Date()
  const shouldReset = !periodEnd || isNaN(periodEnd.getTime()) || now >= periodEnd

  if (shouldReset) {
    const nextPeriodEnd = getFirstDayOfNextMonth(now)
    await userRef.update({
      tokenUsage: {
        used: 0,
        remaining: planTokensPerMonth,
        periodStart: Timestamp.fromDate(now),
        periodEnd: Timestamp.fromDate(nextPeriodEnd),
      },
      agentRunLimit,
      agentUsage: {
        used: 0,
        remaining: agentRunLimit,
        periodStart: Timestamp.fromDate(now),
        periodEnd: Timestamp.fromDate(nextPeriodEnd),
      },
    })
  } else if (!data?.agentUsage) {
    const nextPeriodEnd = periodEnd || getFirstDayOfNextMonth(now)
    await userRef.update({
      agentRunLimit,
      agentUsage: {
        used: 0,
        remaining: agentRunLimit,
        periodStart: Timestamp.fromDate(now),
        periodEnd: Timestamp.fromDate(nextPeriodEnd),
      },
    })
  }

  return Response.json({ ok: true, reset: shouldReset })
}
