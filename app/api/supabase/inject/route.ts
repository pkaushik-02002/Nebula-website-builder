import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

const SUPABASE_CLIENT_TS = `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
`

const ENV_EXAMPLE = `# Supabase (add these to .env.local or your env)
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
`

const MIGRATION_SQL = `-- Initial schema (run this in Supabase SQL Editor: Dashboard -> SQL Editor)
-- Optional: enable Row Level Security (RLS) on your tables

-- Example: generic key-value or app data table
CREATE TABLE IF NOT EXISTS public.app_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: RLS
-- ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anon read" ON public.app_data FOR SELECT USING (true);
-- CREATE POLICY "Allow anon insert" ON public.app_data FOR INSERT WITH CHECK (true);
`

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = body?.projectId
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const projectRef = adminDb.collection("projects").doc(projectId)
    const snap = await projectRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const data = snap.data() as { files?: { path: string; content: string }[]; supabaseUrl?: string; supabaseAnonKey?: string }
    if (!data?.supabaseUrl || !data?.supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase not connected for this project" }, { status: 400 })
    }

    const files = Array.isArray(data.files) ? [...data.files] : []
    const pathSet = new Set(files.map((f) => f.path))

    if (!pathSet.has("src/lib/supabase.ts")) {
      files.push({ path: "src/lib/supabase.ts", content: SUPABASE_CLIENT_TS })
      pathSet.add("src/lib/supabase.ts")
    }
    if (!pathSet.has(".env.example") && !pathSet.has(".env.local")) {
      files.push({ path: ".env.example", content: ENV_EXAMPLE })
      pathSet.add(".env.example")
    }
    if (!pathSet.has("supabase/migrations/001_initial.sql")) {
      files.push({ path: "supabase/migrations/001_initial.sql", content: MIGRATION_SQL })
      pathSet.add("supabase/migrations/001_initial.sql")
    }

    const packageJson = files.find((f) => f.path === "package.json")
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson.content) as { dependencies?: Record<string, string> }
        if (!pkg.dependencies) pkg.dependencies = {}
        if (!pkg.dependencies["@supabase/supabase-js"]) {
          pkg.dependencies["@supabase/supabase-js"] = "^2.45.0"
          packageJson.content = JSON.stringify(pkg, null, 2)
        }
      } catch {
        // leave package.json as-is
      }
    }

    await projectRef.set({ files }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
