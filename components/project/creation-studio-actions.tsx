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
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
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

        <div className="mt-4 flex flex-col gap-2">
          {stage === "plan" ? (
            <>
              <Button
                type="button"
                onClick={onBuildFromPlan}
                disabled={disabled}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                Build from plan
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onRefine}
                disabled={disabled}
                className="w-full rounded-lg border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Refine plan
              </Button>
            </>
          ) : planReady ? (
            <Button
              type="button"
              onClick={onGeneratePlan}
              disabled={disabled || isDraftingPlan}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {isDraftingPlan ? "Generating plan..." : "Generate plan"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Skip plan?</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Build immediately without generating a plan first.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={disabled}
            className="w-full rounded-lg border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Skip and build now
          </Button>
        </div>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        {stage === "plan"
          ? "Make any last changes you want, then build from the approved plan."
          : planReady
            ? "When the answers look right, generate the plan and review it before building."
            : questionsRemaining === 1
              ? "One more answer should be enough to move into the plan step."
              : "Reply in the chat to keep shaping the brief, or skip ahead if speed matters more."}
      </p>
    </div>
  )
}
