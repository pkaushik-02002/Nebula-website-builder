/**
 * Static analysis to detect required environment variable names from project files.
 * Scans for process.env.XXX, import.meta.env.XXX, and .env.example entries.
 */

export type InputFile = { path: string; content: string }

// process.env.XXX or process.env["XXX"] or process.env['XXX']
const PROCESS_ENV_RE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[["']([^"']+)["']\]/g
// import.meta.env.XXX or import.meta.env["XXX"]
const IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)|import\.meta\.env\[["']([^"']+)["']\]/g
// .env.example / .env.local.example: KEY= or KEY =
const ENV_EXAMPLE_LINE_RE = /^([A-Za-z_][A-Za-z0-9_.]*)\s*=/m

function extractFromRegex(content: string, regex: RegExp): string[] {
  const names: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(regex.source, regex.flags)
  while ((m = re.exec(content)) !== null) {
    const name = m[1] || m[2]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

function extractFromEnvExample(content: string): string[] {
  const names: string[] = []
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("#") || !trimmed) continue
    const match = trimmed.match(ENV_EXAMPLE_LINE_RE)
    if (match) {
      const name = match[1]
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}

/**
 * Returns a unique list of environment variable names detected across all files.
 * Names only; no values.
 */
export function detectRequiredEnvVars(files: InputFile[]): string[] {
  const set = new Set<string>()

  for (const file of files) {
    const content = file.content || ""

    // process.env.XXX
    const processNames = extractFromRegex(content, PROCESS_ENV_RE)
    processNames.forEach((n) => set.add(n))

    // import.meta.env.XXX (Vite, etc.)
    const metaNames = extractFromRegex(content, IMPORT_META_ENV_RE)
    metaNames.forEach((n) => set.add(n))

    // .env.example / .env.local.example
    const baseName = file.path.split("/").pop()?.toLowerCase() || ""
    if (
      baseName === ".env.example" ||
      baseName === ".env.local.example" ||
      baseName === ".env.sample"
    ) {
      const exampleNames = extractFromEnvExample(content)
      exampleNames.forEach((n) => set.add(n))
    }
  }

  return Array.from(set).sort()
}
