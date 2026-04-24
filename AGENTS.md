# AGENTS.md — lotus.build

Full context for Claude Code. Read this before touching any file.

---

## Project identity

**Product**: lotus.build — autonomous AI website and app builder
**Repo path**: `C:/Users/Preet/Desktop/Nebula-website-builder`
**Deployment**: https://lotus-build.vercel.app/
**Two products in one repo**: `/project/[id]` (build mode) and `/computer/[id]` (autonomous agent mode)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript strict |
| Styling | Tailwind v4 |
| Animation | Framer Motion |
| Auth | Firebase Auth |
| Database | Firestore (client + admin) |
| Storage | Firebase Storage |
| AI generation | Anthropic SDK (`claude-sonnet-4-5`) |
| Sandbox | E2B Code Interpreter (`@e2b/code-interpreter`) |
| Browser agent | Browserbase + Stagehand |
| Web scraping | Firecrawl |
| Payments | Stripe |
| Icons | lucide-react only |
| Fonts | Google Fonts via `@import` in CSS |

---

## Absolute rules (never violate)

- **No mock/demo/dummy/placeholder data** — ever. All data is dynamic.
- **Full code only** — never return partial files, truncated implementations, or skeleton stubs.
- **No speculative redesigns** — only surgical, file-level patches unless a full rewrite is explicitly requested.
- **No new dependencies** unless explicitly asked. Check existing deps first.
- **Never touch** `node_modules`, `.next`, `.git`, `dist`, `build`.
- **Preserve all auth, ownership, rate-limit, and Firestore security logic** in every edit.
- **lucide-react for all icons** — never `react-icons`, `heroicons`, or emoji in UI.
- **TypeScript strict** — no `any` casts unless absolutely unavoidable, and always annotate why.
- **Callout risks explicitly** — if a change touches authz, Firestore rules, webhook security, workspace isolation, or quota logic, flag it before editing.

---

## Coding style

- Minimal, readable, typed. Config/state-driven over prop-drilling.
- Functions: short, single-purpose. Helpers extracted to top of file.
- No commented-out code in final output.
- Imports: absolute paths via `@/` alias. Group: external → internal → types.
- `cn()` from `@/lib/utils` for all className merging.
- CSS custom properties for color tokens. Never hardcode brand colors inline.
- Framer Motion for all transitions — no raw CSS `transition` on interactive elements.

---

## Colour theme (both products)

This is the canonical theme. Never use dark backgrounds, purple gradients, or generic grays.

```
bg-[#f0ece4]          primary page background
bg-[#faf9f6]          sidebar / panel background
bg-[rgba(252,250,246,0.96)]  elevated card surfaces
bg-[#f7f5f1]          tab content / inset background
bg-white              pure white surfaces

border-[#e0dbd1]      default border
border-[#e4dfd5]      sidebar border
border-[#ede8e0]      divider / inner border

text-[#1c1c1c]        primary text
text-zinc-600         secondary text
text-zinc-500         muted text
text-zinc-400         placeholder / label text
text-[#7a6244]        warm accent (CTAs, links, active)
text-[#8a7556]        icon accent
text-[#a89578]        uppercase label accent

shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_32px_-12px_rgba(0,0,0,0.12)]  card
shadow-[0_16px_48px_-24px_rgba(0,0,0,0.22)]  sidebar
```

Status pills follow semantic colours (sky=researching, indigo=planning, amber=building, etc.) but all other UI is warm beige.

---

## Architecture map

### Build product — `/project/[id]`

| File | Responsibility |
|---|---|
| `app/project/[id]/page.tsx` | Main workspace: chat panel, preview iframe, visual edit |
| `app/api/generate/route.ts` | AI code generation + edits. Streams `===FILE:path===` blocks. Calls NVIDIA / Anthropic. |
| `app/api/sandbox/route.ts` | E2B sandbox: Vite/Next detection, port 3000, `allowedHosts` patch, visual edit injection |
| `lib/3d-prompt-injection.ts` | Detects 3D mode from prompt (`r3f`, `gsap`, `css3d`, `spline`, `none`). Returns system prompt injection. |
| `lib/lotus-site-content.ts` | `buildLotusAgentPrompt()` — elite full-stack generation prompt. Zero placeholders. Real copy. |
| `components/project/dynamic-agent-timeline.tsx` | Cursor-style flowing log stream for build mode |
| `components/project/useTypewriter.ts` | Character-by-character streaming hook |
| `components/preview/build-timeline.tsx` | Build timeline shown in chat panel |

**Generate route stream protocol:**
```
===FILE: path/to/file.tsx===
[complete file content]
===END_FILE===
```
followed by `===META:===` block for dependencies.

**Sandbox route key facts:**
- Single recheck loop (not double) — saves 5+ sec
- `LOG_POLL_INTERVAL_MS`: 800
- `PORT_CLEANUP_WAIT_MS`: 2000
- Inline delays: 500ms (not 3000ms)

---

### Computer product — `/computer/[id]`

