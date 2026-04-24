import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { FieldValue } from "firebase-admin/firestore"
import {
  extractReferenceDomainsFromText,
  extractReferenceUrlsFromText,
  mergeReferenceUrls,
} from "@/lib/computer-agent/reference-urls"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let uid: string
  try {
    uid = await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let prompt: string
  let referenceUrls: string[] = []
  try {
    const body = await req.json()
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""
    if (Array.isArray(body?.referenceUrls)) {
      referenceUrls = body.referenceUrls.filter((u: unknown) => typeof u === "string")
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 })
  }

  const normalizedReferenceUrls = mergeReferenceUrls(
    referenceUrls,
    extractReferenceUrlsFromText(prompt),
    extractReferenceDomainsFromText(prompt)
  )

  const docRef = await adminDb.collection("computers").add({
    ownerId: uid,
    name: prompt.slice(0, 80),
    prompt,
    referenceUrls: normalizedReferenceUrls,
    permissions: {
      requirePlanApproval: true,
    },
    planningStatus: "draft",
    clarificationQuestions: [],
    plan: null,
    status: "idle",
    currentStep: null,
    steps: [],
    actions: [],
    collaboratorIds: [],
    collaborators: [],
    currentVersionId: null,
    versionCount: 0,
    researchSources: [],
    files: [],
    currentGeneratingFile: null,
    sandboxId: null,
    sandboxUrl: null,
    browserbaseSessionId: null,
    browserbaseLiveViewUrl: null,
    deployUrl: null,
    cancelRequested: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return Response.json({ computerId: docRef.id })
}
