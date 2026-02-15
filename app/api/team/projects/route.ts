import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toIso(v: any): string | null {
  if (!v) return null
  if (typeof v?.toDate === "function") return v.toDate().toISOString()
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const url = new URL(req.url)
    const workspaceIdFilter = url.searchParams.get("workspaceId")?.trim() || null

    const membershipsSnap = await adminDb
      .collection("workspace_members")
      .where("userId", "==", uid)
      .get()

    const memberWorkspaceIds = membershipsSnap.docs
      .map((d) => (d.data() as any)?.workspaceId as string | undefined)
      .filter((v): v is string => !!v)

    if (memberWorkspaceIds.length === 0) {
      return NextResponse.json({ projects: [] })
    }

    let workspaceIds = memberWorkspaceIds
    if (workspaceIdFilter) {
      workspaceIds = memberWorkspaceIds.includes(workspaceIdFilter) ? [workspaceIdFilter] : []
    }
    if (workspaceIds.length === 0) return NextResponse.json({ projects: [] })

    const workspaceSnaps = await Promise.all(
      workspaceIds.map((wid) => adminDb.collection("workspaces").doc(wid).get())
    )
    const workspaceNameById = new Map<string, string>()
    for (const s of workspaceSnaps) {
      if (!s.exists) continue
      workspaceNameById.set(s.id, ((s.data() as any)?.name as string) || "Workspace")
    }

    const projectDocs = []
    for (const ids of chunk(workspaceIds, 10)) {
      const snap = await adminDb.collection("projects").where("workspaceId", "in", ids).get()
      projectDocs.push(...snap.docs)
    }

    const projects = projectDocs
      .map((d) => {
        const data = d.data() as any
        const createdAtIso = toIso(data.createdAt)
        const updatedAtIso = toIso(data.updatedAt)
        return {
          id: d.id,
          prompt: data.prompt || "",
          status: data.status || "pending",
          model: data.model || null,
          visibility: data.visibility || "private",
          slug: data.slug || null,
          workspaceId: data.workspaceId || null,
          workspaceName: data.workspaceId ? workspaceNameById.get(data.workspaceId) || "Workspace" : "Workspace",
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
          sandboxUrl: data.sandboxUrl || null,
          sortKey: updatedAtIso || createdAtIso || "",
        }
      })
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
      .map(({ sortKey, ...rest }) => rest)

    return NextResponse.json({ projects })
  } catch (err: any) {
    const message = err?.message || "Request failed"
    const status = message.includes("Authorization") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
