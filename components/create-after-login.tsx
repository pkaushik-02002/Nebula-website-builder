"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"

const PENDING_CREATE_KEY = "lotus_pending_create"

export function CreateAfterLogin() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const handledRef = useRef(false)

  useEffect(() => {
    if (loading || !user || pathname !== "/") return
    const raw = sessionStorage.getItem(PENDING_CREATE_KEY)
    if (!raw || handledRef.current) return

    let data: {
      prompt: string
      model: string
      buildMode?: "build" | "agents"
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

    if (data.buildMode === "agents") {
      user.getIdToken().then((idToken) => {
        return fetch("/api/computer/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ prompt: data.prompt.trim(), referenceUrls: [] }),
        })
      }).then(async (res) => {
        const json = await res.json()
        if (!res.ok || !json?.computerId) throw new Error(json?.error ?? "Failed to create")
        router.replace(`/computer/${json.computerId}?autostart=1`)
      }).catch((err) => {
        console.error("CreateAfterLogin: failed to create computer", err)
        handledRef.current = false
      })
      return
    }

    const projectData: Record<string, unknown> = {
      prompt: data.prompt.trim(),
      model: data.model || "GPT-4-1 Mini",
      status: "pending",
      createdAt: serverTimestamp(),
      messages: [],
      ownerId: user.uid,
      visibility: "private",
    }

    addDoc(collection(db, "projects"), projectData)
      .then((docRef) => {
        router.replace(`/project/${docRef.id}`)
      })
      .catch((err) => {
        console.error("CreateAfterLogin: failed to create project", err)
        handledRef.current = false
      })
  }, [pathname, user, loading, router])

  return null
}
