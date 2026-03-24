"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Check, Loader2, Pause, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildkitAgents } from "@/lib/buildkit-agents";
import { getAgentRunLimitForPlan } from "@/lib/agent-quotas";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

interface AnimatedAIInputProps {
  mode?: "create" | "chat";
  onSubmit?: (value: string, model: string) => void | Promise<void>;
  onStop?: () => void;
  placeholder?: string;
  isLoading?: boolean;
  compact?: boolean;
  visualEditToggle?: { active: boolean; onToggle: () => void };
  disabled?: boolean;
  initialModel?: string;
  contextBadge?: { label: string; value: string; onClear?: () => void } | null;
}

const MODEL_META: Record<string, { label: string; description: string; badges: string[] }> = {
  "o3-mini": {
    label: "o3-mini",
    description: "Fast reasoning model for structured edits, debugging, and technical prompts.",
    badges: ["Reasoning", "Coding"],
  },
  "GPT-4-1 Mini": {
    label: "GPT-4.1 Mini",
    description: "Balanced default for fast site generation, UI updates, and follow-up edits.",
    badges: ["Default", "Fast"],
  },
  "GPT-4-1": {
    label: "GPT-4.1",
    description: "Stronger general-purpose model for larger refactors and more detailed builds.",
    badges: ["Premium", "General"],
  },
  "Claude Sonnet 4.6": {
    label: "Claude Sonnet 4.6",
    description: "High-quality Claude model for robust coding, UI generation, and iterative product edits.",
    badges: ["Premium", "Claude"],
  },
  "Claude Sonnet 4": {
    label: "Claude Sonnet 4",
    description: "Balanced Claude model for reliable implementation and design-oriented updates.",
    badges: ["Premium", "Claude"],
  },
  "Claude Opus 4": {
    label: "Claude Opus 4",
    description: "Most capable Claude model for complex refactors and deeper reasoning workflows.",
    badges: ["Premium", "Claude"],
  },
  "minimaxai/minimax-m2.1": {
    label: "MiniMax M2.1",
    description: "Multi-language coding, app and web dev, office AI, and agent-style workflows.",
    badges: ["Open Source", "Agentic", "Multimodal"],
  },
  "meta/llama-3.3-70b-instruct": {
    label: "Llama 3.3 70B",
    description: "Strong open model for high-quality chat, coding, and instruction following.",
    badges: ["Open Source", "Coding"],
  },
  "meta/llama-3.1-405b-instruct": {
    label: "Llama 3.1 405B",
    description: "Large open-weight model suited for deeper reasoning and larger generation tasks.",
    badges: ["Open Source", "Reasoning"],
  },
  "deepseek-ai/deepseek-r1": {
    label: "DeepSeek R1",
    description: "Reasoning-heavy open model that performs well on planning and complex coding tasks.",
    badges: ["Open Source", "Reasoning", "Coding"],
  },
  "qwen/qwen2.5-coder-32b-instruct": {
    label: "Qwen 2.5 Coder 32B",
    description: "Code-focused open model for implementation, debugging, and developer workflows.",
    badges: ["Open Source", "Coding"],
  },
  "mistralai/mistral-small-3.1-24b-instruct": {
    label: "Mistral Small 3.1",
    description: "Compact open model for quick iteration, chat, and lightweight coding assistance.",
    badges: ["Open Source", "Fast"],
  },
  "google/gemma-3-27b-it": {
    label: "Gemma 3 27B",
    description: "Instruction-tuned open model for multimodal-style workflows and general tasks.",
    badges: ["Open Source", "Multimodal"],
  },
};

function getModelMeta(model: string) {
  if (MODEL_META[model]) return MODEL_META[model];

  const shortName = model.split("/").pop()?.replace(/-/g, " ") || model;
  return {
    label: shortName.replace(/\b\w/g, (char) => char.toUpperCase()),
    description: "Provider model available for generation and iterative product building.",
    badges: model.includes("/") ? ["Open Model"] : ["Model"],
  };
}

