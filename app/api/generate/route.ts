import OpenAI from "openai"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { DEFAULT_PLANS } from "@/lib/firebase"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  const { prompt, model = "gpt-4o", idToken } = await req.json()

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

  const systemPrompt = `You are an expert React developer. Generate a complete, working Vite + React + TypeScript application based on the user's request.

IMPORTANT: When the user asks for modifications to an existing codebase, provide ONLY the specific changes needed in diff format. Use this format for each file:

===FILE: path/to/file.tsx===
--- a/path/to/file.tsx
+++ b/path/to/file.tsx
@@ -lineStart,lineCount +lineCount @@
 context-line-before
-removed-line
+added-line
 context-line-after
===END_FILE===

For new files, provide the complete file content as before.

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

Start generating files immediately. Do not include any text before or after the file blocks.`

  const encoder = new TextEncoder()

  // stream generation and capture usage info if provider returns it in final chunk
  const completion = await openai.chat.completions.create({
    model: selectedModel,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Create a Vite + React + TypeScript application: ${prompt}` },
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
