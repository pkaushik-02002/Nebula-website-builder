import OpenAI from "openai"

import type { Message } from "@/app/project/[id]/types"
import type { GenerationMeta } from "@/lib/generation-meta"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type ProjectFile = { path: string; content: string }

export type SupabaseProvisionPlan = {
  shouldProvision: boolean
  reason: string
  needsSchema: boolean
  needsClientIntegration: boolean
}

function trimContent(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n/* truncated */` : value
}

function extractJsonObject(content: string) {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Failed to parse provisioning analysis response")
  }

  return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>
}

function parseFileBlocks(content: string): ProjectFile[] {
  const files: ProjectFile[] = []
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()

    if (path && fileContent) {
      files.push({ path, content: fileContent })
    }
  }

  return files
}

export function mergeProjectFiles(existingFiles: ProjectFile[], updates: ProjectFile[]): ProjectFile[] {
  const next = new Map(existingFiles.map((file) => [file.path, file]))
  for (const update of updates) {
    next.set(update.path, update)
  }
  return Array.from(next.values())
}

export async function analyzeSupabaseProvisioningNeed(input: {
  prompt: string
  projectName?: string
  messages?: Message[]
  files?: ProjectFile[]
  generationMeta?: GenerationMeta | Record<string, unknown>
}): Promise<SupabaseProvisionPlan> {
  const messageContext = (input.messages || [])
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")

  const fileContext = (input.files || [])
    .slice(0, 10)
    .map((file) => `FILE: ${file.path}\n${trimContent(file.content, 1800)}`)
    .join("\n\n")

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You decide whether a website/app project needs active Supabase provisioning. Use the real project context, not keyword heuristics. Reply with JSON only: {\"shouldProvision\":boolean,\"reason\":string,\"needsSchema\":boolean,\"needsClientIntegration\":boolean}. Mark shouldProvision true only when the current product clearly needs a real database/auth/backend path or the existing generated code expects one. If the app is static/UI-only, return false.",
      },
      {
        role: "user",
        content: [
          input.projectName ? `Project name: ${input.projectName}` : "",
          `Prompt: ${input.prompt}`,
          input.generationMeta ? `Generation meta: ${JSON.stringify(input.generationMeta)}` : "",
          messageContext ? `Recent messages:\n${messageContext}` : "",
          fileContext ? `Current files:\n${fileContext}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  })

  const payload = extractJsonObject(response.choices[0]?.message?.content || "")
  return {
    shouldProvision: payload.shouldProvision === true,
    reason: typeof payload.reason === "string" && payload.reason.trim()
      ? payload.reason.trim()
      : "Supabase provisioning is required for this project.",
    needsSchema: payload.needsSchema !== false,
    needsClientIntegration: payload.needsClientIntegration !== false,
  }
}

export async function generateSupabaseIntegrationUpdates(input: {
  prompt: string
  projectName?: string
  messages?: Message[]
  files: ProjectFile[]
  schemaSql: string
  supabaseUrl: string
  anonKeyPresent: boolean
  setupReason: string
}): Promise<ProjectFile[]> {
  const messageContext = (input.messages || [])
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")

  const fileContext = input.files
    .map((file) => `--- FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`)
    .join("\n")

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content: [
          "You are a senior product engineer integrating Supabase into an existing Vite + React + TypeScript codebase.",
          "Use the actual product context and existing files. Do not add placeholder sample data, fake CRUD, or static dummy flows.",
          "Do not invent pages or features the app does not already imply.",
          "If the existing app has forms, auth flows, dashboards, saved data, or user accounts, wire those to Supabase pragmatically.",
          "Always use env vars for Supabase credentials, never inline secrets.",
          "If you import @supabase/supabase-js, update package.json accordingly.",
          "Output only changed or new files in this exact format:",
          "===FILE: path/to/file.tsx===",
          "[full file content]",
          "===END_FILE===",
          "No extra commentary.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          input.projectName ? `Project name: ${input.projectName}` : "",
          `App prompt: ${input.prompt}`,
          `Why Supabase is needed: ${input.setupReason}`,
          messageContext ? `Recent conversation:\n${messageContext}` : "",
          `Supabase is connected. Use env vars named VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Connected URL exists: ${input.supabaseUrl}. Anon key present: ${input.anonKeyPresent}.`,
          `Database schema SQL:\n${input.schemaSql}`,
          "Current project files:",
          fileContext,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  })

  return parseFileBlocks(response.choices[0]?.message?.content || "")
}
