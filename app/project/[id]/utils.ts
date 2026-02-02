import type { GeneratedFile, FileNode } from "./types"

export function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso)
    const h = d.getHours()
    const m = d.getMinutes()
    const day = d.getDate()
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const month = months[d.getMonth()]
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} • ${day} ${month}`
  } catch {
    return ""
  }
}

export function extractAgentMessage(content: string): { agentMessage: string | null; contentWithoutAgent: string } {
  const start = "===AGENT_MESSAGE==="
  const end = "===END_AGENT_MESSAGE==="
  const i = content.indexOf(start)
  const j = content.indexOf(end, i)
  if (i === -1 || j === -1) return { agentMessage: null, contentWithoutAgent: content }
  const agentMessage = content.slice(i + start.length, j).trim()
  const contentWithoutAgent = content.slice(0, i).trim() + "\n" + content.slice(j + end.length).trim()
  return { agentMessage: agentMessage || null, contentWithoutAgent }
}

export function buildFileTree(files: GeneratedFile[]): FileNode[] {
  const root: { [key: string]: FileNode | { [key: string]: FileNode } } = {}

  files.forEach((file) => {
    const parts = file.path.split("/")
    let current: Record<string, unknown> = root

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const currentPath = parts.slice(0, index + 1).join("/")

      if (!current[part]) {
        ;(current as Record<string, FileNode | Record<string, FileNode>>)[part] = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : {},
          content: isFile ? file.content : undefined,
          isGenerating: isFile ? file.isGenerating : undefined,
        }
      }

      if (!isFile && (current[part] as FileNode).children) {
        current = (current[part] as FileNode).children as unknown as Record<string, unknown>
      }
    })
  })

  const convertToArray = (obj: { [key: string]: FileNode }): FileNode[] => {
    return Object.values(obj)
      .map((node) => ({
        ...node,
        children: node.children
          ? convertToArray(node.children as unknown as { [key: string]: FileNode })
          : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return convertToArray(root as { [key: string]: FileNode })
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  const langMap: { [key: string]: string } = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    sass: "scss",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    env: "plaintext",
    txt: "plaintext",
    svg: "xml",
    png: "plaintext",
    jpg: "plaintext",
    jpeg: "plaintext",
    gif: "plaintext",
  }
  return langMap[ext || ""] || "plaintext"
}
