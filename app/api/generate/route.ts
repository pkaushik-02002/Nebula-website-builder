import OpenAI from "openai"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { DEFAULT_PLANS } from "@/lib/firebase"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  const { prompt, model = "gpt-4o", idToken, existingFiles } = await req.json() as {
    prompt: string
    model?: string
    idToken: string
    existingFiles?: { path: string; content: string }[]
  }

  // authenticate user via Firebase ID token
  if (!idToken) {
    return new Response(JSON.stringify({ error: 'Missing idToken' }), { status: 401 })
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    uid = decoded.uid
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid idToken' }), { status: 401 })
  }

  // check user remaining tokens before starting generation
  try {
    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }
    const userData = userSnap.data() as any
    
    // Get user's plan and token limit
    const planId = userData?.planId || 'free'
    const planTokensPerMonth = DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth
    
    let remaining = userData?.tokenUsage?.remaining
    
    // Migration: if tokenUsage doesn't exist but tokensLimit/tokensUsed does, use those
    if (remaining === undefined || remaining === null) {
      if (userData?.tokensLimit && userData?.tokensUsed !== undefined) {
        remaining = userData.tokensLimit - userData.tokensUsed
      } else {
        // Initialize with plan's token limit if nothing exists
        remaining = planTokensPerMonth
      }
    }
    
    console.log('Token check - User:', uid, 'Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Remaining:', remaining, 'TokenUsage:', userData?.tokenUsage)
    if (!remaining || remaining <= 0) {
      return new Response(JSON.stringify({ error: 'Insufficient tokens' }), { status: 402 })
    }
  } catch (e) {
    console.error('Token check failed', e)
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
  }

  const modelMap: Record<string, string> = {
    "o3-mini": "o3-mini",
    "GPT-4-1 Mini": "gpt-4.1-mini",
    "GPT-4-1": "gpt-4.1",
  }

  const selectedModel = modelMap[model] || "gpt-4o"
  const isFollowUp = Array.isArray(existingFiles) && existingFiles.length > 0

  const systemPromptFollowUp = `You are an expert React developer. The user is asking for CHANGES or ADDITIONS to an existing project. You will receive the current project files.

UI STANDARD: When adding or changing UI, keep it modern and polished—distinctive typography, intentional colors, generous spacing, subtle motion (Framer Motion). Avoid generic "AI slop" aesthetics. Match or elevate the existing design language.

CRITICAL: Do NOT regenerate the entire project. Output ONLY:
1. One AGENT_MESSAGE (see below).
2. For each file that you MODIFY: output that file in ===FILE: path=== ... ===END_FILE===. Inside the block you may use EITHER:
   - Unified diff format (so only the change is applied):
     --- a/path/to/file.tsx
     +++ b/path/to/file.tsx
     @@ -start,count +start,count @@
     -old line
     +new line
   - OR the COMPLETE new file content (full replacement).
3. For each NEW file (file that does not exist yet): output ===FILE: path=== complete file content ===END_FILE===.
Do NOT output any file that is unchanged. Do NOT output the full project; only changed or new files.

Use this exact streaming format for every file you output:
===FILE: path/to/file.tsx===
[unified diff OR full file content]
===END_FILE===

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply, e.g. "I'll add a dark mode toggle to the header." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. No other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data, output at the very end (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Only when the app would clearly benefit from a database or backend.`

  const systemPromptNew = `You are an expert React developer. Generate a complete, working Vite + React + TypeScript application based on the user's request.

MODERN UI — BEAT THE COMPETITION (MANDATORY):
- Create UIs that look premium and modern, not generic. Avoid "AI slop": no default purple gradients on white, no Inter-only typography, no cookie-cutter layouts.
- Typography: Use distinctive, readable fonts. Prefer Google Fonts like DM Sans, Outfit, Plus Jakarta Sans, Syne, or similar for headings; pair with a clean body font. Strong hierarchy: clear heading sizes, line-height, and letter-spacing.
- Color: Choose an intentional palette (e.g. deep neutrals with one accent, or a bold brand color with contrast). Use semantic contrast (WCAG AA). Prefer custom palettes over default Tailwind grays alone.
- Layout: Generous whitespace, clear sections, and a clear visual hierarchy. Use grid/flex intentionally; avoid cramped or monotonous layouts. Consider asymmetry or bold hero sections where it fits.
- Motion: Add subtle, purposeful animations (hover states, scroll-in, staggered reveals) with Framer Motion. Keep animations fast and smooth (200–400ms). No gratuitous motion.
- Polish: Rounded corners, subtle shadows, borders where they add clarity. Responsive from mobile to desktop. Touch-friendly targets on mobile.
- Overall: The result should feel like a product from a top design team—memorable, cohesive, and professional.

You must respond with a STREAMING file format. Output each file in this exact format:

===FILE: path/to/file.tsx===
[file content here]
===END_FILE===

Generate files in this order:
1. package.json - Dependencies first
2. vite.config.ts
3. index.html
4. src/main.tsx
5. src/App.tsx
6. src/index.css
7. src/components/*.tsx - Any necessary components
8. src/lib/*.ts - Utility functions if needed
9. tailwind.config.ts and postcss.config.js if Tailwind is used

Use these technologies:
- TypeScript
- Vite + React
- Tailwind CSS (only if requested or if it clearly improves the UI)
- Framer Motion for animations when appropriate

Dependencies requirements (MUST follow):
- package.json MUST include react and react-dom in dependencies.
- package.json MUST include vite and @vitejs/plugin-react in devDependencies.
- If TypeScript is used (it is), include typescript, @types/react, and @types/react-dom in devDependencies.
- Do not reference any package in code unless it exists in package.json.

Do NOT add dependencies that do not exist on npm. In particular, do NOT use @shadcn/ui.

Ensure the dev server binds to 0.0.0.0 and uses a known port (prefer port 3000). If you use Vite, configure it accordingly.

Make the code production-ready with proper error handling, accessibility, and responsive design.
Create organized folder structures with components in /src/components, utilities in /src/lib, etc.

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply to the user, e.g. "I'll help you build Cookie Clicker - a mobile app where the user can press on a cookie and a score will increment. When incremented, the new score should be displayed for users on any device. I'll add animations when the cookie is pressed." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. Do not include any other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data (e.g. user accounts, login/signup, saving data, todos, forms that persist, dashboards with data, CRUD, API, auth), then at the very end of your response output exactly this line on its own line (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Do NOT output this for purely static sites, landing pages, or UI-only apps with no data persistence. Only when the app would clearly benefit from a database or backend.`

  const systemPrompt = isFollowUp ? systemPromptFollowUp : systemPromptNew

  // Build user message: for follow-up include current files so the model can edit them
  const userMessageContent = isFollowUp
    ? `The user wants these changes or additions to their existing project:\n\n${prompt}\n\nCurrent project files (only modify or add as needed; do not output unchanged files):\n${existingFiles.map((f: { path: string; content: string }) => `\n--- FILE: ${f.path} ---\n${f.content}\n--- END ${f.path} ---`).join("")}`
    : `Create a Vite + React + TypeScript application: ${prompt}`

  const encoder = new TextEncoder()

  // stream generation and capture usage info if provider returns it in final chunk
  const completion = await openai.chat.completions.create({
    model: selectedModel,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessageContent },
    ],
    max_tokens: 8000,
    // request provider to include usage in stream when available
    stream_options: { include_usage: true } as any,
  })

  let usageInfo: any = null

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          // capture provider-provided usage if present
          if ((chunk as any).usage) {
            usageInfo = (chunk as any).usage
          }
          // some providers may include usage inside choices
          if ((chunk as any).choices && (chunk as any).choices[0]?.usage) {
            usageInfo = (chunk as any).choices[0].usage
          }

          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(content))
          }
        }

        // when stream finishes, attempt to deduct tokens in a transaction
        try {
          if (usageInfo) {
            const tokensToCharge = usageInfo.total_tokens ?? (usageInfo.prompt_tokens || 0) + (usageInfo.completion_tokens || 0)
            if (tokensToCharge > 0) {
              const userRef = adminDb.collection('users').doc(uid)
              await adminDb.runTransaction(async (tx) => {
                const snap = await tx.get(userRef)
                if (!snap.exists) throw new Error('user-not-found')
                const data = snap.data() as any
                
                // Get user's plan token limit
                const planId = data?.planId || 'free'
                const planTokensPerMonth = DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth
                
                let remaining = data?.tokenUsage?.remaining
                
                // Migration: if tokenUsage doesn't exist but tokensLimit/tokensUsed does, use those
                if (remaining === undefined || remaining === null) {
                  if (data?.tokensLimit && data?.tokensUsed !== undefined) {
                    remaining = data.tokensLimit - data.tokensUsed
                  } else {
                    remaining = planTokensPerMonth
                  }
                }
                
                console.log('Transaction - User Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Charging tokens:', tokensToCharge, 'Remaining before:', remaining)
                
                // If generation exceeds plan limit, add warning to stream
                if (tokensToCharge > planTokensPerMonth) {
                  console.warn(`Generation used ${tokensToCharge} tokens but ${planId} plan only allows ${planTokensPerMonth}. Recommend upgrade.`)
                  controller.enqueue(encoder.encode('\n\n{"type":"warning","message":"This generation exceeded your plan\'s monthly token limit. Please upgrade your plan to continue generating."}'))
                  throw new Error('plan_limit_exceeded')
                }
                
                if (remaining < tokensToCharge) {
                  console.warn(`User ${uid} on ${planId} plan has ${remaining} tokens but needs ${tokensToCharge}`)
                  controller.enqueue(encoder.encode('\n\n{"type":"warning","message":"Insufficient tokens for this generation. Please upgrade your plan."}'))
                  throw new Error('insufficient_tokens')
                }
                
                // Always use new structure for update
                const currentUsed = data?.tokenUsage?.used || data?.tokensUsed || 0
                const newUsed = currentUsed + tokensToCharge
                const newRemaining = remaining - tokensToCharge
                console.log('Transaction - New tokens - Used:', newUsed, 'Remaining:', newRemaining)
                tx.update(userRef, {
                  'tokenUsage.used': newUsed,
                  'tokenUsage.remaining': newRemaining,
                })
              })
            }
          }
        } catch (e) {
          console.error('Failed to charge tokens after generation:', e)
          // note: stream already delivered; cannot retract, but we surface server log
          // The generation already succeeded, so we log the error but don't crash
        }

        controller.close()
      } catch (err) {
        console.error('Stream error', err)
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
