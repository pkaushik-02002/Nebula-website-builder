"use client"

import { useEffect, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type ProjectStatus = "pending" | "generating" | "complete" | "error"
export type ProjectScope = "user" | "team"

export type ProjectListItem = {
  id: string
  prompt: string
  model?: string
  status: ProjectStatus
  visibility?: "public" | "private" | "link-only"
  createdAt?: any
  updatedAt?: any
  sandboxUrl?: string
  workspaceId?: string
  workspaceName?: string
}

type UseProjectListOptions = {
  scope: ProjectScope
  uid?: string | null
  workspaceId?: string | null
  getAuthHeader?: () => Promise<Record<string, string>>
}

export function useProjectList({
  scope,
  uid,
  workspaceId,
  getAuthHeader,
}: UseProjectListOptions) {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    setLoading(true)
    setError(null)

    if (!uid) {
      setProjects([])
      setLoading(false)
      return
    }

    if (scope === "user") {
      // Merge legacy and current ownership fields without requiring a composite index.
      const byId = new Map<string, ProjectListItem>()
      let ownerLoaded = false
      let userLoaded = false
      let editorLoaded = false
      let ownerErr: string | null = null
      let userErr: string | null = null
      let editorErr: string | null = null

      const maybeCommit = () => {
        if (!ownerLoaded || !userLoaded || !editorLoaded || cancelled) return
        const merged = Array.from(byId.values()).sort((a, b) => {
          const aTs =
            (typeof a.updatedAt?.toDate === "function" ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || a.createdAt || 0).getTime()) || 0
          const bTs =
            (typeof b.updatedAt?.toDate === "function" ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || b.createdAt || 0).getTime()) || 0
          return bTs - aTs
        })
        setProjects(merged)
        setError(ownerErr || userErr || editorErr)
        setLoading(false)
      }

      const qOwner = query(collection(db, "projects"), where("ownerId", "==", uid))
      const qUser = query(collection(db, "projects"), where("userId", "==", uid))
      const qEditor = query(collection(db, "projects"), where("editorIds", "array-contains", uid))

      const unsubOwner = onSnapshot(
        qOwner,
        (snap) => {
          if (cancelled) return
          ownerLoaded = true
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any
            byId.set(docSnap.id, {
              id: docSnap.id,
              prompt: data.prompt || "",
              model: data.model,
              status: (data.status as ProjectStatus) || "pending",
              visibility: (data.visibility as "public" | "private" | "link-only") || "private",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              sandboxUrl: data.sandboxUrl,
              workspaceId: data.workspaceId,
            })
          })
          maybeCommit()
        },
        (err) => {
          if (cancelled) return
          ownerLoaded = true
          ownerErr = err?.message || "Failed to load projects"
          maybeCommit()
        }
      )

      const unsubUser = onSnapshot(
        qUser,
        (snap) => {
          if (cancelled) return
          userLoaded = true
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any
            byId.set(docSnap.id, {
              id: docSnap.id,
              prompt: data.prompt || "",
              model: data.model,
              status: (data.status as ProjectStatus) || "pending",
              visibility: (data.visibility as "public" | "private" | "link-only") || "private",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              sandboxUrl: data.sandboxUrl,
              workspaceId: data.workspaceId,
            })
          })
          maybeCommit()
        },
        (err) => {
          if (cancelled) return
          userLoaded = true
          userErr = err?.message || "Failed to load projects"
          maybeCommit()
        }
      )

      const unsubEditor = onSnapshot(
        qEditor,
        (snap) => {
          if (cancelled) return
          editorLoaded = true
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any
            byId.set(docSnap.id, {
              id: docSnap.id,
              prompt: data.prompt || "",
              model: data.model,
              status: (data.status as ProjectStatus) || "pending",
              visibility: (data.visibility as "public" | "private" | "link-only") || "private",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              sandboxUrl: data.sandboxUrl,
              workspaceId: data.workspaceId,
            })
          })
          maybeCommit()
        },
        (err) => {
          if (cancelled) return
          editorLoaded = true
          editorErr = err?.message || "Failed to load projects"
          maybeCommit()
        }
      )

      unsub = () => {
        unsubOwner()
        unsubUser()
        unsubEditor()
      }
      return () => {
        cancelled = true
        unsub?.()
      }
    }

    ;(async () => {
      try {
        const authHeader = getAuthHeader ? await getAuthHeader() : {}
        const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""
        const res = await fetch(`/api/team/projects${qs}`, { headers: authHeader })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Failed to load team projects")
        if (cancelled) return
        const items = Array.isArray(json?.projects) ? (json.projects as ProjectListItem[]) : []
        setProjects(items)
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || "Failed to load team projects")
        setProjects([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [scope, uid, workspaceId, getAuthHeader])

  return { projects, loading, error }
}
