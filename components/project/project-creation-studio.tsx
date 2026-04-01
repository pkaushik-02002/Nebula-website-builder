"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Bot, Sparkles } from "lucide-react"

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
    <header className="relative z-20 border-b border-zinc-200 bg-white/60 backdrop-blur-sm">
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

          <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Planning</div>
        </div>
      </div>
    </header>
  )
}

function IntroMessage(props: { description: string; prompt: string }) {
  const { description, prompt } = props

  return (
    <article className="mx-auto flex w-full max-w-2xl gap-4 px-4 sm:px-6">
      <div className="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-amber-300 sm:flex">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="mb-3 text-xs font-medium text-zinc-400">BuildKit</div>
        <div className="space-y-3">
          <p className="text-base leading-7 text-zinc-800">{description}</p>
          <p className="text-sm leading-6 text-zinc-500">{prompt}</p>
        </div>
      </div>
    </article>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <article className={cn("mx-auto flex w-full max-w-2xl gap-4 px-4 sm:px-6", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 sm:flex">
          <Bot className="h-4 w-4 text-zinc-600" />
        </div>
      ) : null}

      <div className={cn("flex-1 space-y-1 sm:max-w-xl", isUser ? "text-right" : "")}>
        <div className="text-xs font-medium text-zinc-400">{isUser ? "You" : "BuildKit"}</div>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-3 text-sm leading-6",
            isUser ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
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
  const isMultiSelect = guidedAnswerSet.selectionMode === "multiple"

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 sm:px-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-900">{question || guidedAnswerSet.question}</p>
        {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
      </div>
      {isLoadingOptions ? (
        <div className="py-3 text-sm text-zinc-500">
          <TextShimmer>Thinking through some useful choices...</TextShimmer>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {guidedAnswerSet.options.map((option) => {
              const selected = selectedGuidedOptions.includes(option.label)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggleGuidedOption(option.label)}
                  className={cn(
                    "group w-full rounded-lg border-2 p-3 text-left transition-all",
                    selected
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition-all",
                        selected
                          ? "border-zinc-900 bg-zinc-900"
                          : "border-zinc-300 group-hover:border-zinc-400"
                      )}
                    >
                      {selected && isMultiSelect ? (
                        <svg className="h-full w-full p-0.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : selected && !isMultiSelect ? (
                        <div className="h-full w-full rounded-full bg-white" />
                      ) : null}
                    </div>
                    <span className={cn(
                      "flex-1 text-sm font-medium transition-colors",
                      selected ? "text-zinc-900" : "text-zinc-700 group-hover:text-zinc-900"
                    )}>
                      {option.label}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {guidedAnswerSet.allowsCustomAnswer ? (
            <button
              type="button"
              onClick={onEnableCustomAnswer}
              className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-left text-sm text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
            >
              <div className="flex items-center justify-center gap-2">
                <span>✏️</span>
                <span>Answer differently...</span>
              </div>
            </button>
          ) : null}

          {hasSelection && onSubmitSelection ? (
            <button
              type="button"
              onClick={onSubmitSelection}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 mt-2"
            >
              {isSubmitting ? "Continuing..." : "Continue"}
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
}) {
  const { helper, draft, setDraft, placeholder, canEdit, isSubmitting, textareaRef, onSubmit, submitLabel, canSubmit } = props

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit && canEdit && !isSubmitting) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-white/80 backdrop-blur-md">
      <div className="border-t border-[#e7dfd4]">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[48px] max-h-[120px] resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 shadow-none focus-visible:ring-0"
              disabled={!canEdit || isSubmitting}
            />
            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5">
              <span className="text-xs text-zinc-400">{helper || "Chat with BuildKit"}</span>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-zinc-300 sm:block">Cmd/Ctrl + Enter</span>
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSubmit || !canEdit || isSubmitting}
                  className="h-8 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white disabled:opacity-40"
                >
                  {isSubmitting ? "Sending..." : submitLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
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
  onSkip: () => Promise<void> | void
  showSkip: boolean
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
    onSkip,
    showSkip,
    isDisabled,
    composer,
    scrollRef,
  } = props

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto pb-32">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <IntroMessage description={introDescription} prompt={prompt} />

        {messages.length > 0 ? (
          <div className="border-t border-zinc-100" />
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
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            {isDraftingPlan ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                <TextShimmer className="text-sm font-medium text-zinc-800">Drafting your plan in chat</TextShimmer>
                <p className="mt-1 text-xs text-zinc-500">Converting your confirmed answers into a version-one implementation plan.</p>
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

        {showSkip ? (
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            <button
              type="button"
              onClick={() => void onSkip()}
              disabled={!canEdit || isDisabled}
              className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-800 disabled:opacity-50"
            >
              Skip plan and build now
            </button>
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
    if (isAgentMode) return `${agentName || "Your BuildKit copilot"} will guide the conversation, surface quick choices only when useful, and turn the chat into a plan you can review.`
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
    <div className="min-h-screen bg-white text-zinc-900">
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
          onSkip={onSkip}
          showSkip={!blueprintVisible}
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
            />
          }
          scrollRef={scrollRef}
        />
      </div>
    </div>
  )
}
