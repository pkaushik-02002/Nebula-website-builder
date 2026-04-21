type RawMetaEntry = { key: string; value: string }

export interface GenerationMeta {
  suggestsBackend: boolean
}

function parseMetaEntries(content: string): RawMetaEntry[] {
  const entries: RawMetaEntry[] = []
  const regex = /===META:\s*([a-zA-Z0-9._-]+)\s*=\s*([\s\S]*?)===/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const key = (match[1] || "").trim()
    const value = (match[2] || "").trim()
    if (key) {
      entries.push({ key, value })
    }
  }

  return entries
}

export function parseGenerationMeta(content: string): GenerationMeta {
  const entries = parseMetaEntries(content)
  let suggestsBackend = false

  for (const entry of entries) {
    if (entry.key.toLowerCase() === "suggestsbackend" && entry.value.toLowerCase() === "true") {
      suggestsBackend = true
    }
  }

  return { suggestsBackend }
}

export function hasGenerationMeta(meta: GenerationMeta): boolean {
  return meta.suggestsBackend
}
