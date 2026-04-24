import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { adminDb } from "@/lib/firebase-admin"
import type { ComputerVersion } from "@/lib/computer-types"
import type { ProjectFile } from "@/lib/computer-agent/tools"

type CreateComputerVersionParams = {
  computerId: string
  files: ProjectFile[]
  source: ComputerVersion["source"]
  title?: string
  prompt?: string
  planSummary?: string
  sandboxUrl?: string | null
  deployUrl?: string | null
  createdBy: ComputerVersion["createdBy"]
  createdByUid?: string
}

function getVersionTitle(source: ComputerVersion["source"], versionNumber: number): string {
  if (source === "fix_errors") return `Fix ${versionNumber}`
  if (source === "restore") return `Restore ${versionNumber}`
  return `Version ${versionNumber}`
}

export async function createComputerVersion({
  computerId,
  files,
  source,
  title,
  prompt,
  planSummary,
  sandboxUrl,
  deployUrl,
  createdBy,
  createdByUid,
}: CreateComputerVersionParams): Promise<{ id: string; versionNumber: number }> {
  if (!files.length) throw new Error("Cannot create a version without files")

  const computerRef = adminDb.collection("computers").doc(computerId)
  const versionsRef = computerRef.collection("versions")
  const latestSnap = await versionsRef.orderBy("versionNumber", "desc").limit(1).get()
  const latestNumber = latestSnap.docs[0]?.data()?.versionNumber
  const versionNumber = typeof latestNumber === "number" ? latestNumber + 1 : 1
  const id = nanoid()

  const version: Omit<ComputerVersion, "id"> = {
    versionNumber,
    title: title || getVersionTitle(source, versionNumber),
    source,
    files,
    fileCount: files.length,
    ...(prompt ? { prompt } : {}),
    ...(planSummary ? { planSummary } : {}),
    ...(sandboxUrl !== undefined ? { sandboxUrl } : {}),
    ...(deployUrl !== undefined ? { deployUrl } : {}),
    createdBy,
    ...(createdByUid ? { createdByUid } : {}),
    createdAt: FieldValue.serverTimestamp(),
  }

  await versionsRef.doc(id).set(version)
  await computerRef.update({
    currentVersionId: id,
    versionCount: versionNumber,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { id, versionNumber }
}
