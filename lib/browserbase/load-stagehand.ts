type StagehandModule = {
  Stagehand: new (...args: any[]) => any
}

export async function loadStagehand(): Promise<StagehandModule> {
  try {
    return await import("@browserbasehq/stagehand")
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown Stagehand load error"

    throw new Error(
      `Stagehand is unavailable in this environment. Install @browserbasehq/stagehand to use Browserbase tools. Original error: ${message}`
    )
  }
}
