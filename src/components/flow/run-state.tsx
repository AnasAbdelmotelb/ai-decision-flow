"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { StoredGraph } from "@/lib/graph";
import type { RunRecord, RunStep } from "@/lib/runs";

const POLL_MS = 600;
// A run still queued after this long usually means the Inngest dev server isn't running.
const STALLED_MS = 8_000;

export function isActive(run: RunRecord | null): boolean {
  return run?.status === "queued" || run?.status === "running";
}

// Starts a run through the API, then polls its record until it completes or fails.
export function useRun() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stalled, setStalled] = useState(false);

  const start = useCallback(async (graph: StoredGraph, input: string) => {
    setStarting(true);
    setError(null);
    setStalled(false);
    setRun(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, input }),
      });
      const body = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (body.runId) setRunId(body.runId);
      if (!response.ok) setError(body.error ?? `Could not start the run (HTTP ${response.status}).`);
    } catch {
      setError("Could not reach the app server.");
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (response.ok) {
          const record = (await response.json()) as RunRecord;
          if (stopped) return;
          setRun(record);
          setStalled(record.status === "queued" && Date.now() - Date.parse(record.createdAt) > STALLED_MS);
          if (!isActive(record)) return;
        }
      } catch {
        // Network hiccup: try again on the next tick.
      }
      if (!stopped) timer = window.setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [runId]);

  // Open a past run (from History); polling stops at once if it has finished.
  const show = useCallback(
    (id: string) => {
      if (id === runId) return; // already showing it
      setError(null);
      setStalled(false);
      setRun(null);
      setRunId(id);
    },
    [runId],
  );

  // Retry a failed run from the step that failed.
  const retry = useCallback(async (id: string) => {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${id}/retry`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (body.runId) {
        setRun(null);
        setRunId(body.runId);
      }
      if (!response.ok) setError(body.error ?? `Could not retry the run (HTTP ${response.status}).`);
    } catch {
      setError("Could not reach the app server.");
    } finally {
      setStarting(false);
    }
  }, []);

  const clear = useCallback(() => {
    setRunId(null);
    setRun(null);
    setError(null);
    setStalled(false);
  }, []);

  return { run, error, starting, stalled, start, show, retry, clear };
}

// What the canvas needs to know about the current run.
export const RunContext = createContext<RunRecord | null>(null);

export type NodeRunState = "idle" | "active" | "visited" | "failed" | "skipped";

export function useNodeRun(nodeId: string): { state: NodeRunState; step?: RunStep; locked: boolean } {
  const run = useContext(RunContext);
  if (!run) return { state: "idle", locked: false };
  const step = run.steps.find((s) => s.nodeId === nodeId);
  const locked = isActive(run);
  if (step?.status === "failed") return { state: "failed", step, locked };
  if (run.currentNodeId === nodeId && locked) return { state: "active", step, locked };
  if (run.visited.includes(nodeId)) return { state: "visited", step, locked };
  return { state: "skipped", step, locked };
}

export function useEdgeRun(edgeId: string): "idle" | "taken" | "latest" | "skipped" {
  const run = useContext(RunContext);
  if (!run) return "idle";
  const index = run.edgeIds.indexOf(edgeId);
  if (index === -1) return "skipped";
  return isActive(run) && index === run.edgeIds.length - 1 ? "latest" : "taken";
}
