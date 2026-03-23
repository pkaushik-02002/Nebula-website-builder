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
    <div className="flex flex-col gap-4 border-t border-[#ece6db] pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={disabled}
          className="h-10 justify-start rounded-full px-3 text-zinc-500 hover:bg-white/70 hover:text-zinc-900"
        >
          Skip plan and build now
        </Button>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
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
