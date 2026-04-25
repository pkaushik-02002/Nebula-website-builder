import Browserbase from "@browserbasehq/sdk"
import { loadStagehand } from "@/lib/browserbase/load-stagehand"
import { stagehandServerOptions } from "@/lib/browserbase/stagehand-server-options"
import { adminDb } from "@/lib/firebase-admin"

type StagehandInstance = {
  init: () => Promise<void>
  close: (options?: { force?: boolean }) => Promise<void>
  page: any
  context?: {
    pages?: () => any[]
    newPage?: (url?: string) => Promise<any>
    awaitActivePage?: (timeoutMs?: number) => Promise<any>
  }
  browserbaseSessionID?: string
  browserbaseSessionURL?: string
  browserbaseDebugURL?: string
}

export interface ComputerBrowserSessionSnapshot {
  sessionId: string
  liveViewUrl: string | null
}

async function resolveLiveViewUrl(
  sessionId: string,
  stagehand: StagehandInstance
): Promise<string | null> {
  const fallback =
    stagehand.browserbaseDebugURL ||
    stagehand.browserbaseSessionURL ||
    (sessionId ? `https://www.browserbase.com/sessions/${sessionId}` : null)

  const apiKey = process.env.BROWSERBASE_API_KEY
  const projectId = process.env.BROWSERBASE_PROJECT_ID

  if (!apiKey || !projectId || !sessionId) {
    return fallback
  }

  try {
    const bb = new Browserbase({ apiKey })
    const debug = await bb.sessions.debug(sessionId)
    const debugRecord = debug as unknown as Record<string, unknown>
    const fullscreenUrl =
      typeof debugRecord.debuggerFullscreenUrl === "string"
        ? (debugRecord.debuggerFullscreenUrl as string)
        : null

    return fullscreenUrl || fallback
  } catch {
    return fallback
  }
}

export class ComputerBrowserSession {
  private stagehandPromise: Promise<StagehandInstance> | null = null
  private sessionSnapshot: ComputerBrowserSessionSnapshot | null = null

  constructor(private readonly computerId: string) {}

  async getStagehand(): Promise<StagehandInstance> {
    if (!this.stagehandPromise) {
      this.stagehandPromise = this.createStagehand()
    }
    const stagehand = await this.stagehandPromise
    await this.ensureActivePage(stagehand)
    return stagehand
  }

  getSnapshot(): ComputerBrowserSessionSnapshot | null {
    return this.sessionSnapshot
  }

  async close(): Promise<void> {
    if (!this.stagehandPromise) return

    const stagehand = await this.stagehandPromise.catch(() => null)
    this.stagehandPromise = null

    if (stagehand) {
      await stagehand.close().catch(() => {})
    }
  }

  private async ensureActivePage(stagehand: StagehandInstance): Promise<any> {
    if (stagehand.page) {
      return stagehand.page
    }

    const pages =
      typeof stagehand.context?.pages === "function"
        ? stagehand.context.pages()
        : []

    if (pages.length > 0) {
      stagehand.page = pages[0]
      return stagehand.page
    }

    if (typeof stagehand.context?.awaitActivePage === "function") {
      try {
        stagehand.page = await stagehand.context.awaitActivePage(5_000)
        if (stagehand.page) return stagehand.page
      } catch {}
    }

    if (typeof stagehand.context?.newPage === "function") {
      stagehand.page = await stagehand.context.newPage()
      if (stagehand.page) return stagehand.page
    }

    throw new Error("Browser session did not provide an active page")
  }

  private async createStagehand(): Promise<StagehandInstance> {
    const { Stagehand } = await loadStagehand()

    const stagehand = new Stagehand({
      ...stagehandServerOptions,
      env: "BROWSERBASE",
      modelName: "claude-sonnet-4-5",
      modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
    }) as StagehandInstance

    await stagehand.init()
    await this.ensureActivePage(stagehand)

    const sessionId =
      typeof stagehand.browserbaseSessionID === "string"
        ? stagehand.browserbaseSessionID
        : ""

    const liveViewUrl = await resolveLiveViewUrl(sessionId, stagehand)

    this.sessionSnapshot = {
      sessionId,
      liveViewUrl,
    }

    if (sessionId || liveViewUrl) {
      await adminDb.collection("computers").doc(this.computerId).update({
        ...(sessionId ? { browserbaseSessionId: sessionId } : {}),
        ...(liveViewUrl ? { browserbaseLiveViewUrl: liveViewUrl } : {}),
      }).catch(() => {})
    }

    return stagehand
  }
}
