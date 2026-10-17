"use client";

import { CheckCircle2, Loader2, Play, X, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RunRecord } from "@/lib/runs";

const EXAMPLES = [
  "My invoice download button returns an error and I can't get my receipt.",
  "Do you offer a discount if our team of 50 people signs up for a year?",
];

type Props = {
  run: RunRecord | null;
  error: string | null;
  starting: boolean;
  stalled: boolean;
  canRun: boolean;
  locked: boolean;
  onRun: (input: string) => void;
  onClear: () => void;
};

function statusLine(run: RunRecord) {
  switch (run.status) {
    case "queued":
      return {
        icon: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />,
        text: "Queued in Inngest…",
        tone: "text-muted-foreground",
      };
    case "running":
      return {
        icon: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />,
        text: "Running…",
        tone: "text-sky-700",
      };
    case "completed":
      return {
        icon: <CheckCircle2 className="size-4" />,
        text: `Finished at “${run.outcome?.label}”`,
        tone: "text-emerald-700",
      };
    case "failed":
      return { icon: <XCircle className="size-4" />, text: "Run failed", tone: "text-rose-700" };
  }
}

export function RunPanel({ run, error, starting, stalled, canRun, locked, onRun, onClear }: Props) {
  const [input, setInput] = useState(EXAMPLES[0]);
  const inputId = useId();
  const status = run ? statusLine(run) : null;

  return (
    <aside
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t bg-background p-4 max-md:max-h-[45dvh] md:w-96 md:border-t-0 md:border-l"
      aria-label="Run the workflow"
    >
      <h2 className="text-sm font-semibold">Run the workflow</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          Input every decision is asked about
        </label>
        <Textarea
          id={inputId}
          value={input}
          maxLength={4000}
          readOnly={locked}
          onChange={(event) => setInput(event.target.value)}
          className="min-h-20 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example, index) => (
            <Button key={example} size="xs" variant="outline" disabled={locked} onClick={() => setInput(example)}>
              Example {index + 1}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onRun(input)} disabled={!canRun || locked || starting || input.trim() === ""}>
          {locked || starting ? (
            <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {locked || starting ? "Running" : "Run"}
        </Button>
        {run && !locked && (
          <Button variant="ghost" onClick={onClear}>
            <X data-icon="inline-start" /> Clear result
          </Button>
        )}
      </div>
      {!canRun && <p className="text-xs text-amber-700">Fix the issues listed on the canvas before running.</p>}

      <div aria-live="polite" className="flex flex-col gap-2 text-sm">
        {error && <p className="text-rose-700">{error}</p>}
        {status && (
          <p className={cn("flex items-center gap-1.5 font-medium", status.tone)}>
            {status.icon} {status.text}
          </p>
        )}
        {run?.status === "failed" && run.error && <p className="text-rose-700">{run.error}</p>}
        {stalled && (
          <p className="text-amber-700">
            Still queued. Is the Inngest dev server running? Start it with <code>npm run dev:inngest</code>.
          </p>
        )}
      </div>

      {run && run.steps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Execution order</h3>
          <ol className="flex flex-col gap-2">
            {run.steps.map((step) => (
              <li key={step.nodeId} className="rounded-lg border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{step.order}.</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
                  {step.status === "running" && (
                    <Loader2
                      className="size-3.5 animate-spin text-sky-700 motion-reduce:animate-none"
                      aria-label="Asking the model"
                    />
                  )}
                  {step.answer && (
                    <span
                      className={cn(
                        "rounded-full px-2 text-xs font-bold",
                        step.answer === "YES" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
                      )}
                    >
                      {step.answer}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{step.prompt}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.model && <>Model: {step.model}</>}
                  {step.raw !== undefined && step.raw !== step.answer && <> · Reply: “{step.raw}”</>}
                  {step.calls === 2 && <> · needed a repair request</>}
                  {step.attempt > 1 && <> · attempt {step.attempt}</>}
                </p>
                {step.error && <p className="mt-1 text-xs text-rose-700">{step.error}</p>}
              </li>
            ))}
            {run.outcome && (
              <li className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-2.5 text-sm text-emerald-900">
                <span className="font-mono text-xs">{run.steps.length + 1}.</span> Outcome:{" "}
                <span className="font-semibold">{run.outcome.label}</span>
              </li>
            )}
          </ol>
        </section>
      )}

      {run && (
        <p className="mt-auto text-xs text-muted-foreground">
          Run <code>{run.id.slice(0, 8)}</code> · each decision is one step in the Inngest dev server&apos;s Runs view.
        </p>
      )}
    </aside>
  );
}
