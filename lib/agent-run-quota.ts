import { Timestamp } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase-admin"
import { getAgentRunLimitForPlan, planIdForDisplay } from "@/lib/plans"

type AgentRunUsageRecord = {
  planId?: unknown
  used?: unknown
  remaining?: unknown
  periodStart?: unknown
  periodEnd?: unknown
}

export class AgentRunQuotaExceededError extends Error {
  status = 402 as const
  limit: number
  periodEnd: Date

  constructor(limit: number, periodEnd: Date) {
    super(`You’ve reached your ${limit} agent runs for this period. Your allowance resets on ${periodEnd.toLocaleDateString()}.`)
    this.name = "AgentRunQuotaExceededError"
    this.limit = limit
    this.periodEnd = periodEnd
  }
}

function getFirstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function getDateFromUnknown(raw: unknown): Date | null {
  if (!raw) return null
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate()
  }

  const value = new Date(raw as string | number)
  return Number.isNaN(value.getTime()) ? null : value
}

export async function consumeAgentRun(uid: string) {
  const userRef = adminDb.collection("users").doc(uid)

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) {
      throw new Error("user-not-found")
    }

    const data = snap.data() as Record<string, unknown>
    const rawPlanId = typeof data.planId === "string" ? data.planId : "free"
    const normalizedPlanId = planIdForDisplay(rawPlanId)
    const limit = getAgentRunLimitForPlan(rawPlanId)
    const usage = (data.agentRunUsage ?? {}) as AgentRunUsageRecord

    const now = new Date()
    const currentPeriodEnd = getDateFromUnknown(usage.periodEnd)
    const currentPeriodStart = getDateFromUnknown(usage.periodStart)
    const storedPlanId = typeof usage.planId === "string" ? usage.planId : null
    const shouldReset =
      storedPlanId !== normalizedPlanId ||
      !currentPeriodEnd ||
      Number.isNaN(currentPeriodEnd.getTime()) ||
      now >= currentPeriodEnd

    const periodStart = shouldReset ? now : currentPeriodStart ?? now
    const periodEnd = shouldReset ? getFirstDayOfNextMonth(now) : currentPeriodEnd
    const priorUsed = shouldReset ? 0 : Math.max(0, Number(usage.used ?? 0))
    const priorRemainingRaw = shouldReset ? limit : usage.remaining
    const priorRemaining =
      priorRemainingRaw === undefined || priorRemainingRaw === null
        ? Math.max(0, limit - priorUsed)
        : Math.max(0, Number(priorRemainingRaw))

    if (priorRemaining <= 0) {
      throw new AgentRunQuotaExceededError(limit, periodEnd)
    }

    const nextUsed = priorUsed + 1
    const nextRemaining = Math.max(0, priorRemaining - 1)

    tx.set(
      userRef,
      {
        agentRunUsage: {
          planId: normalizedPlanId,
          used: nextUsed,
          remaining: nextRemaining,
          periodStart: Timestamp.fromDate(periodStart),
          periodEnd: Timestamp.fromDate(periodEnd),
        },
      },
      { merge: true }
    )

    return {
      limit,
      used: nextUsed,
      remaining: nextRemaining,
      periodEnd,
    }
  })
}
