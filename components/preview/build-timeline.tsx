import { useState, useEffect } from "react";
import { Check, Loader2, X, ChevronRight, ChevronDown, Terminal, Clock, Sparkles, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "idle" | "running" | "success" | "failed";

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
  const currentStep = steps[activeStepIndex !== -1 ? activeStepIndex : (failedStepIndex !== -1 ? failedStepIndex : steps.length - 1)];

  return (
    <div className={cn(
      "absolute inset-0 flex items-center justify-center z-20 pointer-events-none",
      className
    )}>
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl w-full max-w-md overflow-hidden pointer-events-auto transition-all duration-300 animate-in fade-in zoom-in-95">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-semibold text-sm text-slate-700">Building Preview</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">
              {activeStepIndex !== -1 ? `Step ${activeStepIndex + 1}/${steps.length}` : 'Done'}
            </span>
            {timer !== undefined && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-mono">
                <Clock className="w-2.5 h-2.5" />
                {timer}s
              </div>
            )}
          </div>
        </div>

        {/* Steps List */}
        <div className="p-4 space-y-3">
          {steps.map((step, index) => {
            const isPending = step.status === "idle";
            const isActive = step.status === "running";
            const isDone = step.status === "success";
            const isFailed = step.status === "failed";

            return (
              <div key={step.key} className={cn("flex items-start gap-3", isPending && "opacity-40")}>
                {/* Status Icon */}
                <div className="mt-0.5 shrink-0">
                  {isPending && <div className="w-4 h-4 rounded-full border-2 border-slate-200" />}
                  {isActive && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {isDone && <Check className="w-4 h-4 text-emerald-500" />}
                  {isFailed && <X className="w-4 h-4 text-red-500" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-sm font-medium",
                      isActive ? "text-blue-600" : (isFailed ? "text-red-600" : "text-slate-700")
                    )}>
                      {step.label}
                    </span>
                    {(isActive || isDone || isFailed) && (
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {elapsed[step.key] || "0s"}
                      </span>
                    )}
                  </div>
                  {step.message && (
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {step.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {steps.some((s) => s.status === "failed") && error && (
          <div className="px-4 pb-4 space-y-2">
            {failureReason && (
              <div className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-600 uppercase tracking-tight flex items-center gap-1.5 w-fit">
                <X className="w-2.5 h-2.5" />
                {failureReason} ({failureCategory})
              </div>
            )}
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap max-h-32 overflow-auto shadow-inner font-mono">
              {error}
            </div>
          </div>
        )}

        {/* Details Toggle */}
        <div className="border-t border-slate-100">
          <button
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Build Logs
            </span>
            {isDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {isDetailsOpen && (
            <div className="bg-slate-900 text-slate-300 p-3 text-[10px] font-mono h-48 overflow-y-auto border-t border-slate-800 scrollbar-thin scrollbar-thumb-slate-700">
              <div className="space-y-1">
                {logsTail && (
                  <div className="mb-4">
                    <div className="text-blue-400 border-b border-blue-900/30 mb-1 pb-0.5 uppercase tracking-wider font-bold">--- Activity Tail ---</div>
                    <div className="whitespace-pre-wrap opacity-80">{logsTail.split('\n').map(line => {
                      try {
                        const parsed = JSON.parse(line)
                        return JSON.stringify(parsed, null, 2)
                      } catch {
                        return line
                      }
                    }).join('\n')}</div>
                  </div>
                )}
                {logs?.install && (
                  <div className="mb-4">
                    <div className="text-amber-400 border-b border-amber-900/30 mb-1 pb-0.5 uppercase tracking-wider font-bold">--- Install Logs ---</div>
                    <div className="whitespace-pre-wrap opacity-80">{logs.install}</div>
                  </div>
                )}
                {logs?.dev && (
                  <div className="mb-4">
                    <div className="text-emerald-400 border-b border-emerald-900/30 mb-1 pb-0.5 uppercase tracking-wider font-bold">--- Dev Server Logs ---</div>
                    <div className="whitespace-pre-wrap opacity-80">{logs.dev}</div>
                  </div>
                )}
                {!logsTail && !logs?.install && !logs?.dev && (
                  <div className="flex flex-col items-center justify-center h-full opacity-40 italic">
                    Waiting for logs...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {steps.some(s => s.status === 'failed') && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2">
            {failureCategory === "env" && (
              <button
                onClick={onOpenEnvVars}
                className="w-full text-xs bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-md hover:bg-slate-50 shadow-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Configure Environment Variables
              </button>
            )}

            {(failureCategory === "deps" || failureCategory === "build") && onFixWithAI && (
              <button
                onClick={onFixWithAI}
                disabled={isFixing}
                className="w-full text-xs bg-indigo-600 border border-indigo-500 text-white px-3 py-2 rounded-md hover:bg-indigo-700 shadow-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full text-xs bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-md hover:bg-slate-50 shadow-sm font-medium transition-all disabled:opacity-50"
            >
              Retry Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
