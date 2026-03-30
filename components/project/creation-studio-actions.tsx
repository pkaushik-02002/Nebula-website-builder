"use client"

import { Button } from "@/components/ui/button"

export function CreationStudioActions(props: {
  onGeneratePlan: () => void
  onBuildFromPlan: () => void
  onRefine: () => void
  onSkip: () => void
  disabled?: boolean
  stage: "define" | "plan"
  planReady: boolean
  questionsRemaining: number
  isDraftingPlan?: boolean
}) {
  const {
    onGeneratePlan,
    onBuildFromPlan,
    onRefine,
    onSkip,
    disabled,
    stage,
    planReady,
    questionsRemaining,
    isDraftingPlan = false,
  } = props

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-[#e7dfd3] bg-white/90 p-4 shadow-[0_18px_50px_-42px_rgba(24,24,27,0.3)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          {stage === "plan" ? "Ready to build" : planReady ? "Ready for plan" : "Next step"}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {stage === "plan"
            ? "Review the plan here, make any final edits in chat, then start the build when it feels right."
            : planReady
              ? "Your answers are strong enough to turn into a clear version-one plan."
              : questionsRemaining === 1
                ? "One more answer should be enough to move into the planning step."
                : "Keep answering the prompts and the plan will appear once the brief is complete."}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {stage === "plan" ? (
          <>
            <Button
              type="button"
              onClick={onBuildFromPlan}
              disabled={disabled}
              className="h-11 rounded-full bg-zinc-900 px-5 text-white hover:bg-black"
            >
              Build from plan
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRefine}
              disabled={disabled}
              className="h-11 rounded-full border-zinc-300 bg-white px-5 text-zinc-700 hover:bg-zinc-100"
            >
              Refine plan
            </Button>
          </>
        ) : planReady ? (
          <Button
            type="button"
            onClick={onGeneratePlan}
            disabled={disabled || isDraftingPlan}
            className="h-11 rounded-full bg-zinc-900 px-5 text-white hover:bg-black"
          >
            {isDraftingPlan ? "Generating plan..." : "Approve answers and generate plan"}
          </Button>
        ) : null}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[#e8e1d6] bg-[#fcfbf7] px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">Need speed over review?</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Use the fast path to build immediately without generating a plan first.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={disabled}
            className="h-10 rounded-full border-zinc-300 bg-white px-4 text-zinc-800 hover:bg-zinc-100"
          >
            Skip plan and build now
          </Button>
        </div>
      </div>

      <p className="px-1 text-xs leading-5 text-zinc-500">
        {stage === "plan"
          ? "Make any last changes you want, then build from the approved plan."
          : planReady
            ? "When the answers look right, generate the plan and review it before building."
            : questionsRemaining === 1
              ? "One more answer should be enough to move into the plan step."
              : "Reply in the composer above to keep shaping the brief, or skip ahead if speed matters more."}
      </p>
    </div>
  )
}
