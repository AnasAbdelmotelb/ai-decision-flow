"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunSummary } from "@/lib/runs";

const statusStyles: Record<RunSummary["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

type Props = {
  currentRunId: string | null;
  // Changes when the current run changes state, so the list refreshes after each run.
  refreshKey: string;
  onShow: (id: string) => void;
};

// Past runs, newest first. Opening one shows its path and log on the canvas.
export function RunHistory({ currentRunId, refreshKey, onShow }: Props) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false; // ignore a response that arrives after a newer request started
    fetch("/api/runs", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return ((await response.json()) as { runs: RunSummary[] }).runs;
      })
      .then(
        (list) => {
          if (cancelled) return;
          setRuns(list);
          setError(null);
        },
        () => {
          if (!cancelled) setError("Could not load the run history.");
        },
      );
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reload]);

  return (
    <section className="flex flex-col gap-2" aria-label="Run history">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
        <Button size="xs" variant="ghost" onClick={() => setReload((n) => n + 1)}>
          <RefreshCw data-icon="inline-start" /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {runs?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {runs?.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => onShow(run.id)}
              aria-current={run.id === currentRunId ? "true" : undefined}
              className={cn(
                "w-full rounded-lg border p-2.5 text-left text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                run.id === currentRunId && "border-foreground/40 bg-muted/60",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 text-xs font-semibold", statusStyles[run.status])}>
                  {run.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {run.outcome ? `→ ${run.outcome.label}` : run.status === "failed" ? "Failed" : "In progress"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(run.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{run.input}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {run.decisions} {run.decisions === 1 ? "decision" : "decisions"}
                {run.retryOf && <> · retry of {run.retryOf.slice(0, 8)}</>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
