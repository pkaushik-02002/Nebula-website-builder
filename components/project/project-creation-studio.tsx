"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Bot, CheckCircle2 } from "lucide-react"

import type { Message, PlanningStatus, ProjectBlueprint, ProjectCreationMode } from "@/app/project/[id]/types"
import { CreationBlueprintPanel } from "@/components/project/creation-blueprint-panel"
import { CreationStudioActions } from "@/components/project/creation-studio-actions"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { buildGuidedAnswerDraft, getGuidedAnswerSet, getPlanningStudioStage, slugify } from "@/lib/project-blueprint"
import { cn } from "@/lib/utils"

function StudioMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <article className="grid grid-cols-[40px_minmax(0,1fr)] gap-4 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-5">
      <div className="flex justify-center pt-1">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl border",
            isUser ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700"
          )}
        >
          {isUser ? <CheckCircle2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
      </div>

      <div className="pb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
          {isUser ? "You" : "BuildKit"}
        </p>

        {isUser ? (
          <div className="mt-3 inline-flex max-w-[760px] rounded-[1.5rem] bg-zinc-900 px-4 py-3 text-[15px] leading-7 text-white shadow-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          <p className="mt-3 max-w-[820px] whitespace-pre-wrap text-[15px] leading-8 text-zinc-800">
            {message.content}
          </p>
        )}
      </div>
    </article>
  )
}

function PlanningHeader(props: { projectLabel: string; onBack?: () => void }) {
  const { projectLabel, onBack } = props

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200/80 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}

        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Planning</p>
          <p className="truncate text-sm font-medium text-zinc-900">{projectLabel}</p>
        </div>
      </div>

      <div className="hidden rounded-full bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 ring-1 ring-zinc-200 sm:inline-flex">
        Define → Plan → Build
      </div>
    </header>
  )
}

function PlanningIntro(props: {
  heading: string
  description: string
  statusLabel: string
  nextStepLabel: string
  questionsRemaining: number
}) {
  const { heading, description, statusLabel, nextStepLabel, questionsRemaining } = props

  return (
    <section className="pt-8 sm:pt-10">
      <div className="flex flex-col gap-5 sm:gap-6">
        <div>
          <div className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 ring-1 ring-zinc-200">
            Step {questionsRemaining > 0 ? "1" : "2"} of 3
          </div>
          <h1 className="mt-4 max-w-3xl text-balance text-[2rem] font-semibold leading-[1.02] tracking-tight text-zinc-900 sm:text-[2.8rem]">
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-600 sm:text-base">
            {description}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="rounded-[1.4rem] bg-white px-4 py-3 ring-1 ring-zinc-200/80 sm:px-5">
            <p className="text-sm font-medium text-zinc-900">What happens next</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">{nextStepLabel}</p>
          </div>

          <div className="inline-flex w-fit rounded-full bg-[#f7f4ee] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 ring-1 ring-[#e8e1d6]">
            {statusLabel}
          </div>
        </div>
      </div>
    </section>
  )
}

