"use client";

import { CheckCircle2, History, Loader2, Play, RotateCw, X, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { ExecutionLog } from "@/components/flow/execution-log";
import { RunHistory } from "@/components/flow/run-history";
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
  runMatchesCanvas: boolean;
  onRun: (input: string) => void;
  onClear: () => void;
  onShow: (id: string) => void;
  onRetry: (id: string) => void;
  onLoadRunWorkflow: () => void;
};

const spinner = <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />;

function statusLine(run: RunRecord) {
  switch (run.status) {
    case "queued":
      return { icon: spinner, text: "Queued in Inngest…", tone: "text-muted-foreground" };
    case "running":
      return { icon: spinner, text: "Running…", tone: "text-sky-700" };
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

export function RunPanel(props: Props) {
  const { run, error, starting, stalled, canRun, locked, runMatchesCanvas } = props;
  const [input, setInput] = useState(EXAMPLES[0]);
  const [tab, setTab] = useState<"run" | "history">("run");
  const inputId = useId();
  const status = run ? statusLine(run) : null;

  const tabButton = (value: "run" | "history", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
        tab === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <aside
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t bg-background p-4 max-md:max-h-[45dvh] md:w-96 md:border-t-0 md:border-l"
      aria-label="Run the workflow"
    >
      <div role="tablist" aria-label="Run panel" className="flex gap-1 rounded-lg bg-muted p-1">
        {tabButton("run", "Run", <Play className="size-3.5" />)}
        {tabButton("history", "History", <History className="size-3.5" />)}
      </div>

      {tab === "run" && (
        <>
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

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => props.onRun(input)} disabled={!canRun || locked || starting || input.trim() === ""}>
              {locked || starting ? (
                <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {locked || starting ? "Running" : "Run"}
            </Button>
            {run?.status === "failed" && (
              <Button variant="outline" disabled={starting} onClick={() => props.onRetry(run.id)}>
                <RotateCw data-icon="inline-start" /> Retry from failed step
              </Button>
            )}
            {run && !locked && (
              <Button variant="ghost" onClick={props.onClear}>
                <X data-icon="inline-start" /> Clear result
              </Button>
            )}
          </div>
          {!canRun && <p className="text-xs text-amber-700">Fix the issues listed on the canvas before running.</p>}
        </>
      )}

      <div aria-live="polite" className="flex flex-col gap-2 text-sm">
        {error && <p className="text-rose-700">{error}</p>}
        {status && (
          <p className={cn("flex items-center gap-1.5 font-medium", status.tone)}>
            {status.icon} {status.text}
          </p>
        )}
        {stalled && (
          <p className="text-amber-700">
            Still queued. Is the Inngest dev server running? Start it with <code>npm run dev:inngest</code>.
          </p>
        )}
        {run && !runMatchesCanvas && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-2.5 text-xs text-amber-900">
            This run used a different version of the workflow, so the canvas may not match its path.
            <Button size="xs" variant="outline" className="mt-2" disabled={locked} onClick={props.onLoadRunWorkflow}>
              Show the workflow this run used
            </Button>
          </div>
        )}
      </div>

      {tab === "run" && run && <ExecutionLog run={run} />}
      {tab === "history" && (
        <RunHistory
          currentRunId={run?.id ?? null}
          refreshKey={`${run?.id}:${run?.status}`}
          onShow={(id) => {
            props.onShow(id);
            setTab("run");
          }}
        />
      )}

      {run && (
        <p className="mt-auto text-xs text-muted-foreground">
          Run <code>{run.id.slice(0, 8)}</code> · each decision is one step in the Inngest dev server&apos;s Runs view.
        </p>
      )}
    </aside>
  );
}
