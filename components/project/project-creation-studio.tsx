"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"

import type { Message, PlanningStatus, ProjectBlueprint, ProjectCreationMode } from "@/app/project/[id]/types"
import { CreationBlueprintPanel } from "@/components/project/creation-blueprint-panel"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { buildGuidedAnswerDraft, getGuidedAnswerSet, getPlanningStudioStage, slugify } from "@/lib/project-blueprint"
import { cn } from "@/lib/utils"

type GuidedAnswerSet = NonNullable<ReturnType<typeof getGuidedAnswerSet>>

type RemoteGuidedAnswerPayload = {
  show?: boolean
  question?: string | null
  helper?: string | null
  selectionMode?: "single" | "multiple"
  allowsCustomAnswer?: boolean
  options?: string[]
}

function PlanningHeader(props: {
  projectLabel: string
  onBack?: () => void
}) {
  const { projectLabel, onBack } = props

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-[#f5f5f2]/80 backdrop-blur-md">
      <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-zinc-900">{projectLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-zinc-600">Agent Planning</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function IntroMessage(props: { description: string; prompt: string }) {
  const { description, prompt } = props

  return (
    <article className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-400">Lotus.build</div>
      <div className="space-y-3">
        <p className="text-base leading-7 text-zinc-800">{description}</p>
        <p className="text-sm leading-6 text-zinc-500">{prompt}</p>
      </div>
    </article>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <article className={cn("mx-auto w-full max-w-3xl px-4 sm:px-6", isUser ? "flex justify-end" : "")}>
      {isUser ? (
        <div className="max-w-xl rounded-2xl bg-[#1f1f1f] px-4 py-3 text-sm leading-6 text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      ) : (
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-400">Lotus.build</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">{message.content}</p>
        </div>
      )}
    </article>
  )
}

function SuggestedReplies(props: {
  question?: string
  helper?: string
  guidedAnswerSet: GuidedAnswerSet
  selectedGuidedOptions: string[]
  onToggleGuidedOption: (label: string) => void
  onEnableCustomAnswer: () => void
  isLoadingOptions: boolean
  onSubmitSelection?: () => Promise<void> | void
  isSubmitting?: boolean
}) {
  const { question, helper, guidedAnswerSet, selectedGuidedOptions, onToggleGuidedOption, onEnableCustomAnswer, isLoadingOptions, onSubmitSelection, isSubmitting } = props

  const hasSelection = selectedGuidedOptions.length > 0

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 sm:px-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-900">{question || guidedAnswerSet.question}</p>
        {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
      </div>
      {isLoadingOptions ? (
        <div className="py-3 text-sm text-zinc-500">
          <TextShimmer>Thinking through some useful choices...</TextShimmer>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {guidedAnswerSet.options.map((option) => {
              const selected = selectedGuidedOptions.includes(option.label)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggleGuidedOption(option.label)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-all",
                    selected
                      ? "border-[#1f1f1f] bg-[#1f1f1f] text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          {guidedAnswerSet.allowsCustomAnswer ? (
            <button
              type="button"
              onClick={onEnableCustomAnswer}
              className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-700"
            >
              Answer differently
            </button>
          ) : null}

          {hasSelection && onSubmitSelection ? (
            <button
              type="button"
              onClick={onSubmitSelection}
              disabled={isSubmitting}
              className="rounded-full bg-[#1f1f1f] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {isSubmitting ? "Continuing..." : "Continue →"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ChatComposer(props: {
  helper?: string
  draft: string
  setDraft: (value: string) => void
  placeholder: string
  canEdit: boolean
  isSubmitting: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSubmit: () => Promise<void>
  submitLabel: string
  canSubmit: boolean
  showSkip?: boolean
  onSkip?: () => Promise<void> | void
  isDisabled?: boolean
}) {
  const { draft, setDraft, placeholder, canEdit, isSubmitting, textareaRef, onSubmit, submitLabel, canSubmit, showSkip, onSkip, isDisabled } = props

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit && canEdit && !isSubmitting) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-[#f5f5f2]/95 backdrop-blur">
      <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[52px] max-h-[120px] resize-none border-0 bg-transparent px-4 py-3.5 pr-20 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 shadow-none focus-visible:ring-0"
            disabled={!canEdit || isSubmitting}
          />
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || !canEdit || isSubmitting}
            className="absolute bottom-3 right-3 h-8 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white disabled:opacity-40"
          >
            {isSubmitting ? "..." : submitLabel}
          </Button>
        </div>
        {showSkip ? (
          <div className="mt-2.5 flex justify-center">
            <button
              type="button"
              onClick={() => void onSkip?.()}
              disabled={isDisabled}
              className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-700 disabled:opacity-50"
            >
              Skip plan and build now
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ConversationThread(props: {
  prompt: string
  introDescription: string
  messages: Message[]
  guidedAnswerSet: GuidedAnswerSet | null
  guidedQuestion?: string
  guidedHelper?: string
  selectedGuidedOptions: string[]
  onToggleGuidedOption: (label: string) => void
  onEnableCustomAnswer: () => void
  useCustomAnswer: boolean
  isLoadingOptions: boolean
  isSubmitting?: boolean
  onSubmitSelection?: () => Promise<void> | void
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
  showPlanCard: boolean
  isDraftingPlan: boolean
  canEdit: boolean
  onBuildFromPlan: () => Promise<void> | void
  onRefine: () => void
  isDisabled: boolean
  composer: React.ReactNode
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const {
    prompt,
    introDescription,
    messages,
    guidedAnswerSet,
    guidedQuestion,
    guidedHelper,
    selectedGuidedOptions,
    onToggleGuidedOption,
    onEnableCustomAnswer,
    useCustomAnswer,
    isLoadingOptions,
    isSubmitting,
    onSubmitSelection,
    blueprint,
    planningStatus,
    showPlanCard,
    isDraftingPlan,
    canEdit,
    onBuildFromPlan,
    onRefine,
    isDisabled,
    composer,
    scrollRef,
  } = props

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto bg-[#f5f5f2] pb-36">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        <IntroMessage description={introDescription} prompt={prompt} />

        {messages.length > 0 ? (
          <div className="border-t border-zinc-200" />
        ) : null}

        {messages.map((message, index) => (
          <ChatMessage key={`${message.role}-${index}-${message.content.slice(0, 24)}`} message={message} />
        ))}

        {guidedAnswerSet && !useCustomAnswer ? (
          <SuggestedReplies
            question={guidedQuestion}
            helper={guidedHelper}
            guidedAnswerSet={guidedAnswerSet}
            selectedGuidedOptions={selectedGuidedOptions}
            onToggleGuidedOption={onToggleGuidedOption}
            onEnableCustomAnswer={onEnableCustomAnswer}
            isLoadingOptions={isLoadingOptions}
            onSubmitSelection={onSubmitSelection}
            isSubmitting={isSubmitting}
          />
        ) : null}

        {showPlanCard ? (
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            {isDraftingPlan ? (
              <div className="space-y-1">
                <TextShimmer className="text-sm font-medium text-zinc-800">Drafting your plan in chat</TextShimmer>
                <p className="text-xs text-zinc-500">Converting your confirmed answers into a version-one implementation plan.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <CreationBlueprintPanel blueprint={blueprint} planningStatus={planningStatus} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => void onBuildFromPlan()}
                    disabled={!canEdit || isDisabled}
                    className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    Build from plan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onRefine}
                    disabled={!canEdit || isDisabled}
                    className="h-10 rounded-lg border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Refine in chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
      {composer}
    </div>
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
  getOptionalAuthHeader?: () => Promise<Record<string, string>>
  onSubmit: (value: string) => Promise<void> | void
  onGeneratePlan: () => Promise<void> | void
  onBuildFromPlan: () => Promise<void> | void
  onSkip: () => Promise<void> | void
  onBack?: () => void
}) {
  const { projectName, prompt, messages, blueprint, planningStatus, creationMode = "build", agentName, canEdit, isSubmitting, getOptionalAuthHeader, onSubmit, onGeneratePlan, onBuildFromPlan, onSkip, onBack } = props

  const [draft, setDraft] = useState("")
  const [isDraftingPlan, setIsDraftingPlan] = useState(false)
  const [selectedGuidedOptions, setSelectedGuidedOptions] = useState<string[]>([])
  const [useCustomAnswer, setUseCustomAnswer] = useState(false)
  const [guidedAnswerSet, setGuidedAnswerSet] = useState<GuidedAnswerSet | null>(null)
  const [guidedHelper, setGuidedHelper] = useState<string | undefined>(undefined)
  const [guidedQuestion, setGuidedQuestion] = useState<string | undefined>(undefined)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const autoPlanRequestedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const conversationMessages = Array.isArray(messages) ? messages : []

  const isAgentMode = creationMode === "agent"
  const projectLabel = projectName.length > 44 ? `${projectName.slice(0, 41).trimEnd()}...` : projectName
  const studioStage = getPlanningStudioStage(blueprint, planningStatus)
  const { planReady, blueprintVisible, composerSubmitLabel, description, reassurance, nextStepLabel } = studioStage

  const introDescription = useMemo(() => {
    if (blueprintVisible) return description
    if (isAgentMode) return `${agentName || "Your Lotus.build copilot"} will guide the conversation, surface quick choices only when useful, and turn the chat into a plan you can review.`
    return description
  }, [agentName, blueprintVisible, description, isAgentMode])

  const placeholder = useMemo(() => {
    if (blueprintVisible) return "Tell me what you want changed before we build."
    return "Describe your audience, pages, features, design preferences, or anything that matters..."
  }, [blueprintVisible])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [conversationMessages, guidedQuestion, guidedAnswerSet])

  useEffect(() => {
    setSelectedGuidedOptions([])
    setUseCustomAnswer(false)
    setDraft("")
  }, [guidedQuestion])

  useEffect(() => {
    if (!planReady) {
      autoPlanRequestedRef.current = false
    }
  }, [planReady])

  useEffect(() => {
    if (blueprintVisible || !planReady || !canEdit || isDraftingPlan || isSubmitting || autoPlanRequestedRef.current) {
      return
    }

    autoPlanRequestedRef.current = true
    setIsDraftingPlan(true)
    Promise.resolve(onGeneratePlan()).finally(() => setIsDraftingPlan(false))
  }, [blueprintVisible, planReady, canEdit, isDraftingPlan, isSubmitting, onGeneratePlan])

  useEffect(() => {
    const applyFallback = () => {
      const fallback = getGuidedAnswerSet(blueprint)
      setGuidedAnswerSet(fallback)
      setGuidedQuestion(fallback?.question)
      setGuidedHelper(fallback?.helper)
    }

    const fetchGuidedAnswerSet = async () => {
      if (blueprintVisible) {
        setGuidedAnswerSet(null)
        setGuidedQuestion(undefined)
        setGuidedHelper(undefined)
        return
      }

      setIsLoadingOptions(true)
      try {
        const unresolvedItem = blueprint.sections.flatMap((section) => section.items).find((item) => item.status === "unknown" || item.status === "suggested")
        if (!unresolvedItem) {
          setGuidedAnswerSet(null)
          setGuidedQuestion(undefined)
          setGuidedHelper(undefined)
          return
        }

        const authHeader = await getOptionalAuthHeader?.()
        if (!authHeader) {
          applyFallback()
          return
        }

        const res = await fetch("/api/generate-options", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ itemKey: unresolvedItem.key, blueprint, prompt }),
        })

        if (!res.ok) {
          applyFallback()
          return
        }

        const data = await res.json() as RemoteGuidedAnswerPayload
        if (data.show !== true || !Array.isArray(data.options) || data.options.length < 2) {
          setGuidedAnswerSet(null)
          setGuidedQuestion(typeof data.question === "string" ? data.question : blueprint.openQuestions[0])
          setGuidedHelper(typeof data.helper === "string" ? data.helper : undefined)
          return
        }

        setGuidedAnswerSet({
          key: unresolvedItem.key,
          question: typeof data.question === "string" ? data.question : blueprint.openQuestions[0] || unresolvedItem.label,
          helper: typeof data.helper === "string" ? data.helper : "Pick the closest option or answer in chat instead.",
          selectionMode: data.selectionMode === "multiple" ? "multiple" : "single",
          allowsCustomAnswer: data.allowsCustomAnswer !== false,
          options: data.options.map((option) => String(option).trim()).filter(Boolean).map((option) => ({ id: slugify(option), label: option, value: option })),
        })
        setGuidedQuestion(typeof data.question === "string" ? data.question : blueprint.openQuestions[0] || unresolvedItem.label)
        setGuidedHelper(typeof data.helper === "string" ? data.helper : undefined)
      } catch (error) {
        console.error("Failed to fetch dynamic options:", error)
        applyFallback()
      } finally {
        setIsLoadingOptions(false)
      }
    }

    fetchGuidedAnswerSet()
  }, [blueprint, blueprintVisible, getOptionalAuthHeader, prompt])

  const handleSubmit = async () => {
    if (isSubmitting || !canEdit) return
    const value = blueprintVisible ? draft.trim() : !guidedAnswerSet ? draft.trim() : useCustomAnswer ? draft.trim() : buildGuidedAnswerDraft(guidedAnswerSet, selectedGuidedOptions)
    if (!value) return
    setDraft("")
    setSelectedGuidedOptions([])
    setUseCustomAnswer(false)
    await onSubmit(value)
  }

  const toggleGuidedOption = (optionLabel: string) => {
    if (!guidedAnswerSet) return
    const nextSelection =
      guidedAnswerSet.selectionMode === "single"
        ? [optionLabel]
        : selectedGuidedOptions.includes(optionLabel)
          ? selectedGuidedOptions.filter((v) => v !== optionLabel)
          : optionLabel === "None of these for version one"
            ? [optionLabel]
            : [...selectedGuidedOptions.filter((v) => v !== "None of these for version one"), optionLabel]
    setSelectedGuidedOptions(nextSelection)
  }

  const canSubmitCurrentAnswer = blueprintVisible ? !!draft.trim() : !guidedAnswerSet ? !!draft.trim() : useCustomAnswer ? !!draft.trim() : !!buildGuidedAnswerDraft(guidedAnswerSet, selectedGuidedOptions)

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-zinc-900">
      <div className="relative flex min-h-screen flex-col">
        <PlanningHeader
          projectLabel={projectLabel}
          onBack={onBack}
        />

        <ConversationThread
          prompt={prompt}
          introDescription={introDescription}
          messages={conversationMessages}
          guidedAnswerSet={blueprintVisible ? null : guidedAnswerSet}
          guidedQuestion={guidedQuestion}
          guidedHelper={guidedHelper}
          selectedGuidedOptions={selectedGuidedOptions}
          onToggleGuidedOption={toggleGuidedOption}
          onEnableCustomAnswer={() => {
            setUseCustomAnswer(true)
            setDraft("")
            setSelectedGuidedOptions([])
            setTimeout(() => textareaRef.current?.focus(), 0)
          }}
          useCustomAnswer={useCustomAnswer}
          isLoadingOptions={isLoadingOptions}
          isSubmitting={isSubmitting}
          onSubmitSelection={() => {
            if (!guidedAnswerSet) return
            const value = buildGuidedAnswerDraft(guidedAnswerSet, selectedGuidedOptions)
            if (!value) return
            setDraft("")
            setSelectedGuidedOptions([])
            setUseCustomAnswer(false)
            return onSubmit(value)
          }}
          blueprint={blueprint}
          planningStatus={planningStatus}
          showPlanCard={blueprintVisible || isDraftingPlan}
          isDraftingPlan={isDraftingPlan}
          canEdit={canEdit}
          onBuildFromPlan={onBuildFromPlan}
          onRefine={() => {
            setTimeout(() => textareaRef.current?.focus(), 0)
          }}
          isDisabled={!canEdit || isSubmitting}
          composer={
            <ChatComposer
              helper={guidedHelper || (blueprintVisible ? reassurance : nextStepLabel)}
              draft={draft}
              setDraft={setDraft}
              placeholder={placeholder}
              canEdit={canEdit}
              isSubmitting={isSubmitting}
              textareaRef={textareaRef}
              onSubmit={handleSubmit}
              submitLabel={blueprintVisible ? composerSubmitLabel : "Send"}
              canSubmit={canSubmitCurrentAnswer}
              showSkip={!blueprintVisible}
              onSkip={onSkip}
              isDisabled={!canEdit || isSubmitting}
            />
          }
          scrollRef={scrollRef}
        />
      </div>
    </div>
  )
}
