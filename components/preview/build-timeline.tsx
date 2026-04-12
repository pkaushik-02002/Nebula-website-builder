import { useState, useEffect, useRef } from "react";
import { Check, Loader2, X, ChevronRight, ChevronDown, Terminal, Clock, Sparkles, Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TextShimmer } from "@/components/prompt-kit/text-shimmer";

export type StepStatus = "idle" | "running" | "success" | "failed";

/** NDJSON activity log parser — dark terminal colour scheme */
function TerminalOutput({ logsTail }: { logsTail: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = logsTail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const entries: {
    type: string;
    step?: string;
    stream?: string;
    data?: string;
    message?: string;
    status?: string;
    error?: string;
  }[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      entries.push(parsed as typeof entries[number]);
    } catch {
      entries.push({ type: "raw", data: line });
    }
  }

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  return (
    <div ref={containerRef} className="space-y-0.5">
      {entries.map((e, i) => {
        if (e.type === "step") {
          const step = e.step ?? "";
          const status = e.status ?? "";
          const msg = e.message ?? "";
          const isRunning = status === "running";
          const isSuccess = status === "success";
          const isFailed = status === "failed";
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 select-none text-zinc-500">$</span>
              <span
                className={cn(
                  isSuccess && "text-green-400",
                  isFailed && "text-red-400",
                  isRunning && "text-zinc-400"
                )}
              >
                {isSuccess && "✓ "}
                {isFailed && "✗ "}
                [{step}]
                {msg ? ` ${msg}` : ""}
              </span>
            </div>
          );
        }
        if (e.type === "log") {
          const stream = e.stream ?? "stdout";
          const data = (e.data ?? "").replace(/\r?\n$/, "");
          const isStderr = stream === "stderr";
          return (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all pl-4",
                isStderr ? "text-amber-400" : "text-green-400"
              )}
            >
              {data}
            </div>
          );
        }
        if (e.type === "error") {
          const err = String(e.error ?? "");
          if (/CommandExitError|exit\s+status\s+1/i.test(err)) return null;
          return (
            <div key={i} className="pl-4 text-red-400">
              {err}
            </div>
          );
        }
        if (e.type === "success") {
          return (
            <div key={i} className="flex items-start gap-2 text-green-400">
              <span className="shrink-0 select-none text-zinc-500">$</span>
              <span>✓ Preview ready</span>
            </div>
          );
        }
        if (e.type === "raw" && e.data) {
          return (
            <div key={i} className="pl-4 text-zinc-500">
              {e.data}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export interface TimelineStep {
  key: string;
  label: string;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
}

interface BuildTimelineProps {
  steps: TimelineStep[];
  className?: string;
  onRetry?: () => void;
  error?: string | null;
  logs?: {
    install?: string;
    dev?: string;
  };
  logsTail?: string;
  timer?: number;
  failureCategory?: "infra" | "env" | "deps" | "build" | "unknown";
  failureReason?: string | null;
  missingEnvVars?: any[];
  onFixWithAI?: () => void;
  onOpenEnvVars?: () => void;
  isFixing?: boolean;
}

export function BuildTimeline({
  steps,
  className,
  onRetry,
  error,
  logs,
  logsTail,
  timer,
  failureCategory,
  failureReason,
  missingEnvVars,
  onFixWithAI,
  onOpenEnvVars,
  isFixing = false,
}: BuildTimelineProps) {
  const hasLogs = !!(logsTail || logs?.install || logs?.dev);
  const [isDetailsOpen, setIsDetailsOpen] = useState(hasLogs);
  const [elapsed, setElapsed] = useState<Record<string, string>>({});

  // Open terminal automatically when logs arrive
  useEffect(() => {
    if (hasLogs) setIsDetailsOpen(true);
  }, [hasLogs]);

  // Update elapsed times per running/finished step
  useEffect(() => {
    const interval = setInterval(() => {
      const newElapsed: Record<string, string> = {};
      steps.forEach((step) => {
        if (step.status === "running" && step.startedAt) {
          const seconds = Math.floor((Date.now() - step.startedAt) / 1000);
          newElapsed[step.key] = `${seconds}s`;
        } else if (step.finishedAt && step.startedAt) {
          const seconds = Math.floor((step.finishedAt - step.startedAt) / 1000);
          newElapsed[step.key] = `${seconds}s`;
        }
      });
      setElapsed(newElapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [steps]);

  const activeStepIndex = steps.findIndex((s) => s.status === "running");
  const allSuccess = steps.length > 0 && steps.every((s) => s.status === "success");
  const hasFailed = steps.some((s) => s.status === "failed");

  const headerTitle = hasFailed
    ? "Build failed"
    : allSuccess
    ? "Preview ready"
    : "Starting preview";
  const headerDot = hasFailed
    ? "bg-red-500"
    : allSuccess
    ? "bg-emerald-500"
    : "bg-zinc-500 animate-pulse";

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center pointer-events-none",
        className
      )}
    >
      {/* Single keyframe for scanline sweep */}
      <style>{`
        @keyframes nebula-scanline-sweep {
          0%   { transform: translateY(-100%); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(300%); opacity: 0; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", headerDot)} />
            <span className="text-sm font-semibold text-zinc-800">{headerTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-500">
              {activeStepIndex !== -1
                ? `Step ${activeStepIndex + 1}/${steps.length}`
                : hasFailed
                ? "Failed"
                : "Done"}
            </span>
            {timer !== undefined && (
              <div className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                <Clock className="h-2.5 w-2.5" />
                {timer}s
              </div>
            )}
          </div>
        </div>

        {/* Steps — flowing log stream, no box-per-step */}
        <div className="relative px-4 py-3">
          {/* Thin vertical connector line */}
          {steps.length > 0 && (
            <div className="pointer-events-none absolute inset-y-3 left-[22px] w-px bg-zinc-200" />
          )}

          <div className="space-y-0">
            {steps.map((step) => {
              const isPending = step.status === "idle";
              const isActive = step.status === "running";
              const isDone = step.status === "success";
              const isFailed = step.status === "failed";

              return (
                <div
                  key={step.key}
                  className={cn(
                    "relative flex items-center gap-2.5 py-[5px]",
                    isPending && "opacity-40"
                  )}
                >
                  {/* Icon on connector line */}
                  <div className="relative z-10 flex h-3 w-3 shrink-0 items-center justify-center bg-white">
                    {isPending && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                    )}
                    {isActive && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inset-0 animate-ping rounded-full bg-zinc-600 opacity-50" />
                        <span className="relative h-2 w-2 rounded-full bg-zinc-900" />
                      </span>
                    )}
                    {isDone && (
                      <Check className="h-3 w-3 stroke-[2.5] text-emerald-500" />
                    )}
                    {isFailed && <X className="h-3 w-3 text-red-500" />}
                  </div>

                  {/* Label + elapsed timer */}
                  <div className="flex flex-1 items-center justify-between">
                    {isActive ? (
                      <TextShimmer className="text-sm font-medium bg-gradient-to-r from-zinc-900 via-zinc-500 to-zinc-900">
                        {step.label}
                      </TextShimmer>
                    ) : (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isDone && "text-zinc-400",
                          isFailed && "text-red-500",
                          isPending && "text-zinc-500"
                        )}
                      >
                        {step.label}
                      </span>
                    )}

                    {(isActive || isDone || isFailed) && elapsed[step.key] && (
                      <span className="ml-2 font-mono text-xs text-zinc-400">
                        {elapsed[step.key]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error detail */}
        {hasFailed && error && (
          <div className="px-4 pb-4 space-y-2">
            {failureReason && (
              <div className="flex w-fit items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-red-700">
                <X className="h-2.5 w-2.5" />
                {failureReason} ({failureCategory})
              </div>
            )}
            <div className="max-h-32 overflow-auto rounded-md border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          </div>
        )}

        {/* Terminal — dark theme, open by default when logs exist */}
        <div className="border-t border-zinc-200">
          {/* Terminal header with scanline sweep animation */}
          <button
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="relative w-full overflow-hidden border-b border-zinc-800 bg-[#111] px-4 py-2 flex items-center justify-between text-xs text-zinc-400 hover:bg-[#161616] transition-colors"
          >
            {/* Scanline sweep element */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
                animation: "nebula-scanline-sweep 4s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <span className="relative flex items-center gap-1.5 z-10">
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </span>
            <span className="relative z-10">
              {isDetailsOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          {isDetailsOpen && (
            <div
              className="flex flex-col overflow-hidden"
              style={{ background: "#0d0d0d", minHeight: 192 }}
            >
              {/* Tab bar */}
              <div className="flex shrink-0 items-center border-b border-zinc-800 bg-[#111] px-2 py-0.5">
                <div className="flex items-center gap-1.5 border-b-2 border-zinc-400 -mb-px px-2 py-1.5 text-[11px] font-medium text-zinc-400">
                  <Terminal className="h-3 w-3 text-zinc-500" />
                  Output
                </div>
              </div>

              {/* Terminal content */}
              <div className="max-h-64 min-h-[160px] flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                {logsTail ? (
                  <TerminalOutput logsTail={logsTail} />
                ) : logs?.install || logs?.dev ? (
                  <div className="space-y-3">
                    {logs?.install && (
                      <div>
                        <div className="mb-0.5 text-zinc-500">[install]</div>
                        <pre className="whitespace-pre-wrap break-all text-green-400">
                          {logs.install}
                        </pre>
                      </div>
                    )}
                    {logs?.dev && (
                      <div>
                        <div className="mb-0.5 text-zinc-500">[dev]</div>
                        <pre className="whitespace-pre-wrap break-all text-green-400">
                          {logs.dev}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center italic text-zinc-600">
                    Waiting for output...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Failure actions */}
        {hasFailed && (
          <div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50/80 p-3">
            {failureCategory === "env" && (
              <button
                onClick={onOpenEnvVars}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm transition-all hover:bg-zinc-100"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configure Environment Variables
              </button>
            )}

            {(failureCategory === "deps" ||
              failureCategory === "build" ||
              failureCategory === "unknown") &&
              onFixWithAI && (
                <button
                  onClick={onFixWithAI}
                  disabled={isFixing}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFixing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Applying AI Fix...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <TextShimmer className="bg-gradient-to-r from-white via-zinc-300 to-white">
                        Fix with AI
                      </TextShimmer>
                    </>
                  )}
                </button>
              )}

            <button
              onClick={onRetry}
              disabled={isFixing}
              className="flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-100 disabled:opacity-50"
            >
              Retry Preview
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
