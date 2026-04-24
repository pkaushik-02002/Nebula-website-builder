import Anthropic from "@anthropic-ai/sdk"
import { FieldValue } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { createComputerVersion } from "@/lib/computer-versions"
import { adminDb } from "@/lib/firebase-admin"
import { ComputerBrowserSession } from "./browserbase-session"
import { analyzeComputerBrief } from "./intake"
import {
  extractReferenceDomainsFromText,
  extractReferenceUrlsFromText,
  mergeReferenceUrls,
} from "./reference-urls"
import {
  COMPUTER_TOOLS,
  executeTool,
  type FileGenerationProgress,
  type ProjectFile,
  type ProjectPlan,
} from "./tools"
import type {
  Computer,
  ComputerAction,
  ComputerPermissions,
  ComputerResearchSource,
  ComputerStatus,
  ComputerStep,
  ComputerStepKind,
} from "@/lib/computer-types"

const MAX_FIX_ATTEMPTS = 2

function looksLikeCloneRequest(prompt: string): boolean {
  return /\b(clone|recreate|mirror|imitate|copy|rebuild)\b/i.test(prompt)
}

const STEP_STATUS_MAP: Record<ComputerStepKind, ComputerStatus> = {
  clarify: "planning",
  research: "researching",
  plan: "planning",
  build: "building",
  verify: "verifying",
  fix: "fixing",
  deploy: "deploying",
}

const TOOL_STEP_MAP = {
  browserbase_research: "research",
  plan_project: "plan",
  generate_files: "build",
  run_sandbox: "build",
  verify_preview: "verify",
  fix_errors: "fix",
  deploy_site: "deploy",
} as const satisfies Record<string, ComputerStepKind>

const TOOL_TITLE_MAP: Record<string, string> = {
  browserbase_research: "research references",
  plan_project: "draft plan",
  generate_files: "generate files",
  run_sandbox: "start preview",
  verify_preview: "verify preview",
  fix_errors: "repair issues",
  deploy_site: "deploy site",
}

interface RunSandboxResult {
  previewUrl: string
  sandboxId: string
  errors: string[]
}

interface VerifyPreviewResult {
  passed: boolean
  issues: string[]
}

interface OrchestratorContext {
  computerId: string
  uid: string
  idToken: string
  prompt: string
  browserSession: ComputerBrowserSession
  onFileGenerationProgress?: (progress: FileGenerationProgress) => Promise<void>
}

export interface OrchestratorParams {
  computerId: string
  uid: string
  idToken: string
  prompt: string
  referenceUrls?: string[]
  emitAction: (action: ComputerAction) => Promise<void>
  emitStep: (step: ComputerStep) => Promise<void>
  emitStatus: (status: ComputerStatus, currentStep?: ComputerStepKind) => Promise<void>
  shouldCancel?: () => Promise<boolean>
}

function normalizePermissions(value: unknown): ComputerPermissions {
  if (value && typeof value === "object" && typeof (value as { requirePlanApproval?: unknown }).requirePlanApproval === "boolean") {
    return {
      requirePlanApproval: (value as { requirePlanApproval: boolean }).requirePlanApproval,
    }
  }

  return {
    requirePlanApproval: true,
  }
}

function normalizeResearchSources(value: unknown): ComputerResearchSource[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((source): ComputerResearchSource[] => {
    if (!source || typeof source !== "object") return []
    const record = source as Record<string, unknown>
    if (typeof record.url !== "string" || typeof record.extractedContent !== "string") return []

    return [{
      url: record.url,
      title: typeof record.title === "string" ? record.title : record.url,
      extractedContent: record.extractedContent,
      extractedAt: typeof record.extractedAt === "string" ? record.extractedAt : new Date().toISOString(),
      addedBy: record.addedBy === "user" ? "user" : "agent",
      ...(typeof record.screenshotUrl === "string" ? { screenshotUrl: record.screenshotUrl } : {}),
    }]
  })
}

