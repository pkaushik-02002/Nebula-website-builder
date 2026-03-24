"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas"

const PENDING_CREATE_KEY = "buildkit_pending_create"

export function CreateAfterLogin() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, userData, loading } = useAuth()
  const handledRef = useRef(false)

  useEffect(() => {
    if (loading || !user || pathname !== "/") return
    const raw = sessionStorage.getItem(PENDING_CREATE_KEY)
    if (!raw || handledRef.current) return

    let data: {
      prompt: string
      model: string
      creationMode?: "build" | "agent"
      agentSlug?: string
    }
    try {
      data = JSON.parse(raw)
    } catch {
      sessionStorage.removeItem(PENDING_CREATE_KEY)
      return
    }
    if (!data.prompt?.trim()) {
      sessionStorage.removeItem(PENDING_CREATE_KEY)
      return
    }

    handledRef.current = true
    sessionStorage.removeItem(PENDING_CREATE_KEY)
    const agentLimit = getAgentRunLimitForPlan(userData?.planId, userData?.agentRunLimit)
    const agentRemaining = Math.max(
      0,
      Number.isFinite(Number(userData?.agentUsage?.remaining))
        ? Number(userData?.agentUsage?.remaining)
        : agentLimit - Number(userData?.agentUsage?.used ?? 0)
    )
    const resolvedCreationMode: "build" | "agent" =
      data.creationMode === "agent" && agentRemaining <= 0 ? "build" : (data.creationMode || "build")

    addDoc(collection(db, "projects"), {
      prompt: data.prompt.trim(),
      model: data.model || "GPT-4-1 Mini",
      status: "pending",
      creationMode: resolvedCreationMode,
      agentSlug: resolvedCreationMode === "agent" ? data.agentSlug || undefined : undefined,
      createdAt: serverTimestamp(),
      messages: [],
      ownerId: user.uid,
      visibility: "private",
    })
      .then((docRef) => {
        router.replace(`/project/${docRef.id}`)
      })
      .catch((err) => {
        console.error("CreateAfterLogin: failed to create project", err)
        handledRef.current = false
      })
  }, [pathname, user, userData, loading, router])

  return null
}
