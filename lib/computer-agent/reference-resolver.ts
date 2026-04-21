import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const lookupSchema = z.object({
  shouldSearch: z.boolean(),
  query: z.string().max(200).default(""),
})

const selectionSchema = z.object({
  selectedUrl: z.string().url().nullable(),
})

function parseJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error("Failed to parse reference resolution response")
  }

  return JSON.parse(match[0]) as Record<string, unknown>
}

interface SearchResult {
  title: string
  description: string
  url: string
}

async function inferSearchQuery(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: `You decide whether a user brief refers to a public website that should be resolved to an official homepage.

Return valid JSON only.

Rules:
- Only set shouldSearch to true when the brief clearly refers to cloning, recreating, mirroring, or using an existing company, product, or website as a direct reference.
- If the user already provided a URL or domain, shouldSearch should be false.
- query should be a concise search query for the official homepage, such as "official website Vercel".

Return this shape:
{
  "shouldSearch": boolean,
  "query": "search query or empty string"
}`,
    messages: [{ role: "user", content: prompt }],
  })

  const text = response.content[0]?.type === "text" ? response.content[0].text : ""
  const parsed = lookupSchema.parse(parseJsonObject(text))
  return parsed.shouldSearch ? parsed.query.trim() : ""
}

async function searchFirecrawl(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey || !query) return []

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        sources: ["web"],
        country: "US",
        timeout: 20000,
        ignoreInvalidURLs: true,
      }),
    })

    if (!response.ok) return []

    const payload = await response.json().catch(() => null)
    const results = Array.isArray(payload?.data?.web) ? payload.data.web : []

    return results.flatMap((result: unknown): SearchResult[] => {
      if (!result || typeof result !== "object") return []
      const record = result as Record<string, unknown>
      if (typeof record.url !== "string") return []

      return [{
        url: record.url,
        title: typeof record.title === "string" ? record.title : record.url,
        description: typeof record.description === "string" ? record.description : "",
      }]
    })
  } catch {
    return []
  }
}

async function selectOfficialHomepage(prompt: string, query: string, results: SearchResult[]): Promise<string | null> {
  if (results.length === 0) return null
  if (results.length === 1) return results[0].url

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: `You select the most likely official homepage from search results.

Return valid JSON only.

Rules:
- Use only the provided results.
- Prefer the main public marketing or product homepage.
- Do not pick docs, blogs, support pages, app subdomains, careers pages, GitHub repositories, or directory listings unless there is no better official homepage.
- If the results are too ambiguous, return null.

Return this shape:
{
  "selectedUrl": "https://example.com" | null
}`,
    messages: [
      {
        role: "user",
        content: `Brief:
${prompt}

Query:
${query}

Results:
${results.map((result, index) => `${index + 1}. ${result.title}\nURL: ${result.url}\nDescription: ${result.description || "(none)"}`).join("\n\n")}`,
      },
    ],
  })

  const text = response.content[0]?.type === "text" ? response.content[0].text : ""
  const parsed = selectionSchema.parse(parseJsonObject(text))

  if (!parsed.selectedUrl) return null
  if (!results.some((result) => result.url === parsed.selectedUrl)) return null

  return parsed.selectedUrl
}

export async function resolveReferenceUrlFromPrompt(prompt: string): Promise<string | null> {
  const query = await inferSearchQuery(prompt)
  if (!query) return null

  const results = await searchFirecrawl(query)
  return selectOfficialHomepage(prompt, query, results)
}