| File | Responsibility |
|---|---|
| `app/computer/[id]/page.tsx` | Full autonomous agent UI — sidebar feed, 4-tab viewport (Browser/Preview/Code/Research) |
| `app/computer/new/page.tsx` | New computer creation form |
| `app/api/computer/create/route.ts` | Create Firestore doc, run intake analysis |
| `app/api/computer/[id]/route.ts` | PATCH handler: `stop`, `message`, `interrupt`, `approve_plan`, `update_permissions` |
| `app/api/computer/[id]/run/route.ts` | SSE run endpoint — calls `runComputerOrchestrator` |
| `lib/computer-agent/orchestrator.ts` | **The brain.** Intake phase + `runBuildAgent` (real Claude tool-use loop) |
| `lib/computer-agent/tools.ts` | 8 tools: `browserbase_research`, `browserbase_navigate`, `plan_project`, `generate_files`, `run_sandbox`, `verify_preview`, `fix_errors`, `deploy_site` |
| `lib/computer-agent/intake.ts` | `analyzeComputerBrief()` — intent classification, clarification questions, reference URL extraction |
| `lib/computer-agent/browserbase-session.ts` | `ComputerBrowserSession` — lazy Stagehand init, live view URL, page management |
| `lib/computer-agent/reference-resolver.ts` | Resolves brand names to official URLs via Firecrawl search |
| `lib/computer-agent/reference-urls.ts` | URL extraction + normalisation helpers |
| `lib/computer-types.ts` | All Computer* types |

**Orchestrator architecture (critical):**

The orchestrator has **two phases**:

1. **Intake phase** (hardcoded, correct): `analyzeComputerBrief` → clarification or plan approval gate
2. **Build phase** (agentic loop, `runBuildAgent`): Real Claude tool-use loop. Claude decides every tool call. Never hardcode the sequence.

`runBuildAgent` loop contract:
- Claude receives system prompt + tools + initial message with approved plan
- Each turn: Claude emits text (→ `thinking` action) then tool_use blocks
- Each tool_use: emit `tool_call` action → execute tool → persist artifacts → emit `tool_result` action → update step
- Feed tool results back as `user` message with `tool_result` blocks
- Loop until `stop_reason === "end_turn"` or `MAX_TURNS` (28)
- Never hardcode which tools run or in which order

