"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Bot, CheckCircle2, LayoutPanelTop, Sparkles } from "lucide-react"

import type { Message, PlanningStatus, ProjectBlueprint, ProjectCreationMode } from "@/app/project/[id]/types"
import { CreationBlueprintPanel } from "@/components/project/creation-blueprint-panel"
import { CreationStudioActions } from "@/components/project/creation-studio-actions"
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
  statusLabel: string
  planVisible: boolean
  helperLabel: string
  onBack?: () => void
  onTogglePlan: () => void
}) {
  const { projectLabel, statusLabel, planVisible, helperLabel, onBack, onTogglePlan } = props

  return (
    <header className="relative z-20 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
      <div className="rounded-[1.75rem] border border-[#e6dfd3] bg-white/80 px-4 py-3 shadow-[0_22px_60px_-48px_rgba(24,24,27,0.35)] backdrop-blur-sm sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e6dfd3] bg-[#fcfaf6] text-zinc-500 transition-colors hover:text-zinc-900"
                aria-label="Back"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-[#e7dfd4] bg-[#faf7f2] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Plan mode
              </div>
              <p className="mt-3 truncate text-lg font-semibold tracking-tight text-zinc-900">{projectLabel}</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500">{helperLabel}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-full border border-[#e7dfd4] bg-[#faf7f2] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 sm:inline-flex">
              {statusLabel}
            </div>
            <button
              type="button"
              onClick={onTogglePlan}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                planVisible ? "bg-zinc-900 text-white" : "border border-[#e6dfd3] bg-[#fcfaf6] text-zinc-600"
              )}
            >
              <LayoutPanelTop className="h-3.5 w-3.5" />
              Plan
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

function IntroMessage(props: { description: string; prompt: string }) {
  const { description, prompt } = props

  return (
    <article className="flex gap-3">
      <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-amber-300 sm:flex">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="max-w-[min(100%,48rem)]">
        <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">BuildKit</div>
        <div className="rounded-[1.75rem] border border-[#e9e1d6] bg-white/85 px-5 py-5 text-zinc-800 shadow-[0_18px_50px_-40px_rgba(24,24,27,0.28)]">
          <p className="text-[15px] leading-8">{description}</p>
          <p className="mt-3 text-sm leading-6 text-zinc-500">{prompt}</p>
        </div>
      </div>
    </article>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <article className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-[#e7dfd4] sm:flex">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}

      <div className="max-w-[min(100%,48rem)]">
        <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
          {isUser ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          <span>{isUser ? "You" : "BuildKit"}</span>
        </div>
        <div
          className={cn(
            "px-5 py-4 text-[15px] leading-8 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.24)]",
            isUser
              ? "rounded-[1.6rem] bg-zinc-900 text-white"
              : "rounded-[1.6rem] border border-[#e9e1d6] bg-white/82 text-zinc-800"
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
}) {
  const { question, helper, guidedAnswerSet, selectedGuidedOptions, onToggleGuidedOption, onEnableCustomAnswer, isLoadingOptions } = props

  return (
    <div className="pl-0 sm:pl-11">
      <div className="max-w-[min(100%,48rem)] rounded-[1.6rem] border border-[#e7dfd4] bg-white/82 px-5 py-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.22)]">
        <p className="mb-3 text-sm leading-6 text-zinc-600">{question || guidedAnswerSet.question}</p>
        {helper ? <p className="mb-3 text-xs leading-5 text-zinc-500">{helper}</p> : null}
        {isLoadingOptions ? (
          <div className="py-2 text-sm text-zinc-500">
            <TextShimmer>Thinking through some useful choices...</TextShimmer>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {guidedAnswerSet.options.map((option) => {
              const selected = selectedGuidedOptions.includes(option.label)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggleGuidedOption(option.label)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    selected ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-[#e7dfd4]"
                  )}
                >
                  {option.label}
                </button>
              )
            })}
            {guidedAnswerSet.allowsCustomAnswer ? (
              <button
                type="button"
                onClick={onEnableCustomAnswer}
                className="rounded-full bg-[#f1ece2] px-4 py-2 text-sm text-zinc-600"
              >
                Answer in chat instead
              </button>
            ) : null}
          </div>
        )}
      </div>
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
    <div className="mx-auto max-w-[52rem]">
      <div className="overflow-hidden rounded-2xl border border-[#e4ddd0] bg-white shadow-[0_8px_30px_-12px_rgba(24,24,27,0.18),0_2px_8px_-4px_rgba(24,24,27,0.08)]">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[72px] resize-none border-0 bg-transparent px-4 py-3.5 text-[14px] leading-[1.7] text-zinc-900 placeholder:text-zinc-400 shadow-none focus-visible:ring-0"
          disabled={!canEdit || isSubmitting}
        />
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100/80 bg-zinc-50/50 px-4 py-2.5">
          <span className="text-[11px] text-zinc-400">{helper || "Chat with BuildKit about your project"}</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-zinc-300 sm:block">Ctrl/Cmd + Enter</span>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || !canEdit || isSubmitting}
              className="h-8 rounded-xl bg-zinc-900 px-4 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {isSubmitting ? "Updating" : submitLabel}
            </Button>
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
  composer: React.ReactNode
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const { prompt, introDescription, messages, guidedAnswerSet, guidedQuestion, guidedHelper, selectedGuidedOptions, onToggleGuidedOption, onEnableCustomAnswer, useCustomAnswer, isLoadingOptions, composer, scrollRef } = props

  return (
    <div ref={scrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto">
      <div className="relative mx-auto flex max-w-[52rem] flex-col gap-5 px-4 py-6 pb-10 sm:px-6">
        <IntroMessage description={introDescription} prompt={prompt} />

        {messages.length > 0 ? (
          <div className="my-1 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#ece5da]/70" />
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400/60">Conversation</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#ece5da]/70" />
          </div>
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
          />
        ) : null}

        <div className="pt-2">{composer}</div>
      </div>
    </div>
  )
}

function PlanPanel(props: {
  isVisible: boolean
  isDraftingPlan: boolean
  blueprint: ProjectBlueprint
  planningStatus: PlanningStatus
}) {
  const { isVisible, isDraftingPlan, blueprint, planningStatus } = props
  if (!isVisible) return null

  return (
    <section className="rounded-[2rem] border border-[#e6ddd0] bg-[linear-gradient(180deg,rgba(251,248,242,0.96),rgba(244,239,230,0.94))] p-4 shadow-[0_30px_80px_-58px_rgba(24,24,27,0.38)] sm:p-5">
        {isDraftingPlan ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-[#ebe4d8] bg-white shadow-[0_18px_40px_-34px_rgba(24,24,27,0.22)]">
            <div className="px-5 py-5">
              <TextShimmer className="text-base font-semibold text-zinc-800">Drafting your plan</TextShimmer>
              <p className="mt-2 text-[13px] leading-[1.65] text-zinc-500">
                Synthesising the conversation into a reviewable plan before the build starts.
              </p>
            </div>
          </section>
        ) : (
          <CreationBlueprintPanel blueprint={blueprint} planningStatus={planningStatus} />
        )}
    </section>
  )
}

function BottomActions(props: {
  onGeneratePlan: () => void
  onBuildFromPlan: () => void
  onRefine: () => void
  onSkip: () => void
  disabled: boolean
  stage: "define" | "plan"
  planReady: boolean
  questionsRemaining: number
  isDraftingPlan: boolean
}) {
  return (
    <div className="relative z-10">
      <CreationStudioActions {...props} />
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
  const [planSheetOpen, setPlanSheetOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftPlanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const conversationMessages = Array.isArray(messages) ? messages : []

  const isAgentMode = creationMode === "agent"
  const projectLabel = projectName.length > 44 ? `${projectName.slice(0, 41).trimEnd()}...` : projectName
  const studioStage = getPlanningStudioStage(blueprint, planningStatus)
  const { step, planReady, blueprintVisible, composerSubmitLabel, statusLabel, description, reassurance, nextStepLabel } = studioStage
  const planPanelVisible = planSheetOpen && (blueprintVisible || isDraftingPlan)

  const introDescription = useMemo(() => {
    if (blueprintVisible) return description
    if (isAgentMode) return `${agentName || "Your BuildKit copilot"} will guide the conversation, surface quick choices only when useful, and turn the chat into a plan you can review.`
    return description
  }, [agentName, blueprintVisible, description, isAgentMode])

  const helperLabel = useMemo(() => {
    if (blueprintVisible) return "Review the plan, refine anything that feels off, and build when it feels right."
    return "Answer a few focused questions first so the first build lands much closer to what you want."
  }, [blueprintVisible])

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
    if (planningStatus === "plan-generated" || planningStatus === "approved") {
      setIsDraftingPlan(false)
      setPlanSheetOpen(true)
    }
  }, [planningStatus])

  useEffect(() => {
    setSelectedGuidedOptions([])
    setUseCustomAnswer(false)
    setDraft("")
  }, [guidedQuestion])

  useEffect(() => {
    return () => {
      if (draftPlanTimerRef.current) clearTimeout(draftPlanTimerRef.current)
    }
  }, [])

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

  const handleDraftPlan = () => {
    if (!planReady || blueprintVisible) return
    setIsDraftingPlan(true)
    setPlanSheetOpen(true)
    if (draftPlanTimerRef.current) clearTimeout(draftPlanTimerRef.current)
    draftPlanTimerRef.current = setTimeout(() => {
      Promise.resolve(onGeneratePlan()).finally(() => setIsDraftingPlan(false))
    }, 1200)
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
    <div className="min-h-screen bg-[#f1ece3] text-[#1f1f1f]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-8%,rgba(212,198,178,0.34),transparent)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-48 bg-[linear-gradient(180deg,transparent,rgba(238,232,223,0.38))]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1320px] flex-col px-0 sm:px-4 lg:px-6">
        <div className="flex min-h-screen flex-col sm:py-4 lg:py-6">
          <PlanningHeader
            projectLabel={projectLabel}
            statusLabel={statusLabel}
            planVisible={planSheetOpen}
            helperLabel={helperLabel}
            onBack={onBack}
            onTogglePlan={() => setPlanSheetOpen((v) => !v)}
          />

          <div className="flex-1 px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="flex min-h-[72vh] flex-col overflow-hidden rounded-[2rem] border border-[#e6ddd0] bg-[linear-gradient(180deg,rgba(249,245,238,0.98),rgba(244,239,230,0.96))] shadow-[0_28px_90px_-60px_rgba(24,24,27,0.4)]">
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
              </section>

              <aside className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-5rem)]">
                <BottomActions
                  onGeneratePlan={handleDraftPlan}
                  onBuildFromPlan={onBuildFromPlan}
                  onRefine={() => {
                    setPlanSheetOpen(true)
                    textareaRef.current?.focus()
                  }}
                  onSkip={onSkip}
                  disabled={!canEdit || isSubmitting}
                  stage={step}
                  planReady={planReady}
                  questionsRemaining={blueprint.openQuestions.length}
                  isDraftingPlan={isDraftingPlan}
                />

                <PlanPanel
                  isVisible={planPanelVisible}
                  isDraftingPlan={isDraftingPlan}
                  blueprint={blueprint}
                  planningStatus={planningStatus}
                />
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
