import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

const DEFAULT_PLANS = {
  free: { id: 'free', name: 'Hobby', tokensPerMonth: 10000, features: ['10,000 credits/month', 'Public projects', 'Community support'] },
  pro: { id: 'pro', name: 'Pro', tokensPerMonth: 120000, features: ['120,000 credits/month', '60 agent runs per period', 'Premium templates + visual edit', 'Priority support'] },
  team: { id: 'team', name: 'Agency', tokensPerMonth: 500000, features: ['500,000 credits/month', '200 agent runs per period', 'Client handoff + white-label', 'Priority support'] },
  enterprise: { id: 'enterprise', name: 'Agency', tokensPerMonth: 500000, features: ['500,000 credits/month', '200 agent runs per period', 'Client handoff + white-label', 'Priority support'] },
}

function requiredEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-seed-secret')
  const expected = process.env.SEED_PLANS_SECRET
  if (!expected) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  if (secret !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const batch = adminDb.batch()
    for (const key of Object.keys(DEFAULT_PLANS)) {
      const p = (DEFAULT_PLANS as any)[key]
      const ref = adminDb.collection('plans').doc(p.id)
      batch.set(ref, { name: p.name, tokensPerMonth: p.tokensPerMonth, features: p.features }, { merge: true })
    }
    await batch.commit()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('seed-plans error', e)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