**Firestore document shape (`computers/{id}`):**
```typescript
{
  uid: string
  name: string
  prompt: string
  status: ComputerStatus        // idle|researching|planning|building|verifying|fixing|deploying|complete|error
  planningStatus: string        // draft|needs-input|ready-for-approval|approved
  plan: ComputerPlan | null
  clarificationQuestions: ComputerClarificationQuestion[]
  permissions: { requirePlanApproval: boolean }
  steps: ComputerStep[]
  actions: ComputerAction[]
  files: GeneratedFile[]
  currentGeneratingFile: string | null
  researchSources: ComputerResearchSource[]
  referenceUrls: string[]
  sandboxUrl: string | null
  sandboxId: string | null
  browserbaseSessionId: string | null
  browserbaseLiveViewUrl: string | null
  deployUrl: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**File streaming in `generate_files`:**
Files are persisted to Firestore one-by-one via `FieldValue.arrayUnion` as they complete streaming — UI sees them arrive in real-time via `onSnapshot`. Do not batch.

---

## Shared components

| Component | Location | Usage |
|---|---|---|
| `AnimatedAIInput` | `components/ui/animated-ai-input.tsx` | All chat inputs — build mode and computer mode |
| `TextShimmer` | `components/prompt-kit/text-shimmer.tsx` | Active steps, thinking labels, running state |
| `ProjectFileTree` | `components/project/file-tree.tsx` | File tree in both `/project` and `/computer` code tab |
| `Editor` | `@monaco-editor/react` | Code viewer (read-only, vs-light theme, JetBrains Mono) |
| `Dialog`, `Switch`, `Input` | `components/ui/` | shadcn/ui primitives |

**AnimatedAIInput props used:**
```typescript
mode="chat" | "build"
compact?: boolean
surface="code" | "default"
placeholder: string
isLoading: boolean
onStop: () => void
onSubmit: (value: string) => void
```

---

## Key patterns

### Firestore real-time sync
```typescript
// Always merge optimistic user actions to prevent flicker on snapshot
setComputer((prev) => {
  const incoming = { id: snapshot.id, ...data } as Computer
  if (!prev) return incoming
  const serverIds = new Set(incoming.actions?.map(a => a.id))
  const optimistic = (prev.actions || []).filter(
    a => a.actor === "user" && !serverIds.has(a.id)
  )
  return { ...incoming, actions: [...(incoming.actions || []), ...optimistic] }
})
```

### SSE stream consumption
```typescript
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const parts = buffer.split("\n\n")
  buffer = parts.pop() ?? ""
  for (const part of parts) {
    if (!part.trim().startsWith("data: ")) continue
    const event = JSON.parse(part.trim().slice(6))
    // handle event
  }
}
```

NDJSON variant (deploy logs) uses `\n` delimiter and skips `data: ` prefix.

### Auth pattern (API routes)
```typescript
const authHeader = request.headers.get("Authorization")
const idToken = authHeader?.replace("Bearer ", "")
const decoded = await adminAuth.verifyIdToken(idToken)
const uid = decoded.uid
```

### Firestore admin updates
```typescript
await adminDb.collection("computers").doc(computerId).update({
  status: "building",
  updatedAt: FieldValue.serverTimestamp(),
})
```

Always use `FieldValue.serverTimestamp()` for `updatedAt`. Never `new Date()`.

---

## Feed action types

```typescript
type ComputerAction = {
  id: string
  timestamp: string
  type: "thinking" | "tool_call" | "tool_result" | "decision" | "message"
  actor: "user" | "agent" | "system"
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string  // JSON string
}
```

Rendering rules in `ActionCard`:
- `actor === "user"` → right-aligned dark bubble (`bg-[#1f1f1f]`)
- `actor === "system"` → centred pill
- `type === "thinking"` → quiet zinc text, shimmer if latest
- `type === "tool_call"` → monospace inline with dot + tool name
- `type === "tool_result"` → check icon + human summary via `prettyResult()`
- `type === "decision"` → bold zinc-900 text
- `tool_result` where `toolName === "plan_project"` → full plan card layout

---

## File generation format (both products)

```
===FILE: src/App.tsx===
[complete file content — never truncated]
===END_FILE===
```

Parser: `parseFileBlocks(text)` in `lib/computer-agent/tools.ts`.
Always generate in order: `package.json` → `vite.config.ts` → `index.html` → `src/main.tsx` → `src/App.tsx` → `src/index.css` → components → config files.

---

## Generation quality rules

These apply to all code generated for users (both products):

- Zero placeholder content. Every word from research or inferred from domain.
- Real business copy — sounds like the actual business wrote it.
- Google Fonts `@import` pairing: display font + body font.
- CSS custom properties for brand palette. Never generic gray-only.
- Framer Motion: entrance animations, stagger lists, scroll reveals.
- Every interactive element: hover state, focus state, transition.
- Mobile-first: 320px, 768px, 1280px breakpoints.
- Images: `picsum.photos` or `source.unsplash.com` with descriptive seeds.
- `lucide-react` for icons. Never FontAwesome, react-icons, or SVG inline dumps.
- 3D: use `@react-three/fiber` + `@react-three/drei` only when plan explicitly calls for it.

---

## Environment variables

```bash
ANTHROPIC_API_KEY
E2B_API_KEY
BROWSERBASE_API_KEY
BROWSERBASE_PROJECT_ID
FIRECRAWL_API_KEY
NEXT_PUBLIC_FIREBASE_*     # client-side Firebase config
FIREBASE_ADMIN_*           # service account for admin SDK
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Never log, expose, or echo env vars. Never pass `ANTHROPIC_API_KEY` in client-side code.

---

## Deploy integrations

**Netlify** (`/api/netlify/`):
- OAuth flow: `oauth/start` → callback → token stored per-uid in Firestore
- Deploy: `POST /api/netlify/deploy` with `{ computerId, siteId?, siteName }` or `{ projectId, siteId?, siteName }`
- Status: `GET /api/netlify/status`

**Vercel** (`/api/vercel/`):
- Token-based (personal access token stored per-uid + computerId)
- Deploy: `POST /api/vercel/deploy` with `{ computerId }`
- Status: `GET /api/vercel/status?projectId={computerId}`

Both deploy routes stream NDJSON: `{ type: "step"|"log"|"error"|"success", ... }`.

---

## What NOT to do

- Do not call `startRun()` again inside the computer orchestrator — it's called by the run route.
- Do not write steps manually before tools execute — steps derive from real tool calls.
- Do not use `setTimeout` for polling in orchestrator — use the E2B sandbox polling loop already in `runSandbox`.
- Do not skip `persistArtifacts` after any tool call — this is how Firestore stays in sync.
- Do not add bouncing dot loaders — use `TextShimmer` from `@/components/prompt-kit/text-shimmer` for all active/loading states.
- Do not add `expandedActions` state for tool results — they render as single-line summaries via `prettyResult()`.
- Do not add dark mode, dark backgrounds, or purple/blue accent colours to any UI.
- Do not use `font-serif` italic in the computer page — only the `/computer/new` page uses it for the headline.

---

## Prompt style for Claude Code

Write prompts that are:
- Token-efficient. Dense, no filler.
- File-level specific: always name the exact file and line range.
- Constraint-led: start with what NOT to change.
- No narration: run tools, show result, stop.
- Max 3-6 word sentences in prompts.
- Specify exact import paths, not just component names.

Example structure:
```
Read: [files]
Goal: [one sentence]
KEEP UNCHANGED: [list]
CHANGE: [exact description with line anchors if possible]
CONSTRAINTS: [hard limits]
```
