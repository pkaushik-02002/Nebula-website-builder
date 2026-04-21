const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi
const DOMAIN_PATTERN = /\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/gi

function normalizeUrl(raw: string): string | null {
  const candidate = raw.trim().replace(/[),.;!?]+$/, "")
  if (!candidate) return null

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    parsed.hash = ""
    return parsed.toString()
  } catch {
    return null
  }
}

export function extractReferenceUrlsFromText(text: string): string[] {
  if (!text) return []

  const matches = text.match(URL_PATTERN) ?? []
  const deduped = new Set<string>()

  for (const match of matches) {
    const normalized = normalizeUrl(match)
    if (normalized) deduped.add(normalized)
  }

  return Array.from(deduped)
}

export function extractReferenceDomainsFromText(text: string): string[] {
  if (!text) return []

  const matches = text.match(DOMAIN_PATTERN) ?? []
  const deduped = new Set<string>()

  for (const match of matches) {
    const normalized = normalizeUrl(match.startsWith("http") ? match : `https://${match}`)
    if (normalized) deduped.add(normalized)
  }

  return Array.from(deduped)
}

export function mergeReferenceUrls(...groups: Array<Array<string | null | undefined>>): string[] {
  const merged = new Set<string>()

  for (const group of groups) {
    for (const value of group) {
      if (typeof value !== "string") continue
      const normalized = normalizeUrl(value)
      if (normalized) merged.add(normalized)
    }
  }

  return Array.from(merged)
}
