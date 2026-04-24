import { getComputerForUser } from "@/lib/computer-access"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerVersion } from "@/lib/computer-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function serializeTimestamp(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }

  return value
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { snap, canAccess } = await getComputerForUser(id, uid)
  if (!snap.exists) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  if (!canAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const versionsSnap = await snap.ref
    .collection("versions")
    .orderBy("versionNumber", "desc")
    .limit(50)
    .get()

  const versions = versionsSnap.docs.map((doc) => {
    const data = doc.data() as Omit<ComputerVersion, "id">
    return {
      id: doc.id,
      ...data,
      createdAt: serializeTimestamp(data.createdAt),
      files: undefined,
    }
  })

  return Response.json({ versions })
}
