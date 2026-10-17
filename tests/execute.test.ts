import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideWithStub, type Decide } from "@/lib/decide";
import { executeWorkflow, InvalidWorkflowError, type StepRunner } from "@/lib/execute";
import { connect, exampleGraph, makeDecisionNode, makeOutcomeNode, toStored, type Graph } from "@/lib/graph";
import { RunStore } from "@/lib/runs";

// Behaves like Inngest's step.run: a completed step's result is memoised and its code is not re-run.
function memoStep(): StepRunner & { ids: string[] } {
  const memo = new Map<string, unknown>();
  const ids: string[] = [];
  return {
    ids,
    async run<T>(id: string, fn: () => Promise<T>) {
      if (memo.has(id)) return memo.get(id) as T;
      const value = JSON.parse(JSON.stringify(await fn())) as T;
      memo.set(id, value);
      ids.push(id);
      return value;
    },
  };
}

const stub: Decide = async (question, input) => decideWithStub(question, input);

// Start → "Support request?" —YES→ "Is it urgent?" —YES→ Urgent / —NO→ Support queue; —NO→ Sales
function twoLevelGraph(): Graph {
  const graph = exampleGraph();
  const urgent = { ...makeDecisionNode({ x: 0, y: 0 }), id: "decision-urgent", data: { label: "Urgent?", prompt: "Is the customer blocked and is it urgent?" } };
  const urgentOutcome = { ...makeOutcomeNode({ x: 0, y: 0 }), id: "outcome-urgent", data: { label: "Urgent support" } };
  let next: Graph = { nodes: [...graph.nodes, urgent, urgentOutcome], edges: graph.edges };
  next = { ...next, edges: connect(next, "decision-support", "yes", "decision-urgent") };
  next = { ...next, edges: connect(next, "decision-urgent", "yes", "outcome-urgent") };
  next = { ...next, edges: connect(next, "decision-urgent", "no", "outcome-support") };
  return next;
}

let dir: string;
let store: RunStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "runs-"));
  store = new RunStore(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(graph: Graph, input: string, decide: Decide = stub, step = memoStep()) {
  const record = await store.create(input, toStored(graph));
  const result = await executeWorkflow({ runId: record.id, graph: toStored(graph), input, step, decide, store });
  return { result, record: (await store.get(record.id))!, step };
}

describe("executeWorkflow", () => {
  it("follows YES to Support for the brief's example", async () => {
    const { result, record, step } = await run(exampleGraph(), "I need support: my password reset email never arrives");
    expect(result).toMatchObject({ outcomeLabel: "Support", answers: ["YES"] });
    expect(step.ids).toEqual(["start", "decide:decision-support", "outcome:outcome-support"]);
    expect(record.status).toBe("completed");
    expect(record.outcome).toEqual({ nodeId: "outcome-support", label: "Support" });
    expect(record.visited).toEqual(["start", "decision-support", "outcome-support"]);
    expect(record.edgeIds).toEqual(["start:next->decision-support", "decision-support:yes->outcome-support"]);
    expect(record.steps).toMatchObject([
      { order: 1, nodeId: "decision-support", status: "done", answer: "YES", attempt: 1, model: "stub" },
    ]);
  });

  it("follows NO to Sales", async () => {
    const { result, record } = await run(exampleGraph(), "How much is the team plan per seat?");
    expect(result.outcomeLabel).toBe("Sales");
    expect(record.edgeIds.at(-1)).toBe("decision-support:no->outcome-sales");
  });

  it("traverses several decisions in order, one step per node", async () => {
    const { result, record, step } = await run(twoLevelGraph(), "I need support urgently, the customer is blocked");
    expect(result).toMatchObject({ outcomeLabel: "Urgent support", answers: ["YES", "YES"] });
    expect(step.ids).toEqual(["start", "decide:decision-support", "decide:decision-urgent", "outcome:outcome-urgent"]);
    expect(record.steps.map((s) => [s.order, s.nodeId, s.answer])).toEqual([
      [1, "decision-support", "YES"],
      [2, "decision-urgent", "YES"],
    ]);
  });

  it("does not call the model again for steps that already completed (Inngest replay)", async () => {
    const decide = vi.fn(stub);
    const step = memoStep();
    const graph = toStored(twoLevelGraph());
    const record = await store.create("I need support", graph);
    const options = { runId: record.id, graph, input: "I need support", step, decide, store };
    await executeWorkflow(options);
    await executeWorkflow(options); // a replay re-runs the function body from the top
    expect(decide).toHaveBeenCalledTimes(2); // two decisions, each called once
  });

  it("records a failed step and rethrows so Inngest can retry; a retry replaces it", async () => {
    const graph = exampleGraph();
    const record = await store.create("I need support", toStored(graph));
    const step = memoStep();
    const failing: Decide = async () => {
      throw new Error("LLM request timed out.");
    };
    const base = { runId: record.id, graph: toStored(graph), input: "I need support", step, store };

    await expect(executeWorkflow({ ...base, decide: failing })).rejects.toThrow("LLM request timed out.");
    let saved = (await store.get(record.id))!;
    expect(saved.steps).toMatchObject([{ nodeId: "decision-support", status: "failed", error: "LLM request timed out.", attempt: 1 }]);
    expect(saved.status).toBe("running");

    await executeWorkflow({ ...base, decide: stub, attempt: 1 });
    saved = (await store.get(record.id))!;
    expect(saved.status).toBe("completed");
    expect(saved.steps).toMatchObject([{ status: "done", answer: "YES", attempt: 2 }]);
  });

  it("refuses an incomplete workflow before calling the model", async () => {
    const graph = exampleGraph();
    graph.edges = graph.edges.filter((edge) => edge.data?.branch !== "no");
    const decide = vi.fn(stub);
    const record = await store.create("x", toStored(graph));
    await expect(
      executeWorkflow({ runId: record.id, graph: toStored(graph), input: "x", step: memoStep(), decide, store }),
    ).rejects.toBeInstanceOf(InvalidWorkflowError);
    expect(decide).not.toHaveBeenCalled();
  });
});

describe("RunStore", () => {
  it("rejects ids that are not UUIDs (no path traversal)", async () => {
    await expect(store.get("../../etc/passwd")).rejects.toThrow("Invalid run id.");
  });

  it("applies concurrent updates without losing any", async () => {
    const record = await store.create("x", toStored(exampleGraph()));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.update(record.id, (r) => void r.visited.push(`n${i}`))),
    );
    expect((await store.get(record.id))!.visited).toHaveLength(20);
  });

  it("returns null for an unknown run", async () => {
    expect(await store.get(crypto.randomUUID())).toBeNull();
  });
});