export function AnimatedAIInput({
  mode = "create",
  onSubmit,
  onStop,
  placeholder = "What can I help you build today?",
  isLoading = false,
  compact = false,
  visualEditToggle,
  disabled = false,
  initialModel,
  contextBadge,
}: AnimatedAIInputProps) {
  const router = useRouter();
  const { user, userData } = useAuth();
  const [value, setValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [creationMode, setCreationMode] = useState<"build" | "agent">("build");
  const [agentLimitNotice, setAgentLimitNotice] = useState<string | null>(null);
  const [mobileQuotaHint, setMobileQuotaHint] = useState<"build" | "agent" | null>(null);
  const [autoMode, setAutoMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState("GPT-4-1 Mini");
  const [availableModels, setAvailableModels] = useState([
    "o3-mini",
    "GPT-4-1 Mini",
    "GPT-4-1",
    "Claude Sonnet 4.6",
    "minimaxai/minimax-m2.1",
    "meta/llama-3.3-70b-instruct",
    "deepseek-ai/deepseek-r1",
    "qwen/qwen2.5-coder-32b-instruct",
  ]);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: compact ? 88 : 132,
    maxHeight: compact ? 220 : 360,
  });

  const isPaidUser = userData?.planId && userData.planId !== "free";
  const buildUsed = Math.max(0, Number(userData?.tokenUsage?.used ?? 0));
  const buildRemaining = Math.max(0, Number(userData?.tokenUsage?.remaining ?? 0));
  const buildTokenLimit = Math.max(0, Number(userData?.tokensLimit ?? 0), buildUsed + buildRemaining);
  const agentRunLimit = getAgentRunLimitForPlan(userData?.planId, userData?.agentRunLimit);
  const agentUsed = Math.max(0, Number(userData?.agentUsage?.used ?? 0));
  const agentRemaining = Math.max(
    0,
    Number.isFinite(Number(userData?.agentUsage?.remaining))
      ? Number(userData?.agentUsage?.remaining)
      : agentRunLimit - agentUsed
  );
  const canUseAgents = !userData || agentRemaining > 0;
  const agentResetLabel = userData?.agentUsage?.periodEnd
    ? new Date(userData.agentUsage.periodEnd).toLocaleDateString()
    : null;
  const effectiveModel = autoMode ? "GPT-4-1 Mini" : selectedModel;
  const primaryAgent = buildkitAgents[0];
  const isAgentCreateMode = mode === "create" && creationMode === "agent";

  const PENDING_CREATE_KEY = "buildkit_pending_create";

  useEffect(() => {
    if (!isPaidUser) setAutoMode(true);
  }, [isPaidUser]);

  useEffect(() => {
    if (mode !== "create") {
      setCreationMode("build");
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || creationMode !== "agent" || canUseAgents) return;
    setCreationMode("build");
    setAgentLimitNotice(
      `Agents limit reached. Switched to Builder mode. Upgrade for more agent runs${agentResetLabel ? ` or wait until ${agentResetLabel}.` : " or wait for your limit reset."}`
    );
  }, [agentResetLabel, canUseAgents, creationMode, mode]);

  useEffect(() => {
    if (!initialModel) return;

    if (initialModel === "GPT-4-1 Mini") {
      setAutoMode(true);
      setSelectedModel("GPT-4-1 Mini");
      return;
    }

    setAutoMode(false);
    setSelectedModel(initialModel);
    setAvailableModels((current) => (current.includes(initialModel) ? current : [...current, initialModel]));
  }, [initialModel]);

  useEffect(() => {
    let isMounted = true;

    const loadModels = async () => {
      try {
        const response = await fetch("/api/generate", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { models?: string[]; defaultModel?: string };
        if (!isMounted || !Array.isArray(data.models) || data.models.length === 0) return;
        const models = data.models;

        setAvailableModels(models);
        if (data.defaultModel && !autoMode) {
          setSelectedModel((current) => (models.includes(current) ? current : data.defaultModel!));
        }
      } catch (error) {
        console.error("Failed to load model list:", error);
      }
    };

    loadModels();

    return () => {
      isMounted = false;
    };
  }, [autoMode]);

  const handleSubmit = async () => {
    if (!value.trim() || isCreating || isLoading || disabled) return;

    if (mode === "chat" && onSubmit) {
      const submittedValue = value.trim();
      setValue("");
      adjustHeight(true);
      await onSubmit(submittedValue, effectiveModel);
      return;
    }

    if (mode === "create" && !user) {
      sessionStorage.setItem(
        PENDING_CREATE_KEY,
        JSON.stringify({
          prompt: value.trim(),
          model: effectiveModel,
          creationMode,
          agentSlug: creationMode === "agent" ? primaryAgent.slug : undefined,
        })
      );
      router.push("/login?redirect=" + encodeURIComponent("/"));
      return;
    }

    setIsCreating(true);
    try {
      const resolvedCreationMode: "build" | "agent" = creationMode === "agent" && !canUseAgents ? "build" : creationMode;
      const docRef = await addDoc(collection(db, "projects"), {
        prompt: value.trim(),
        model: effectiveModel,
        status: "pending",
        creationMode: resolvedCreationMode,
        agentSlug: resolvedCreationMode === "agent" ? primaryAgent.slug : undefined,
        createdAt: serverTimestamp(),
        messages: [],
        ownerId: user?.uid ?? undefined,
        visibility: "private",
      });
      router.push(`/project/${docRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey = (e.key === "Enter" && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === "Enter");
    if (isSubmitKey && value.trim() && !isCreating && !isLoading) {
      if (disabled) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = value.trim().length > 0 && !isCreating && !isLoading && !disabled;
  const canStop = mode === "chat" && isLoading && !disabled && typeof onStop === "function";
  const resolvedPlaceholder =
    isAgentCreateMode
      ? `Ask ${primaryAgent.name} how BuildKit works, what to build, or what to do next`
      : placeholder;
  const submitAriaLabel = isAgentCreateMode ? `Start ${primaryAgent.name}` : "Start build";

  return (
    <div className="group w-full max-w-2xl">
      <div
        className={cn(
          "relative rounded-3xl border bg-[#fcfcfa] shadow-sm transition-all duration-200",
          disabled
            ? "border-zinc-200 opacity-70"
            : isFocused
              ? "border-zinc-400 ring-2 ring-zinc-300/60"
              : "border-zinc-200 hover:border-zinc-300"
        )}
      >
        <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
          {contextBadge ? (
            <div className="mb-3 flex max-w-[calc(100%-4rem)] items-center">
              <div className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#ece7dd] px-3 py-2 text-xs text-zinc-700">
                <span className="font-medium text-[#6f6557]">{contextBadge.label}</span>
                <span className="rounded-full bg-[#d6c3a3] px-2 py-0.5 font-medium text-[#4c3d2d]">
                  {contextBadge.value}
                </span>
                {contextBadge.onClear ? (
                  <button
                    type="button"
                    onClick={contextBadge.onClear}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#8a7558] transition-colors hover:bg-[#e2d8c8] hover:text-zinc-900"
                    aria-label="Clear selected context"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <Textarea
            id="ai-input-hero"
            value={value}
            placeholder={resolvedPlaceholder}
            className={cn(
              "w-full resize-none border-none bg-transparent px-0 pb-16 pt-0 text-[15px] text-zinc-900 sm:text-base",
              "placeholder:text-zinc-500",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300",
              compact ? "min-h-[88px]" : "min-h-[132px]",
              isAgentCreateMode && "placeholder:text-[#7b6b55]"
            )}
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
          />

          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-4.5rem)] items-center gap-2 sm:bottom-4 sm:left-4">
            {mode === "create" && agentLimitNotice ? (
              <div className="absolute -top-11 left-0 right-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {agentLimitNotice}
              </div>
            ) : null}
            {mode === "create" && !compact ? (
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white/90 p-1 shadow-sm">
                <div className="group/build relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode("build");
                      setAgentLimitNotice(null);
                      setMobileQuotaHint((prev) => (prev === "build" ? null : "build"));
                    }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      creationMode === "build"
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    Build
                  </button>
                  {userData ? (
                    <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 hidden max-w-[80vw] -translate-x-1/2 whitespace-normal rounded-xl bg-[#1f1f1f] px-3 py-2 text-center text-[11px] font-medium text-white shadow-lg group-hover/build:md:block">
                      Build tokens left: {buildRemaining}/{buildTokenLimit}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#1f1f1f]" />
                    </div>
                  ) : null}
                </div>
                <div className="group/agent relative">
                  <button
                    type="button"
                    onClick={() => {
                    if (!canUseAgents) {
                      setCreationMode("build");
                      setAgentLimitNotice(
                        `Agents limit reached. Stay in Builder mode for now. ${isPaidUser ? "Your agents quota will reset next period." : "Upgrade for more agent runs or wait for reset."}`
                      );
                      setMobileQuotaHint((prev) => (prev === "agent" ? null : "agent"));
                      return;
                    }
                    setCreationMode("agent");
                    setAgentLimitNotice(null);
                    setMobileQuotaHint((prev) => (prev === "agent" ? null : "agent"));
                  }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      creationMode === "agent"
                        ? "bg-[#6f6557] text-white"
                        : "text-zinc-600 hover:text-zinc-900",
                      !canUseAgents && "cursor-not-allowed text-zinc-400 hover:text-zinc-400"
                    )}
                  >
                    {primaryAgent.shortLabel}
                  </button>
                  {userData ? (
                    <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 hidden max-w-[80vw] -translate-x-1/2 whitespace-normal rounded-xl bg-[#1f1f1f] px-3 py-2 text-center text-[11px] font-medium text-white shadow-lg group-hover/agent:md:block">
                      {canUseAgents
                        ? `Agents runs left: ${agentRemaining}/${agentRunLimit}`
                        : `Agents limit reached: ${agentRemaining}/${agentRunLimit} left`}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#1f1f1f]" />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {mode === "create" && !compact && userData && mobileQuotaHint ? (
              <div className="absolute -top-11 left-0 right-0 rounded-xl border border-zinc-700 bg-[#1f1f1f] px-3 py-2 text-center text-[11px] font-medium text-white md:hidden">
                {mobileQuotaHint === "build"
                  ? `Build tokens left: ${buildRemaining}/${buildTokenLimit}`
                  : canUseAgents
                    ? `Agents runs left: ${agentRemaining}/${agentRunLimit}`
                    : `Agents limit reached: ${agentRemaining}/${agentRunLimit} left`}
              </div>
            ) : null}

            {mode === "chat" && visualEditToggle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={visualEditToggle.onToggle}
                className={cn(
                  "h-8 rounded-full border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50",
                  visualEditToggle.active && "border-zinc-400 text-zinc-900"
                )}
              >
                {visualEditToggle.active ? "Visual Edit On" : "Visual Edit"}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                className={cn(
                  "h-8 rounded-full px-3 text-xs hover:bg-zinc-50",
                  isAgentCreateMode
                    ? "border-[#d8cec0] bg-[#fbf7f0] text-[#6f6557]"
                    : "border-zinc-200 bg-white text-zinc-700"
                  )}
                >
                  {autoMode ? "Model: Auto" : `Model: ${selectedModel}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={10}
                avoidCollisions={false}
                className="max-h-[24rem] w-[23rem] overflow-y-auto overscroll-contain border-zinc-200 bg-white p-2"
              >
                <DropdownMenuLabel className="px-2 pb-1 text-xs font-medium text-zinc-500">Response model</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => setAutoMode(true)}
                  className="rounded-2xl border border-zinc-200/80 px-3 py-3 text-zinc-800 focus:bg-zinc-100"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-zinc-500" />
                        <span className="text-sm font-medium text-zinc-900">Automatic</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Uses the default balanced model for the smoothest generation flow.
                      </p>
                    </div>
                    {autoMode ? <Check className="mt-0.5 h-4 w-4 text-zinc-900" /> : null}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isPaidUser ? (
                  availableModels.map((model) => {
                    const meta = getModelMeta(model);
                    const isSelected = !autoMode && selectedModel === model;

                    return (
                      <DropdownMenuItem
                        key={model}
                        onSelect={() => {
                          setAutoMode(false);
                          setSelectedModel(model);
                        }}
                        className="rounded-2xl border border-transparent px-3 py-3 text-zinc-800 focus:border-zinc-200 focus:bg-zinc-100"
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-900">{meta.label}</span>
                              {meta.badges.slice(0, 2).map((badge) => (
                                <span
                                  key={`${model}-${badge}`}
                                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500"
                                >
                                  {badge}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                              {meta.description}
                            </p>
                            <p className="mt-2 truncate text-[11px] text-zinc-400">{model}</p>
                          </div>
                          {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-900" /> : null}
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="px-2 py-2">
                    <p className="text-xs text-zinc-600">Custom model choice is available on paid plans.</p>
                    <Link href="/pricing" className="mt-2 inline-flex text-xs font-medium text-zinc-900 hover:text-black">
                      Upgrade
                    </Link>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <motion.button
            type="button"
            className={cn(
              "absolute bottom-3 right-3 sm:bottom-4 sm:right-4 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
              "focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-0",
              canStop
                ? "bg-zinc-900 text-white hover:bg-black active:scale-95"
                : canSubmit
                ? isAgentCreateMode
                  ? "bg-[#6f6557] text-white hover:bg-[#5d5447] active:scale-95"
                  : "bg-zinc-900 text-white hover:bg-black active:scale-95"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
            aria-label={canStop ? "Pause generation" : submitAriaLabel}
            title={canStop ? "Pause generation" : submitAriaLabel}
            disabled={!canSubmit && !canStop}
            onClick={canStop ? onStop : handleSubmit}
            whileTap={canSubmit || canStop ? { scale: 0.92 } : {}}
          >
            {canStop ? <Pause className="h-4 w-4" /> : isCreating || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
