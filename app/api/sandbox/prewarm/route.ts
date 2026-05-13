import { Sandbox } from "@e2b/code-interpreter"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const PROJECT_DIR = "/home/user/project"
const SANDBOX_TTL_MS = 55 * 60 * 1000

const WARMUP_PACKAGE_JSON = JSON.stringify(
  {
    name: "lotus-warmup",
    version: "1.0.0",
    private: true,
    scripts: { dev: "vite" },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "lucide-react": "^0.577.0",
      "framer-motion": "^11.0.0",
      "react-icons": "^5.0.0",
      "react-router-dom": "^6.26.2",
      clsx: "^2.1.1",
      "tailwind-merge": "^2.5.2",
    },
    devDependencies: {
      vite: "^5.4.11",
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^3.4.17",
      postcss: "^8.4.49",
      autoprefixer: "^10.4.20",
      typescript: "^5.6.2",
      "@types/react": "^18.3.1",
      "@types/react-dom": "^18.3.1",
    },
  },
  null,
  2
)

export async function POST(req: Request) {
  if (!process.env.E2B_API_KEY) {
    return Response.json({ error: "E2B not configured" }, { status: 500 })
  }

  try {
    await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const templateId = process.env.E2B_TEMPLATE_ID || "base"
    const opts = { apiKey: process.env.E2B_API_KEY!, timeoutMs: SANDBOX_TTL_MS }
    const sandbox = await Sandbox.create(templateId, opts)

    // Write bootstrap package.json then start npm install in background.
    // The install populates ~/.npm cache so the real project install is near-instant.
    await sandbox.files.makeDir(PROJECT_DIR).catch(() => {})
    await sandbox.files.write(`/tmp/lotus-warmup/package.json`, WARMUP_PACKAGE_JSON).catch(() => {})

    // Fire-and-forget — don't block the response on install completing
    sandbox.commands
      .run(
        `cd /tmp/lotus-warmup && npm install --legacy-peer-deps --no-audit --no-fund > /tmp/warmup-install.log 2>&1`,
        { timeoutMs: 300_000 }
      )
      .catch(() => {})

    return Response.json({ sandboxId: sandbox.sandboxId })
  } catch (err: any) {
    return Response.json({ error: err?.message || "Prewarm failed" }, { status: 500 })
  }
}
