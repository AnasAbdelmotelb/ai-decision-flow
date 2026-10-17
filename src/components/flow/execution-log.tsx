"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunRecord } from "@/lib/runs";

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function duration(from: string, to?: string) {
  if (!to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function AnswerChip({ answer }: { answer: "YES" | "NO" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 text-xs font-bold",
        answer === "YES" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
      )}
    >
      {answer}
    </span>
  );
}

// The run's log: every decision in execution order, with timing, the model's reply, repair requests,
// retry attempts, reused answers and errors.
export function ExecutionLog({ run }: { run: RunRecord }) {
  const [copied, setCopied] = useState(false);

  const copyLog = async () => {
    const { id, status, input, createdAt, updatedAt, retryOf, outcome, error, steps } = run;
    const log = { id, status, input, createdAt, updatedAt, retryOf, outcome, error, steps };
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Execution log">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Execution log</h3>
        <Button size="xs" variant="ghost" onClick={copyLog}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy as JSON"}
        </Button>
      </div>

      <ol className="flex flex-col gap-2">
        <li className="rounded-lg border p-2.5 text-xs text-muted-foreground">
          <span className="font-mono">{clock(run.createdAt)}</span> · Run started
          {run.retryOf && (
            <>
              {" "}
              as a retry of run <code>{run.retryOf.slice(0, 8)}</code>
            </>
          )}
          <p className="mt-1 line-clamp-3 text-foreground">Input: {run.input}</p>
        </li>

        {run.steps.map((step) => (
          <li
            key={step.nodeId}
            className={cn(
              "rounded-lg border p-2.5 text-sm",
              step.status === "failed" && "border-rose-600/40 bg-rose-50",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{step.order}.</span>
              <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
              {step.status === "running" && (
                <Loader2
                  className="size-3.5 animate-spin text-sky-700 motion-reduce:animate-none"
                  aria-label="Asking the model"
                />
              )}
              {step.answer && <AnswerChip answer={step.answer} />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{step.prompt}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{clock(step.startedAt)}</span>
              {duration(step.startedAt, step.finishedAt) && <> · {duration(step.startedAt, step.finishedAt)}</>}
              {step.reused ? (
                <> · answer reused from the failed run, no model call</>
              ) : (
                step.model && <> · {step.model}</>
              )}
              {step.raw !== undefined && step.raw !== step.answer && <> · reply “{step.raw}”</>}
              {step.calls === 2 && <> · needed a repair request</>}
              {step.attempt > 1 && <> · attempt {step.attempt} of 3</>}
            </p>
            {step.error && <p className="mt-1 text-xs text-rose-700">{step.error}</p>}
          </li>
        ))}

        {run.outcome && (
          <li className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-2.5 text-sm text-emerald-900">
            <span className="font-mono text-xs">{run.steps.length + 1}.</span> Outcome:{" "}
            <span className="font-semibold">{run.outcome.label}</span>
            <span className="text-xs"> · total {duration(run.createdAt, run.updatedAt)}</span>
          </li>
        )}
        {run.status === "failed" && run.error && (
          <li className="rounded-lg border border-rose-600/40 bg-rose-50 p-2.5 text-sm text-rose-800">
            Run failed: {run.error}
          </li>
        )}
      </ol>
    </section>
  );
}