function PlanningResponseCard(props: {
  question?: string
  useCustomAnswer: boolean
  onEnableCustomAnswer: () => void
  guidedAnswerSet: ReturnType<typeof getGuidedAnswerSet>
  selectedGuidedOptions: string[]
  onToggleGuidedOption: (label: string) => void
  draft: string
  setDraft: (value: string) => void
  placeholder: string
  canEdit: boolean
  isSubmitting: boolean
  isLoadingOptions?: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSubmit: () => Promise<void>
  submitLabel: string
  canSubmit: boolean
}) {
  const {
    question,
    useCustomAnswer,
    onEnableCustomAnswer,
    guidedAnswerSet,
    selectedGuidedOptions,
    onToggleGuidedOption,
    draft,
    setDraft,
    placeholder,
    canEdit,
    isSubmitting,
    isLoadingOptions = false,
    textareaRef,
    onSubmit,
    submitLabel,
    canSubmit,
  } = props

  return (
    <section className="rounded-[2rem] bg-white shadow-[0_30px_80px_-52px_rgba(24,24,27,0.22)] ring-1 ring-zinc-200/80">
      <div className="border-b border-zinc-100 px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Current question</p>
        <p className="mt-3 max-w-3xl text-[20px] leading-8 text-zinc-900 sm:text-[22px] sm:leading-9">
          {question || "Add anything important before we move to the plan."}
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">Choose your answer</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {useCustomAnswer
                ? "Write your own answer if none of the options fit."
                : guidedAnswerSet?.helper || "Choose the closest option, then continue."}
            </p>
          </div>

          {guidedAnswerSet?.allowsCustomAnswer ? (
            <button
              type="button"
              onClick={onEnableCustomAnswer}
              className="rounded-full bg-[#f7f4ee] px-3 py-2 text-xs font-medium text-zinc-600 ring-1 ring-[#e7e0d4] transition-colors hover:bg-white hover:text-zinc-900"
            >
              Other / write my own
            </button>
          ) : null}
        </div>

        {!useCustomAnswer && guidedAnswerSet ? (
          <div className="mb-5 space-y-2">
            {isLoadingOptions ? (
              <div className="flex items-center justify-center py-8">
                <TextShimmer className="text-sm">Generating options...</TextShimmer>
              </div>
            ) : (
              guidedAnswerSet.options.map((option) => {
                const selected = selectedGuidedOptions.includes(option.label)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onToggleGuidedOption(option.label)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors",
                      selected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-[#e8e1d6] bg-[#faf8f2] text-zinc-700 hover:bg-white hover:text-zinc-900"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        selected
                          ? "border-white/80 bg-white text-zinc-900"
                          : "border-zinc-300 bg-white text-transparent"
                      )}
                      aria-hidden="true"
                    >
                      •
                    </span>
                    <span className="leading-6">{option.label}</span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}

        {useCustomAnswer || !guidedAnswerSet ? (
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            className="min-h-[144px] resize-none rounded-[1.5rem] border-0 bg-[#fcfbf7] px-4 py-4 text-[15px] leading-7 text-zinc-900 shadow-none ring-1 ring-[#ece5da] focus-visible:ring-2 focus-visible:ring-zinc-300"
            disabled={!canEdit || isSubmitting}
          />
        ) : (
          <div className="rounded-[1.5rem] bg-[#fcfbf7] px-4 py-4 text-[15px] leading-7 text-zinc-600 ring-1 ring-[#ece5da]">
            Pick the closest answer above, then continue. If none fit, choose <span className="font-medium text-zinc-900">Other / write my own</span>.
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-zinc-500">
            Move quickly with the options, or write your own only when you need to.
          </p>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || !canEdit || isSubmitting}
            className="h-10 self-start rounded-full bg-zinc-900 px-5 text-white hover:bg-black sm:self-auto"
          >
            {isSubmitting ? "Updating..." : submitLabel}
          </Button>
        </div>
      </div>
    </section>
  )
}

function PlanningPlanSection(props: {
  isDraftingPlan: boolean
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
}) {
  const { isDraftingPlan, blueprint, planningStatus } = props

  return (
    <section className="rounded-[2rem] bg-white shadow-[0_30px_80px_-52px_rgba(24,24,27,0.22)] ring-1 ring-zinc-200/80">
      <div className="border-b border-zinc-100 px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Plan</p>
        <p className="mt-3 text-[15px] leading-7 text-zinc-600">
          Review the plan carefully. You can still refine it before the build starts.
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {isDraftingPlan ? (
          <section className="rounded-[1.75rem] bg-[#fcfbf7] p-6 ring-1 ring-[#ece5da]">
            <TextShimmer className="text-lg font-semibold">Drafting your plan</TextShimmer>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Pulling together the conversation into a clear blueprint you can review before building.
            </p>
          </section>
        ) : (
          <CreationBlueprintPanel blueprint={blueprint} planningStatus={planningStatus} />
        )}
      </div>
    </section>
  )
}

export function ProjectCreationStudio(props: {
  projectName: string
  prompt: string
  messages: Message[]
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
  creationMode?: ProjectCreationMode
  agentName?: string | null
  canEdit: boolean
  isSubmitting: boolean
  onSubmit: (value: string) => Promise<void> | void
  onGeneratePlan: () => Promise<void> | void
  onBuildFromPlan: () => Promise<void> | void
  onSkip: () => Promise<void> | void
  onBack?: () => void
}) {
  const {
    projectName,
    prompt,
    messages,
    blueprint,
    planningStatus,
    creationMode = "build",
    agentName,
    canEdit,
    isSubmitting,
    onSubmit,
    onGeneratePlan,
    onBuildFromPlan,
    onSkip,
    onBack,
  } = props

  const [draft, setDraft] = useState("")
  const [isDraftingPlan, setIsDraftingPlan] = useState(false)
  const [selectedGuidedOptions, setSelectedGuidedOptions] = useState<string[]>([])
  const [useCustomAnswer, setUseCustomAnswer] = useState(false)
  const [guidedAnswerSet, setGuidedAnswerSet] = useState<ReturnType<typeof getGuidedAnswerSet>>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftPlanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const isAgentMode = creationMode === "agent"
  const projectLabel = projectName.length > 44 ? `${projectName.slice(0, 41).trimEnd()}...` : projectName
  const studioStage = getPlanningStudioStage(blueprint, planningStatus)

  const {
    planReady,
    blueprintVisible,
    composerSubmitLabel,
    statusLabel,
    heading,
    description,
    reassurance,
    nextStepLabel,
    questionsRemaining,
  } = studioStage

  const showPlanSection = blueprintVisible || isDraftingPlan

  const resolvedHeading = useMemo(() => {
    if (isAgentMode && !blueprintVisible) {
      return "Let’s shape your site with AI before we build it"
    }
    return heading
  }, [blueprintVisible, heading, isAgentMode])



  const resolvedDescription = useMemo(() => {
    if (blueprintVisible) return description
    if (isAgentMode) {
      return `${agentName || "Your BuildKit copilot"} will help shape the direction before anything gets built.`
    }
    return description
  }, [agentName, blueprintVisible, description, isAgentMode])

  const placeholder = useMemo(() => {
    if (isAgentMode) {
      return "Share the missing detail, adjustment, or decision you want me to account for."
    }
    if (blueprintVisible) {
      return "Tell me what to change in the plan before we build."
    }
    return "Add the missing detail or answer the question above."
  }, [blueprintVisible, isAgentMode])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (planningStatus === "plan-generated" || planningStatus === "approved") {
      setIsDraftingPlan(false)
    }
  }, [planningStatus])

  useEffect(() => {
    setSelectedGuidedOptions([])
    setUseCustomAnswer(false)
    setDraft("")
  }, [guidedAnswerSet?.question])

  useEffect(() => {
    return () => {
      if (draftPlanTimerRef.current) clearTimeout(draftPlanTimerRef.current)
    }
  }, [])

  // Fetch guided answer set dynamically
  useEffect(() => {
    const fetchGuidedAnswerSet = async () => {
      const unresolvedItem = blueprint.sections
        .flatMap((section) => section.items)
        .find((item) => item.status === "unknown" || item.status === "suggested")

      if (!unresolvedItem) {
        setGuidedAnswerSet(null)
        return
      }

      // Always try to fetch dynamic options from AI
      setIsLoadingOptions(true)
      try {
        const authHeader = await getOptionalAuthHeader?.()
        if (!authHeader) {
          // Fallback to derived options
          const staticSet = getGuidedAnswerSet(blueprint)
          setGuidedAnswerSet(staticSet)
          return
        }

        const res = await fetch("/api/generate-options", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            itemKey: unresolvedItem.key,
            blueprint,
            prompt,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const dynamicOptions = data.options.map((option: string) => ({
            id: slugify(option),
            label: option,
            value: option,
          }))

          // Determine selection mode based on item key and options
          const questionText = (blueprint.openQuestions[0] || unresolvedItem.label || "").toLowerCase()
          const optionCount = dynamicOptions.length
          const mentionsMultipleIntent =
            /\b(select all|all that apply|which of these|any of these|what pages|which pages|what features|which features|integrations|systems)\b/i.test(
              questionText
            )
          const keyDefaultsToMultiple =
            unresolvedItem.key === "pages" || unresolvedItem.key === "systems" || unresolvedItem.key === "features"

          const selectionMode: "single" | "multiple" =
            keyDefaultsToMultiple || mentionsMultipleIntent || optionCount >= 5
              ? "multiple"
              : "single"

          const helper =
            selectionMode === "multiple"
              ? "Select all that apply, then adjust anything in chat if needed."
              : "Choose the closest option, then adjust it in chat if needed."

          setGuidedAnswerSet({
            key: unresolvedItem.key,
            question: blueprint.openQuestions[0] || unresolvedItem.label,
            helper,
            selectionMode,
            options: dynamicOptions,
            allowsCustomAnswer: true,
          })
        } else {
          // Fallback to derived options
          const staticSet = getGuidedAnswerSet(blueprint)
          setGuidedAnswerSet(staticSet)
        }
      } catch (error) {
        console.error("Failed to fetch dynamic options:", error)
        // Fallback to derived options
        const staticSet = getGuidedAnswerSet(blueprint)
        setGuidedAnswerSet(staticSet)
      } finally {
        setIsLoadingOptions(false)
      }
    }

    fetchGuidedAnswerSet()
  }, [blueprint, prompt, getOptionalAuthHeader])

  const handleSubmit = async () => {
    if (isSubmitting || !canEdit) return
    const value = blueprintVisible
      ? draft.trim()
      : !guidedAnswerSet
        ? draft.trim()
      : useCustomAnswer
        ? draft.trim()
        : buildGuidedAnswerDraft(guidedAnswerSet, selectedGuidedOptions)

    if (!value) return
    setDraft("")
    setSelectedGuidedOptions([])
    setUseCustomAnswer(false)
    await onSubmit(value)
  }

  const handleDraftPlan = () => {
    if (!planReady || blueprintVisible) return
    setIsDraftingPlan(true)
    if (draftPlanTimerRef.current) clearTimeout(draftPlanTimerRef.current)
    draftPlanTimerRef.current = setTimeout(() => {
      Promise.resolve(onGeneratePlan()).finally(() => {
        setIsDraftingPlan(false)
      })
    }, 1200)
  }

  const toggleGuidedOption = (optionLabel: string) => {
    if (!guidedAnswerSet) return

    const nextSelection =
      guidedAnswerSet.selectionMode === "single"
        ? [optionLabel]
        : selectedGuidedOptions.includes(optionLabel)
          ? selectedGuidedOptions.filter((value) => value !== optionLabel)
          : optionLabel === "None of these for version one"
            ? [optionLabel]
            : [...selectedGuidedOptions.filter((value) => value !== "None of these for version one"), optionLabel]

    setSelectedGuidedOptions(nextSelection)
  }

  const handleEnableCustomAnswer = () => {
    setUseCustomAnswer(true)
    setDraft("")
    setSelectedGuidedOptions([])
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const canSubmitCurrentAnswer = blueprintVisible
    ? !!draft.trim()
    : !guidedAnswerSet
      ? !!draft.trim()
    : useCustomAnswer
      ? !!draft.trim()
      : !!buildGuidedAnswerDraft(guidedAnswerSet, selectedGuidedOptions)

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1f1f1f]">
      <div className="mx-auto max-w-[1080px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-7">
        <PlanningHeader projectLabel={projectLabel} onBack={onBack} />

        <PlanningIntro
          heading={resolvedHeading}
          description={resolvedDescription}
          statusLabel={statusLabel}
          nextStepLabel={blueprintVisible ? reassurance : nextStepLabel}
          questionsRemaining={questionsRemaining}
        />

        <section className="mt-8 rounded-[2rem] bg-white shadow-[0_30px_80px_-52px_rgba(24,24,27,0.22)] ring-1 ring-zinc-200/80">
          <div className="border-b border-zinc-100 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">What we’re building</p>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-zinc-700">{prompt}</p>
              </div>
              <div className="text-sm text-zinc-500">
                {blueprintVisible
                  ? "Build is still a separate step."
                  : planReady
                    ? "You have enough detail for a plan."
                    : questionsRemaining === 1
                      ? "One more decision should do it."
                      : `${questionsRemaining} important details left.`}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="space-y-1 px-5 py-7 sm:px-6 sm:py-8">
            {messages.map((message, index) => (
              <StudioMessage key={`${message.role}-${index}-${message.content.slice(0, 24)}`} message={message} />
            ))}
          </div>
        </section>

        <div className="mt-6">
          <PlanningResponseCard
            question={blueprintVisible ? "What should we change before we build?" : blueprint.openQuestions[0]}
            useCustomAnswer={blueprintVisible || useCustomAnswer || !guidedAnswerSet}
            onEnableCustomAnswer={handleEnableCustomAnswer}
            guidedAnswerSet={blueprintVisible ? null : guidedAnswerSet}
            selectedGuidedOptions={selectedGuidedOptions}
            onToggleGuidedOption={toggleGuidedOption}
            draft={draft}
            setDraft={setDraft}
            placeholder={placeholder}
            canEdit={canEdit}
            isSubmitting={isSubmitting}
            isLoadingOptions={isLoadingOptions}
            textareaRef={textareaRef}
            onSubmit={handleSubmit}
            submitLabel={blueprintVisible ? composerSubmitLabel : "Next"}
            canSubmit={canSubmitCurrentAnswer}
          />
        </div>

        <div className="mt-6">
          <CreationStudioActions
            onGeneratePlan={handleDraftPlan}
            onBuildFromPlan={onBuildFromPlan}
            onRefine={() => textareaRef.current?.focus()}
            onSkip={onSkip}
            disabled={!canEdit || isSubmitting}
            stage={step}
            planReady={planReady}
            questionsRemaining={questionsRemaining}
            isDraftingPlan={isDraftingPlan}
          />
        </div>

        {showPlanSection ? (
          <div className="mt-6 sm:mt-8">
            <PlanningPlanSection
              isDraftingPlan={isDraftingPlan}
              blueprint={blueprint}
              planningStatus={planningStatus}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
