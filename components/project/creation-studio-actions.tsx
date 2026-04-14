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
    <div className="flex flex-col gap-3">
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
            className="w-full rounded-lg border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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

      <p className="text-xs leading-5 text-zinc-500">
        {stage === "plan"
          ? "Make any last changes, then build from the approved plan."
          : planReady
            ? "Answers look complete — generate the plan and review before building."
            : questionsRemaining === 1
              ? "One more answer should be enough to move into the plan step."
              : "Keep answering the prompts and the plan will appear once the brief is complete."}
      </p>

      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-700 disabled:opacity-50"
      >
        Skip and build now
      </button>
    </div>
  )
}