function shouldRequireVisiblePlanApproval(
  permissions: ComputerPermissions,
  plan: ProjectPlan | null | undefined
): boolean {
  return permissions.requirePlanApproval && plan?.intent !== "website-clone"
}

function buildResearchDigest(prompt: string, sources: ComputerResearchSource[]): string {
  const sourceText = sources
    .map((source) => `Title: ${source.title}\nURL: ${source.url}\n${source.extractedContent}`)
    .join("\n\n---\n\n")

  return [
    `User brief:\n${prompt}`,
    sourceText ? `Reference research:\n${sourceText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function formatPlanMessage(plan: ProjectPlan, requireApproval: boolean): string {
  const lines = [
    "Here is the plan I drafted.",
    plan.summary,
    "",
    `Scope: ${plan.buildScope === "frontend-only" ? "Frontend only" : "Full stack"}`,
    `Pages: ${plan.pages.join(", ") || "TBD"}`,
    `Key features: ${plan.features.join(", ") || "TBD"}`,
    `Stack: ${plan.techChoices.framework} / ${plan.techChoices.styling} / ${plan.techChoices.animations}`,
  ]

  if (plan.researchHighlights.length > 0) {
    lines.push("", "What I'm using from the brief and references:")
    lines.push(...plan.researchHighlights.slice(0, 4).map((item) => `- ${item}`))
  }

  if (plan.assumptions.length > 0) {
    lines.push("", "Assumptions to watch:")
    lines.push(...plan.assumptions.slice(0, 4).map((item) => `- ${item}`))
  }

  lines.push("")
  lines.push(
    requireApproval
      ? "Approve the plan when it looks right, or send changes and I'll revise it."
      : "Plan approval is off, so I can continue into build from this plan."
  )

  return lines.join("\n")
}

function summarizeFilesForFeed(files: unknown): { count: number; paths: string[] } | null {
  if (!Array.isArray(files)) return null

  const paths = files.flatMap((file): string[] => {
    if (!file || typeof file !== "object") return []
    const path = (file as { path?: unknown }).path
    return typeof path === "string" ? [path] : []
  })

  return paths.length > 0
    ? { count: paths.length, paths }
    : null
}

function sanitizeToolPayloadForFeed(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (key === "files") {
        const summary = summarizeFilesForFeed(value)
        if (summary) return [key, summary]
      }

      return [key, value]
    })
  )
}

async function runBuildAgent({
  plan,
  researchSources,
  prompt,
  context,
  emitAction,
  emitStep,
  emitStatus,
  shouldCancel,
  persistArtifacts,
}: {
  plan: ProjectPlan
  researchSources: ComputerResearchSource[]
  prompt: string
  context: OrchestratorContext
  emitAction: OrchestratorParams["emitAction"]
  emitStep: OrchestratorParams["emitStep"]
  emitStatus: OrchestratorParams["emitStatus"]
  shouldCancel?: () => Promise<boolean>
  persistArtifacts: (toolName: string, result: unknown) => Promise<void>
}): Promise<void> {
  const MAX_TURNS = 28
  const researchDigest = buildResearchDigest(prompt, researchSources)

  const systemPrompt = `You are an autonomous web development agent with senior product-design taste.
Your job: build, verify, and deliver a production-quality website that looks custom, modern, and credible.

You have these tools:
- browserbase_research: scrape reference URLs for real content
- plan_project: generate a structured project plan (already done - skip unless revising)
- generate_files: write all production files for the site
- run_sandbox: boot the E2B dev server and get a live preview URL
- verify_preview: open the live URL in a real browser, check for issues
- fix_errors: patch specific files to resolve verification issues
- deploy_site: build + zip + deploy to Netlify (only when user requests deploy)

RULES:
- Think before each tool call. Explain your reasoning in 1-2 sentences first.
- Never call generate_files without first having a plan.
- Treat design quality as a hard requirement, not decoration. Reject generic AI-template layouts.
- Do not accept centered hero + card grid + fake stats + testimonials as a default structure.
- The generated site should have a distinctive design signature tied to the user's domain and content.
- After run_sandbox, always call verify_preview before declaring done.
- If verify_preview finds issues, call fix_errors then run_sandbox + verify_preview again.
- After 2 fix attempts, if issues persist, summarize remaining issues clearly and stop.
- Never call deploy_site unless the user explicitly asked to deploy.
- When verification passes, emit a clear completion message and stop.
- Do not call plan_project again — a plan has already been drafted and approved.

The plan is already approved. Proceed directly to building.`

  const initialMessage = `Build this site now.

Approved plan:
${JSON.stringify(plan, null, 2)}

Research context (use for all copy — no placeholders):
${researchDigest}

Start by calling generate_files with the plan and research.`

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialMessage },
  ]

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const ref = adminDb.collection("computers").doc(context.computerId)
  let turnCount = 0

  while (turnCount < MAX_TURNS) {
    if (await shouldCancel?.()) {
      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "message",
        actor: "system",
        content: "Stopped by you. Send a message to continue.",
      })
      await emitStatus("idle")
      return
    }

    turnCount++

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      tools: COMPUTER_TOOLS,
      messages,
    })

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "thinking",
          actor: "agent",
          content: block.text.trim(),
        })
      }
    }

    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim()

      if (finalText) {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "decision",
          actor: "agent",
          content: finalText,
        })
      }
      await emitStatus("complete")
      return
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length === 0) {
      await emitStatus("complete")
      return
    }

    messages.push({ role: "assistant", content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      const toolName = toolUse.name as keyof typeof TOOL_STEP_MAP
      const toolInput = toolUse.input as Record<string, unknown>

      const sanitizedInput = sanitizeToolPayloadForFeed(toolInput)
      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "tool_call",
        actor: "agent",
        content: toolName,
        toolName,
        toolInput: sanitizedInput,
      })

      const stepKind = TOOL_STEP_MAP[toolName]
      if (stepKind) {
        await emitStatus(STEP_STATUS_MAP[stepKind], stepKind)
        await emitStep({
          id: nanoid(),
          kind: stepKind,
          title: TOOL_TITLE_MAP[toolName] ?? toolName.replace(/_/g, " "),
          status: "active",
          startedAt: new Date().toISOString(),
        })
      }

      if (toolName === "generate_files") {
        await ref.update({
          files: [],
          currentGeneratingFile: null,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }

      try {
        const result = await executeTool(toolName, toolInput, context)

        await persistArtifacts(toolName, result)

        const toolOutputStr = JSON.stringify(
          result && typeof result === "object" && !Array.isArray(result)
            ? sanitizeToolPayloadForFeed(result as Record<string, unknown>)
            : result
        )

        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "tool_result",
          actor: "agent",
          content: toolOutputStr.slice(0, 600),
          toolName,
          toolOutput: toolOutputStr,
        })

        if (stepKind) {
          await emitStep({
            id: nanoid(),
            kind: stepKind,
            title: TOOL_TITLE_MAP[toolName] ?? toolName.replace(/_/g, " "),
            status: "complete",
            finishedAt: new Date().toISOString(),
          })
        }

        const backendStatus =
          toolName === "generate_files" && result && typeof result === "object"
            ? (result as { backend?: { status?: string; reason?: string } }).backend
            : null

        if (backendStatus?.status === "approval-required" || backendStatus?.status === "oauth-required") {
          await emitAction({
            id: nanoid(),
            timestamp: new Date().toISOString(),
            type: "message",
            actor: "system",
            content: backendStatus.status === "oauth-required"
              ? "This build needs a Supabase backend, but Supabase is not connected yet. Connect Supabase in the prompt above and I will continue the backend setup."
              : "This build needs a Supabase backend. Approve the Supabase connection in the prompt above and I will create the schema, wire the app, and restart the preview.",
          })
          await emitStatus("idle")
          return
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolOutputStr,
        })
      } catch (err: any) {
        const errMsg = err?.message ?? "Tool failed"

        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "tool_result",
          actor: "agent",
          content: `Error: ${errMsg}`,
          toolName,
          toolOutput: JSON.stringify({ error: errMsg }),
        })

        if (stepKind) {
          await emitStep({
            id: nanoid(),
            kind: stepKind,
            title: TOOL_TITLE_MAP[toolName] ?? toolName.replace(/_/g, " "),
            status: "failed",
            finishedAt: new Date().toISOString(),
            summary: errMsg,
          })
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: errMsg }),
          is_error: true,
        })
      }
    }

    messages.push({ role: "user", content: toolResults })
  }

  await emitAction({
    id: nanoid(),
    timestamp: new Date().toISOString(),
    type: "message",
    actor: "system",
    content: "Reached maximum agent turns. Review the current state and send a follow-up instruction to continue.",
  })
  await emitStatus("complete")
}

export async function runComputerOrchestrator(params: OrchestratorParams): Promise<void> {
  const {
    computerId,
    uid,
    idToken,
    prompt,
    referenceUrls = [],
    emitAction,
    emitStep,
    emitStatus,
    shouldCancel,
  } = params

  const ref = adminDb.collection("computers").doc(computerId)
  const browserSession = new ComputerBrowserSession(computerId)
  const persistFileGenerationProgress = async (progress: FileGenerationProgress) => {
    await ref.update({
      files: progress.files,
      currentGeneratingFile: progress.currentFilePath,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
  }
  const context: OrchestratorContext = {
    computerId,
    uid,
    idToken,
    prompt,
    browserSession,
    onFileGenerationProgress: persistFileGenerationProgress,
  }
  let cancelHandled = false

  const handleCancellation = async () => {
    if (!(await shouldCancel?.()) || cancelHandled) return false

    cancelHandled = true
    await emitAction({
      id: nanoid(),
      timestamp: new Date().toISOString(),
      type: "message",
      actor: "system",
      content: "Stopped by you. Send another message whenever you're ready to continue.",
    })
    await emitStatus("idle")
    return true
  }

  const persistArtifacts = async (toolName: string, result: unknown) => {
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (toolName === "browserbase_research") {
      updates.researchSources = Array.isArray(result) ? result : []
    }

    if (toolName === "plan_project" && result && typeof result === "object") {
      updates.plan = result
    }

    if (toolName === "generate_files" || toolName === "fix_errors") {
      const files = (result as { files?: ProjectFile[] } | null)?.files
      if (Array.isArray(files)) {
        updates.files = files
        updates.currentGeneratingFile = null
        await createComputerVersion({
          computerId,
          files,
          source: toolName,
          title: toolName === "fix_errors" ? "Fixed version" : "Generated version",
          prompt,
          createdBy: "agent",
          createdByUid: uid,
        }).catch((error) => {
          console.warn("[computer versions] Failed to create version:", error)
        })
      }
    }

    if (toolName === "run_sandbox" && result && typeof result === "object") {
      const sandbox = result as Partial<RunSandboxResult>
      updates.sandboxUrl = sandbox.previewUrl ?? null
      updates.sandboxId = sandbox.sandboxId ?? null
      updates.currentGeneratingFile = null
    }

    if (toolName === "deploy_site" && result && typeof result === "object") {
      const deploy = result as { siteUrl?: string; deployUrl?: string }
      updates.deployUrl = deploy.siteUrl ?? deploy.deployUrl ?? null
    }

    await ref.update(updates).catch(() => {})
  }

  const runTool = async <T,>(
    name: keyof typeof TOOL_STEP_MAP,
    input: Record<string, unknown>
  ): Promise<T> => {
    const stepKind = TOOL_STEP_MAP[name]

    if (name === "generate_files") {
      await ref.update({
        files: [],
        currentGeneratingFile: null,
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})
    }

    const toolInputForFeed = sanitizeToolPayloadForFeed(input)
    await emitStatus(STEP_STATUS_MAP[stepKind], stepKind)

    await emitAction({
      id: nanoid(),
      timestamp: new Date().toISOString(),
      type: "tool_call",
      actor: "agent",
      content: name,
      toolName: name,
      toolInput: toolInputForFeed,
    })

    await emitStep({
      id: nanoid(),
      kind: stepKind,
      title: TOOL_TITLE_MAP[name] ?? name.replace(/_/g, " "),
      status: "active",
      startedAt: new Date().toISOString(),
    })

    try {
      const result = await executeTool(name, input, context)
      const toolOutputForFeed =
        result && typeof result === "object" && !Array.isArray(result)
          ? sanitizeToolPayloadForFeed(result as Record<string, unknown>)
          : result
      const resultStr = JSON.stringify(toolOutputForFeed)

      await persistArtifacts(name, result)

      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "tool_result",
        actor: "agent",
        content: resultStr.slice(0, 600),
        toolName: name,
        toolOutput: resultStr,
      })

      await emitStep({
        id: nanoid(),
        kind: stepKind,
        title: TOOL_TITLE_MAP[name] ?? name.replace(/_/g, " "),
        status: "complete",
        finishedAt: new Date().toISOString(),
      })

      return result as T
    } catch (err: any) {
      const toolError = err?.message ?? "Tool execution failed"

      if (name === "generate_files") {
        await ref.update({
          currentGeneratingFile: null,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }

      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "tool_result",
        actor: "agent",
        content: `Error: ${toolError}`,
        toolName: name,
        toolOutput: JSON.stringify({ error: toolError }),
      })

      await emitStep({
        id: nanoid(),
        kind: stepKind,
        title: TOOL_TITLE_MAP[name] ?? name.replace(/_/g, " "),
        status: "failed",
        finishedAt: new Date().toISOString(),
        summary: toolError,
      })

      throw err
    }
  }

  try {
    const initialSnap = await ref.get()
    const computer = (initialSnap.data() ?? {}) as Partial<Computer>
    const permissions = normalizePermissions(computer.permissions)
    const planningStatus = computer.planningStatus ?? "draft"
    const existingPlan = computer.plan ?? null
    const mergedReferenceUrls = mergeReferenceUrls(
      Array.isArray(computer.referenceUrls) ? computer.referenceUrls : referenceUrls,
      extractReferenceUrlsFromText(prompt),
      extractReferenceDomainsFromText(prompt)
    )
    let researchSources = normalizeResearchSources(computer.researchSources)
    const shouldRetryCloneWithoutWaiting =
      planningStatus === "needs-input" &&
      (computer.clarificationQuestions?.length ?? 0) > 0 &&
      looksLikeCloneRequest(prompt) &&
      mergedReferenceUrls.length > 0

    if (planningStatus === "needs-input" && (computer.clarificationQuestions?.length ?? 0) > 0 && !shouldRetryCloneWithoutWaiting) {
      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "message",
        actor: "system",
        content: "I'm waiting on your answers to the open questions before I continue.",
      })
      await emitStatus("idle")
      return
    }

    if (
      planningStatus === "ready-for-approval" &&
      existingPlan &&
      shouldRequireVisiblePlanApproval(permissions, existingPlan as ProjectPlan)
    ) {
      await emitAction({
        id: nanoid(),
        timestamp: new Date().toISOString(),
        type: "message",
        actor: "system",
        content: "The plan is ready. Approve it when it looks right, or send changes and I'll revise it.",
      })
      await emitStatus("idle")
      return
    }

    const canBuildFromExistingPlan =
      !!existingPlan &&
      (
        planningStatus === "approved" ||
        (!shouldRequireVisiblePlanApproval(permissions, existingPlan as ProjectPlan) && planningStatus === "ready-for-approval")
      )

    let plan = existingPlan as ProjectPlan | null

    if (!canBuildFromExistingPlan) {
      if (await handleCancellation()) return

      await emitStatus("planning", "clarify")
      await emitStep({
        id: nanoid(),
        kind: "clarify",
        title: "assess brief",
        status: "active",
        startedAt: new Date().toISOString(),
      })

      const intake = await analyzeComputerBrief({
        prompt,
        referenceUrls: mergedReferenceUrls,
        permissions,
      })

      await ref.update({
        referenceUrls: intake.referenceUrls,
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})

      if (intake.needsClarification) {
        await emitStep({
          id: nanoid(),
          kind: "clarify",
          title: "assess brief",
          status: "complete",
          finishedAt: new Date().toISOString(),
          summary: "Waiting for user input",
        })

        await ref.update({
          planningStatus: "needs-input",
          clarificationQuestions: intake.clarificationQuestions,
          plan: null,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {})

        await emitStatus("idle")
        return
      }

      await emitStep({
        id: nanoid(),
        kind: "clarify",
        title: "assess brief",
        status: "complete",
        finishedAt: new Date().toISOString(),
      })

      await ref.update({
        planningStatus: "draft",
        clarificationQuestions: [],
        researchSources: [],
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})

      researchSources = intake.shouldResearchReferences && intake.referenceUrls.length > 0
        ? await runTool<ComputerResearchSource[]>("browserbase_research", {
            urls: intake.referenceUrls,
          })
        : []

      if (await handleCancellation()) return

      const researchDigest = buildResearchDigest(prompt, researchSources)
      plan = await runTool<ProjectPlan>("plan_project", {
        prompt,
        research: researchDigest,
      })

      const normalizedPlan: ProjectPlan = {
        ...plan,
        intent: intake.intent,
        buildScope: intake.intent === "website-clone" ? "frontend-only" : plan.buildScope,
        sourceUrls: intake.referenceUrls,
        generatedAt: plan.generatedAt || new Date().toISOString(),
      }

      const requireVisiblePlanApproval = shouldRequireVisiblePlanApproval(permissions, normalizedPlan)
      const nextPlanningStatus = requireVisiblePlanApproval ? "ready-for-approval" : "approved"

      await ref.update({
        plan: normalizedPlan,
        planningStatus: nextPlanningStatus,
        clarificationQuestions: [],
        updatedAt: FieldValue.serverTimestamp(),
        ...(nextPlanningStatus === "approved" ? { approvedAt: FieldValue.serverTimestamp() } : {}),
      }).catch(() => {})

      if (normalizedPlan.intent === "website-clone") {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "message",
          actor: "system",
          content: `Cloning ${normalizedPlan.sourceUrls[0] ?? "the reference site"} homepage frontend and continuing into build.`,
        })
      } else {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "decision",
          actor: "agent",
          content: formatPlanMessage(normalizedPlan, requireVisiblePlanApproval),
        })
      }

      if (requireVisiblePlanApproval) {
        await emitStatus("idle")
        return
      }

      if (normalizedPlan.intent !== "website-clone") {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "message",
          actor: "system",
          content: "Plan approval is off, so I'm continuing into build. You can turn approval back on from Permissions if you want tighter checkpoints.",
        })
      }

      plan = normalizedPlan
      await ref.update({
        planningStatus: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})
    } else if (
      planningStatus === "ready-for-approval" &&
      existingPlan &&
      !shouldRequireVisiblePlanApproval(permissions, existingPlan as ProjectPlan)
    ) {
      await ref.update({
        planningStatus: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})

      if ((existingPlan as ProjectPlan).intent !== "website-clone") {
        await emitAction({
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: "message",
          actor: "system",
          content: "Using the existing plan and continuing into build because plan approval is off.",
        })
      }
    }

    if (!plan) {
      throw new Error("No plan available to build from")
    }

    await runBuildAgent({
      plan: plan as ProjectPlan,
      researchSources,
      prompt,
      context,
      emitAction,
      emitStep,
      emitStatus,
      shouldCancel,
      persistArtifacts,
    })
  } finally {
    await browserSession.close().catch(() => {})
  }
}
