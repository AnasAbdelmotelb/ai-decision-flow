import type { Decide, Decision } from "@/lib/decide";
import { findIssues, fromStored, type Branch, type Graph, type StoredGraph } from "@/lib/graph";
import type { RunStore } from "@/lib/runs";

// The durable-step primitive the executor needs. In production it is Inngest's `step`; tests pass a
// plain function runner. A step's result is memoised by its id, so each id must be unique per run.
export type StepRunner = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

export class InvalidWorkflowError extends Error {}

export type ExecuteOptions = {
  runId: string;
  graph: StoredGraph;
  input: string;
  step: StepRunner;
  decide: Decide;
  store: RunStore;
  // The current Inngest attempt (0 = first try), recorded so retries show up in the log.
  attempt?: number;
};

export type ExecuteResult = { outcomeId: string; outcomeLabel: string; path: string[]; answers: string[] };

function outgoing(graph: Graph, nodeId: string, branch: Branch) {
  return graph.edges.find((edge) => edge.source === nodeId && edge.data?.branch === branch);
}

// Walks the workflow from Start: each Decision node is one durable step that asks the model YES or NO,
// and the answer picks the outgoing edge. The run ends at the first Outcome node it reaches.
export async function executeWorkflow(options: ExecuteOptions): Promise<ExecuteResult> {
  const { runId, input, step, decide, store, attempt = 0 } = options;

  const graph = fromStored(options.graph);
  if (!graph) throw new InvalidWorkflowError("The workflow data is not valid.");
  const issues = findIssues(graph);
  if (issues.length > 0) throw new InvalidWorkflowError(issues.map((issue) => issue.message).join(" "));

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const start = graph.nodes.find((node) => node.type === "start")!;
  const first = outgoing(graph, start.id, "next")!;

  await step.run("start", async () => {
    await store.update(runId, (run) => {
      run.status = "running";
      run.currentNodeId = first.target;
      run.visited = [start.id, first.target];
      run.edgeIds = [first.id];
    });
    return null;
  });

  const path = [start.id];
  const answers: string[] = [];
  let nodeId = first.target;

  // The editor refuses loops, so a run visits each node at most once; the bound is a safety net.
  for (let order = 1; order <= graph.nodes.length; order++) {
    const node = nodes.get(nodeId);
    if (!node) throw new InvalidWorkflowError(`Node ${nodeId} does not exist.`);
    path.push(node.id);

    if (node.type === "outcome") {
      await step.run(`outcome:${node.id}`, async () => {
        await store.update(runId, (run) => {
          run.status = "completed";
          run.currentNodeId = null;
          run.outcome = { nodeId: node.id, label: node.data.label };
        });
        return null;
      });
      return { outcomeId: node.id, outcomeLabel: node.data.label, path, answers };
    }
    if (node.type !== "decision") throw new InvalidWorkflowError("A run cannot pass through Start twice.");

    const decision = await step.run(`decide:${node.id}`, async (): Promise<Decision & { edgeId: string; target: string }> => {
      const startedAt = new Date().toISOString();
      await store.update(runId, (run) => {
        run.currentNodeId = node.id;
        run.steps = run.steps.filter((s) => s.nodeId !== node.id); // drop a failed earlier attempt
        run.steps.push({
          order,
          nodeId: node.id,
          label: node.data.label,
          prompt: node.data.prompt,
          status: "running",
          attempt: attempt + 1,
          startedAt,
        });
      });

      let result: Decision;
      try {
        result = await decide(node.data.prompt, input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await store.update(runId, (run) => {
          const entry = run.steps.find((s) => s.nodeId === node.id);
          if (entry) Object.assign(entry, { status: "failed", error: message, finishedAt: new Date().toISOString() });
        });
        throw error;
      }

      const edge = outgoing(graph, node.id, result.answer === "YES" ? "yes" : "no")!;
      await store.update(runId, (run) => {
        const entry = run.steps.find((s) => s.nodeId === node.id);
        if (entry) {
          Object.assign(entry, {
            status: "done",
            answer: result.answer,
            raw: result.raw,
            calls: result.calls,
            model: result.model,
            edgeId: edge.id,
            finishedAt: new Date().toISOString(),
          });
        }
        run.visited.push(edge.target);
        run.edgeIds.push(edge.id);
        run.currentNodeId = edge.target;
      });
      return { ...result, edgeId: edge.id, target: edge.target };
    });

    answers.push(decision.answer);
    nodeId = decision.target;
  }
  throw new InvalidWorkflowError("The run did not reach an outcome.");
}
