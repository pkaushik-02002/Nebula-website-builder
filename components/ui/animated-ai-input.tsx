"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Check, Loader2, Mic, Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
  surface?: "default" | "code";
}

type VoiceState = "idle" | "recording" | "transcribing";

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

function AgentModeIcon({ active }: { active: boolean }) {
  return (
    <Image
      src="/Images/noun-ai-7087218.svg"
      alt=""
      aria-hidden="true"
      width={18}
      height={18}
      unoptimized
      className={cn(
        "h-[18px] w-[18px] shrink-0 object-contain transition-opacity",
        active ? "brightness-0 invert" : "opacity-65"
      )}
    />
  );
}

function BuildModeIcon({ active }: { active: boolean }) {
  return (
    <Image
      src="/Images/noun-ai-8330771.svg"
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      unoptimized
      className={cn(
        "h-4 w-4 shrink-0 object-contain transition-opacity",
        active ? "brightness-0 invert" : "opacity-65"
      )}
    />
  );
}

function getSupportedRecordingMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return "";

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function appendTranscriptToDraft(current: string, transcript: string) {
  const nextTranscript = transcript.trim();
  if (!nextTranscript) return current;
  if (!current.trim()) return nextTranscript;
  return `${current}${/[\s\n]$/.test(current) ? "" : " "}${nextTranscript}`;
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
  surface = "default",
}: AnimatedAIInputProps) {
  const router = useRouter();
  const { user, userData } = useAuth();
  const [value, setValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [buildMode, setBuildMode] = useState<"build" | "agents">("build");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<{ tone: "muted" | "error"; text: string } | null>(null);
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
  const isMountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptionAbortRef = useRef<AbortController | null>(null);

  const isPaidUser = userData?.planId && userData.planId !== "free";
  const buildUsed = Math.max(0, Number(userData?.tokenUsage?.used ?? 0));
  const buildRemaining = Math.max(0, Number(userData?.tokenUsage?.remaining ?? 0));
  const buildTokenLimit = Math.max(0, Number(userData?.tokensLimit ?? 0), buildUsed + buildRemaining);
  const effectiveModel = autoMode ? "GPT-4-1 Mini" : selectedModel;
  const isVoiceBusy = voiceState !== "idle";

  const PENDING_CREATE_KEY = "buildkit_pending_create";

  useEffect(() => {
    if (!isPaidUser) setAutoMode(true);
  }, [isPaidUser]);

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
    setVoiceSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      transcriptionAbortRef.current?.abort();

      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }

      stopMediaStream(mediaStreamRef.current);
    };
  }, []);

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
    if (!value.trim() || isCreating || disabled || isVoiceBusy) return;
    if (isLoading && mode !== "chat") return;

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
          buildMode,
        })
      );
      router.push("/login?redirect=" + encodeURIComponent("/"));
      return;
    }

    if (!user) return;

    setIsCreating(true);
    try {
      if (buildMode === "agents") {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/computer/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ prompt: value.trim(), referenceUrls: [] }),
        });
        const json = await res.json();
        if (!res.ok || !json?.computerId) throw new Error(json?.error ?? "Failed to create");
        router.push(`/computer/${json.computerId}?autostart=1`);
      } else {
        const projectData: Record<string, unknown> = {
          prompt: value.trim(),
          model: effectiveModel,
          status: "pending",
          createdAt: serverTimestamp(),
          messages: [],
          ownerId: user.uid,
          visibility: "private",
        };
        const docRef = await addDoc(collection(db, "projects"), projectData);
        router.push(`/project/${docRef.id}`);
      }
    } catch (error) {
      console.error("Error creating:", error);
      setIsCreating(false);
    }
  };

  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string) => {
    if (!user) {
      setVoiceFeedback({ tone: "error", text: "Sign in to use voice input." });
      if (isMountedRef.current) setVoiceState("idle");
      return;
    }

    const extension = getAudioFileExtension(mimeType || blob.type || "audio/webm");
    const file = new File([blob], `voice-input.${extension}`, {
      type: mimeType || blob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    transcriptionAbortRef.current = controller;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to transcribe audio right now.");
      }

      const transcript = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!transcript) {
        throw new Error("No clear speech was detected. Please try again.");
      }

      if (!isMountedRef.current) return;

      setValue((current) => appendTranscriptToDraft(current, transcript));
      setVoiceFeedback(null);
      setVoiceState("idle");
      window.requestAnimationFrame(() => adjustHeight());
    } catch (error) {
      if (!isMountedRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;

      const message = error instanceof Error ? error.message : "Unable to transcribe audio right now.";
      setVoiceFeedback({ tone: "error", text: message });
      setVoiceState("idle");
    } finally {
      transcriptionAbortRef.current = null;
    }
  }, [adjustHeight, user]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (!voiceSupported) {
      setVoiceFeedback({ tone: "error", text: "Voice input is not supported in this browser." });
      return;
    }

    if (!user) {
      setVoiceFeedback({ tone: "error", text: "Sign in to use voice input." });
      return;
    }

    if (disabled || isCreating || isLoading || isVoiceBusy) return;

    setVoiceFeedback(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...audioChunksRef.current];
        const resolvedMimeType = recorder.mimeType || mimeType || "audio/webm";

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopMediaStream(mediaStreamRef.current);
        mediaStreamRef.current = null;

        if (!isMountedRef.current) return;

        if (chunks.length === 0) {
          setVoiceFeedback({ tone: "error", text: "No speech was captured. Please try again." });
          setVoiceState("idle");
          return;
        }

        setVoiceState("transcribing");
        void transcribeAudio(new Blob(chunks, { type: resolvedMimeType }), resolvedMimeType);
      };

      recorder.start();
      setVoiceState("recording");
    } catch (error) {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];

      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow microphone access and try again."
          : error instanceof Error
            ? error.message
            : "Unable to start voice input.";

      setVoiceFeedback({ tone: "error", text: message });
      setVoiceState("idle");
    }
  }, [disabled, isCreating, isLoading, isVoiceBusy, transcribeAudio, user, voiceSupported]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey = (e.key === "Enter" && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === "Enter");
    if (isSubmitKey && value.trim() && !isCreating && !isVoiceBusy && (!isLoading || mode === "chat")) {
      if (disabled) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const canInterruptWithMessage =
    mode === "chat" && isLoading && value.trim().length > 0 && !isCreating && !disabled;
  const canSubmit =
    value.trim().length > 0 &&
    !isCreating &&
    !isVoiceBusy &&
    (!isLoading || mode === "chat") &&
    !disabled;
  const canStop = mode === "chat" && isLoading && !disabled && typeof onStop === "function" && !canInterruptWithMessage;
  const submitAriaLabel = mode === "chat" ? "Send message" : "Start build";
  const isCodeSurface = surface === "code";
  const voiceNotice =
    voiceState === "recording"
      ? { tone: "muted" as const, text: "Listening... tap the mic again when you're done." }
      : voiceState === "transcribing"
        ? { tone: "muted" as const, text: "Transcribing with OpenAI..." }
        : voiceFeedback;
  const canStartVoiceInput = voiceSupported && !disabled && !isCreating && !isLoading && !canStop && !isVoiceBusy;
  const showVoiceButton = voiceSupported && !canStop;
  const voiceButtonLabel =
    voiceState === "recording"
      ? "Stop voice recording"
      : voiceState === "transcribing"
        ? "Transcribing audio"
        : !user
          ? "Sign in to use voice input"
          : "Start voice input";

  return (
    <div className={cn("group w-full", isCodeSurface ? "max-w-none" : "max-w-2xl")}>
      <div
        className={cn(
          "relative border transition-all duration-200",
          isCodeSurface ? "rounded-[1rem] bg-white shadow-none" : "rounded-3xl bg-[#fcfcfa] shadow-sm",
          disabled
            ? "border-zinc-200 opacity-70"
            : isFocused
              ? "border-zinc-400 ring-2 ring-zinc-300/60"
              : "border-zinc-200 hover:border-zinc-300"
        )}
      >
        <div className={cn("relative", isCodeSurface ? "px-3 pb-3 pt-3 sm:px-3.5 sm:pb-3.5 sm:pt-3.5" : "px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5")}>
          {contextBadge ? (
            <div className="mb-3 flex max-w-[calc(100%-4rem)] items-center">
              <div className={cn(
                "inline-flex min-h-10 items-center gap-2 px-3 py-2 text-xs text-zinc-700",
                isCodeSurface ? "rounded-xl border border-zinc-200 bg-[#f7f5f0]" : "rounded-2xl bg-[#ece7dd]"
              )}>
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
            placeholder={placeholder}
            className={cn(
              "w-full resize-none border-none bg-transparent px-0 pt-0 text-zinc-900",
              "placeholder:text-zinc-500",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300",
              isCodeSurface ? "pb-12 text-[14px] sm:text-[14px]" : "pb-16 text-[15px] sm:text-base",
              compact ? (isCodeSurface ? "min-h-[72px]" : "min-h-[88px]") : "min-h-[132px]",
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

          {voiceNotice ? (
            <p
              className={cn(
                "pointer-events-none absolute left-4 right-16 truncate text-[11px]",
                isCodeSurface ? "bottom-12 sm:bottom-[3.2rem]" : "bottom-14 sm:bottom-[3.6rem]",
                voiceNotice.tone === "error" ? "text-red-600" : "text-zinc-500"
              )}
              aria-live="polite"
            >
              {voiceNotice.text}
            </p>
          ) : null}

          <div className={cn(
            "absolute flex max-w-[calc(100%-4.5rem)] items-center gap-2",
            isCodeSurface ? "bottom-2.5 left-2.5 sm:bottom-3 sm:left-3" : "bottom-3 left-3 sm:bottom-4 sm:left-4"
          )}>
            {mode === "create" && !compact && userData ? (
              <div className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 bg-white/90 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setBuildMode("build")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    buildMode === "build"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <BuildModeIcon active={buildMode === "build"} />
                  <span>Build</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBuildMode("agents")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    buildMode === "agents"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <AgentModeIcon active={buildMode === "agents"} />
                  <span>Agents</span>
                </button>
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
                  "h-8 border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50",
                  isCodeSurface ? "rounded-lg" : "rounded-full"
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

          {showVoiceButton ? (
            <motion.button
              type="button"
              className={cn(
                "absolute flex items-center justify-center border transition-all duration-200",
                isCodeSurface
                  ? "bottom-2.5 right-14 h-9 w-9 rounded-lg sm:bottom-3 sm:right-[3.75rem]"
                  : "bottom-3 right-16 h-10 w-10 rounded-full sm:bottom-4 sm:right-[4.5rem]",
                "focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-0",
                voiceState === "recording"
                  ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  : voiceState === "transcribing"
                    ? "border-zinc-200 bg-white text-zinc-500"
                    : canStartVoiceInput
                      ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      : "border-zinc-200 bg-zinc-100 text-zinc-400"
              )}
              aria-label={voiceButtonLabel}
              title={voiceButtonLabel}
              disabled={voiceState === "transcribing" || (!canStartVoiceInput && voiceState !== "recording")}
              onClick={voiceState === "recording" ? stopVoiceRecording : startVoiceRecording}
              whileTap={voiceState === "transcribing" ? {} : { scale: 0.94 }}
            >
              {voiceState === "recording" ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : voiceState === "transcribing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </motion.button>
          ) : null}

          <motion.button
            type="button"
            className={cn(
              "absolute flex items-center justify-center gap-2 transition-all duration-200",
              isCodeSurface ? "bottom-2.5 right-2.5 h-9 rounded-lg px-2.5 sm:bottom-3 sm:right-3" : "bottom-3 right-3 h-10 rounded-full px-3 sm:bottom-4 sm:right-4",
              "focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-0",
              canStop || canSubmit
                ? "bg-zinc-900 text-white hover:bg-black active:scale-95"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
            aria-label={canStop ? "Stop generating" : submitAriaLabel}
            title={canStop ? "Stop generating" : submitAriaLabel}
            disabled={!canSubmit && !canStop}
            onClick={canStop ? onStop : handleSubmit}
            whileTap={canSubmit || canStop ? { scale: 0.92 } : {}}
          >
            {canStop ? (
              <>
                <Square className="h-4 w-4" />
                <span className="text-xs font-medium">Stop</span>
              </>
            ) : isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
