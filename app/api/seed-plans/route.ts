import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

const DEFAULT_PLANS = {
  free: { id: 'free', name: 'Free', tokensPerMonth: 5000, features: ['5,000 tokens/month', 'Basic code generation', 'Community support'] },
  pro: { id: 'pro', name: 'Pro', tokensPerMonth: 50000, features: ['50,000 tokens/month', 'Advanced code generation', 'Priority support', 'Custom templates'] },
  enterprise: { id: 'enterprise', name: 'Enterprise', tokensPerMonth: 500000, features: ['500,000 tokens/month', 'Unlimited projects', 'Dedicated support', 'Custom integrations', 'Team collaboration'] },
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
