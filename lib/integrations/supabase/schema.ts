import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export function extractSqlTables(sql: string): string[] {
  const tableMatches = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/gi)]
  return Array.from(
    new Set(
      tableMatches
        .map((m) => m[1]?.replace(/"/g, "").split(".").pop() || "")
        .filter(Boolean)
    )
  )
}

function cleanSql(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ""
  // Strip fenced blocks if model returns markdown.
  return trimmed
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

export async function generatePostgresSchema(input: {
  appPrompt: string
  projectName?: string
  companyContext?: string
  existingFiles?: Array<{ path: string; content: string }>
  conversationMessages?: string[]
  setupReason?: string
}): Promise<{ sql: string; tables: string[] }> {
  const fileContext = (input.existingFiles || [])
    .slice(0, 12)
    .map((file) => {
      const content = file.content.length > 2200 ? `${file.content.slice(0, 2200)}\n/* truncated */` : file.content
      return `FILE: ${file.path}\n${content}`
    })
    .join("\n\n")

  const conversationContext = (input.conversationMessages || [])
    .slice(-8)
    .map((message, index) => `Message ${index + 1}: ${message}`)
    .join("\n")

  const userPrompt = [
    "Generate a PostgreSQL schema for this application.",
    input.projectName ? `Project name: ${input.projectName}` : "",
    `Application description: ${input.appPrompt}`,
    input.companyContext ? `Company context: ${input.companyContext}` : "",
    input.setupReason ? `Why backend setup is needed: ${input.setupReason}` : "",
    conversationContext ? `Recent project conversation:\n${conversationContext}` : "",
    fileContext ? `Current project files:\n${fileContext}` : "",
    "Return only SQL. No markdown. Prefer UUID primary keys, created_at timestamps, and pragmatic indexes.",
  ]
    .filter(Boolean)
    .join("\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a senior PostgreSQL architect. Return production-ready SQL only.",
      },
      { role: "user", content: userPrompt },
    ],
  })

  const raw = completion.choices[0]?.message?.content || ""
  const sql = cleanSql(raw)
  const tables = extractSqlTables(sql)
  return { sql, tables }
}

