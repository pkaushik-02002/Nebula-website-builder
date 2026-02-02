import { useState, useEffect, useRef } from "react";
import { Check, Loader2, X, ChevronRight, ChevronDown, Terminal, Clock, Sparkles, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "idle" | "running" | "success" | "failed";

/** Parses NDJSON activity tail and renders VS Code terminal-style lines */
function TerminalOutput({ logsTail }: { logsTail: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = logsTail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const entries: { type: string; step?: string; stream?: string; data?: string; message?: string; status?: string; error?: string }[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      entries.push(parsed as { type: string; step?: string; stream?: string; data?: string; message?: string; status?: string; error?: string });
    } catch {
      entries.push({ type: "raw", data: line });
    }
  }

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
              <span className="text-zinc-500 shrink-0 select-none">{">"}</span>
              <span className={cn(
                isSuccess && "text-zinc-300",
                isFailed && "text-red-400",
                isRunning && "text-zinc-400"
              )}>
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
            <div key={i} className={cn("pl-4 whitespace-pre-wrap break-all", isStderr ? "text-amber-400/90" : "text-zinc-300")}>
              {data}
            </div>
          );
        }
        if (e.type === "error") {
          const err = String(e.error ?? "");
          // E2B reports exit status 1 from background dev run; don't show that noise in terminal
          if (/CommandExitError|exit\s+status\s+1/i.test(err)) return null;
          return (
            <div key={i} className="pl-4 text-red-400">
              {err}
            </div>
          );
        }
        if (e.type === "success") {
          return (
            <div key={i} className="flex items-start gap-2 text-zinc-300">
              <span className="text-zinc-500 shrink-0 select-none">{">"}</span>
              <span className="text-zinc-300">✓ Preview ready</span>
            </div>
          );
        }
        if (e.type === "raw" && e.data) {
          return <div key={i} className="pl-4 text-zinc-500">{e.data}</div>;
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
  isFixing = false
}: BuildTimelineProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [elapsed, setElapsed] = useState<Record<string, string>>({});

  // Update elapsed times
  useEffect(() => {
    const interval = setInterval(() => {
      const newElapsed: Record<string, string> = {};
      steps.forEach(step => {
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

  const activeStepIndex = steps.findIndex(s => s.status === "running");
  const failedStepIndex = steps.findIndex(s => s.status === "failed");
  const allSuccess = steps.length > 0 && steps.every(s => s.status === "success");
  const hasFailed = steps.some(s => s.status === "failed");

  const headerTitle = hasFailed ? "Build failed" : allSuccess ? "Preview ready" : "Starting preview";
  const headerDot = hasFailed ? "bg-red-400" : allSuccess ? "bg-emerald-400" : "bg-zinc-400 animate-pulse";

  return (
    <div className={cn(
      "absolute inset-0 flex items-center justify-center z-20 pointer-events-none",
      className
    )}>
      <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 shadow-xl rounded-xl w-full max-w-md overflow-hidden pointer-events-auto transition-all duration-300 animate-in fade-in zoom-in-95">

        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", headerDot)} />
            <span className="font-semibold text-sm text-zinc-200">{headerTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-mono">
              {activeStepIndex !== -1 ? `Step ${activeStepIndex + 1}/${steps.length}` : hasFailed ? "Failed" : "Done"}
            </span>
            {timer !== undefined && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
                <Clock className="w-2.5 h-2.5" />
                {timer}s
              </div>
            )}
          </div>
        </div>

        {/* Steps List */}
        <div className="p-4 space-y-3">
          {steps.map((step) => {
            const isPending = step.status === "idle";
            const isActive = step.status === "running";
            const isDone = step.status === "success";
            const isFailed = step.status === "failed";

            return (
              <div key={step.key} className={cn("flex items-start gap-3", isPending && "opacity-40")}>
                <div className="mt-0.5 shrink-0">
                  {isPending && <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />}
                  {isActive && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
                  {isDone && <Check className="w-4 h-4 text-zinc-400" />}
                  {isFailed && <X className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-sm font-medium",
                      isActive ? "text-zinc-200" : isFailed ? "text-red-400" : "text-zinc-300"
                    )}>
                      {step.label}
                    </span>
                    {(isActive || isDone || isFailed) && (
                      <span className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {elapsed[step.key] || "0s"}
                      </span>
                    )}
                  </div>
                  {step.message && (
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">{step.message}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {steps.some((s) => s.status === "failed") && error && (
          <div className="px-4 pb-4 space-y-2">
            {failureReason && (
              <div className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-tight flex items-center gap-1.5 w-fit">
                <X className="w-2.5 h-2.5" />
                {failureReason} ({failureCategory})
              </div>
            )}
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300 whitespace-pre-wrap max-h-32 overflow-auto font-mono">
              {error}
            </div>
          </div>
        )}

        {/* Terminal - VS Code style */}
        <div className="border-t border-zinc-700/50">
          <button
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-zinc-500 hover:bg-zinc-800/50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Terminal
            </span>
            {isDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {isDetailsOpen && (
            <div className="bg-[#1e1e1e] border-t border-zinc-800 overflow-hidden flex flex-col" style={{ minHeight: 192 }}>
              {/* VS Code terminal tab bar */}
              <div className="flex items-center gap-0 border-b border-zinc-800 bg-zinc-900/80 px-2 py-0.5 shrink-0">
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-zinc-300 border-b-2 border-zinc-400 -mb-px">
                  <Terminal className="w-3 h-3 text-zinc-400" />
                  Output
                </div>
              </div>
              {/* Terminal content - scrollable, monospace */}
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed min-h-[160px] max-h-64 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                {logsTail ? (
                  <TerminalOutput logsTail={logsTail} />
                ) : logs?.install || logs?.dev ? (
                  <div className="space-y-3 text-zinc-400">
                    {logs?.install && (
                      <div>
                        <div className="text-zinc-500 mb-0.5">[install]</div>
                        <pre className="whitespace-pre-wrap break-all text-zinc-300">{logs.install}</pre>
                      </div>
                    )}
                    {logs?.dev && (
                      <div>
                        <div className="text-zinc-500 mb-0.5">[dev]</div>
                        <pre className="whitespace-pre-wrap break-all text-zinc-300">{logs.dev}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-zinc-500 italic">
                    Waiting for output...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {hasFailed && (
          <div className="p-3 border-t border-zinc-700/50 bg-zinc-800/30 flex flex-col gap-2">
            {failureCategory === "env" && (
              <button
                onClick={onOpenEnvVars}
                className="w-full text-xs bg-zinc-800 border border-zinc-600 text-zinc-200 px-3 py-2 rounded-md hover:bg-zinc-700 shadow-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Configure Environment Variables
              </button>
            )}

            {(failureCategory === "deps" || failureCategory === "build" || failureCategory === "unknown") && onFixWithAI && (
              <button
                onClick={onFixWithAI}
                disabled={isFixing}
                className="w-full text-xs bg-zinc-600 border border-zinc-500 text-zinc-100 px-3 py-2 rounded-md hover:bg-zinc-500 shadow-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFixing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {isFixing ? "Applying AI Fix..." : "Fix with AI"}
              </button>
            )}

            <button
              onClick={onRetry}
              disabled={isFixing}
              className="w-full text-xs bg-zinc-800 border border-zinc-600 text-zinc-300 px-3 py-2 rounded-md hover:bg-zinc-700 shadow-sm font-medium transition-all disabled:opacity-50"
            >
              Retry Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
