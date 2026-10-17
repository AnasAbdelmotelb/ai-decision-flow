import { NonRetriableError } from "inngest";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { createDecide, PermanentLlmError, type Decide } from "@/lib/decide";
import { readServerEnv } from "@/lib/env";
import { executeWorkflow, InvalidWorkflowError, type StepRunner } from "@/lib/execute";
import { StoredGraph } from "@/lib/graph";
import { createLlmClient } from "@/lib/llm";
import { runStore } from "@/lib/runs";

export const RUN_REQUESTED = "flow/run.requested";

const ReusedAnswer = z.object({
  answer: z.enum(["YES", "NO"]),
  raw: z.string(),
  calls: z.number().int().positive(),
  model: z.string(),
});

export const RunRequestedData = z.object({
  runId: z.uuid(),
  input: z.string().min(1).max(4000),
  graph: StoredGraph,
  // Set when retrying a failed run: answers that are reused instead of asking the model again.
  reuse: z.record(z.string(), ReusedAnswer).optional(),
});
export type RunRequestedData = z.infer<typeof RunRequestedData>;

// Errors that a retry cannot fix stop the run straight away instead of using up Inngest's retries.
function withPermanentErrors(decide: Decide): Decide {
  return async (question, input) => {
    try {
      return await decide(question, input);
    } catch (error) {
      if (error instanceof PermanentLlmError) throw new NonRetriableError(error.message, { cause: error });
      throw error;
    }
  };
}

export const runWorkflow = inngest.createFunction(
  {
    id: "run-workflow",
    name: "Run AI decision workflow",
    triggers: [{ event: RUN_REQUESTED }],
    // Each step is retried up to 2 more times (timeouts, server errors, answers other than YES/NO).
    retries: 2,
    // A run id is executed at most once, even if its event is sent twice.
    idempotency: "event.data.runId",
    // At most two workflows run at once, so a local model isn't flooded; the rest wait in the queue.
    concurrency: { limit: 2 },
    onFailure: async ({ event, error }) => {
      const parsed = RunRequestedData.safeParse(event.data.event.data);
      if (!parsed.success) return;
      await runStore.update(parsed.data.runId, (run) => {
        run.status = "failed";
        run.error = error.message;
        run.currentNodeId = null;
      });
    },
  },
  async ({ event, step, attempt }) => {
    const parsed = RunRequestedData.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError("Invalid run request.");
    const { runId, input, graph, reuse } = parsed.data;

    // Inngest stores each step's result as JSON. The executor's step results are plain JSON values,
    // so the round trip returns the same shape.
    const runner: StepRunner = {
      run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as unknown as Promise<T>,
    };
    const env = readServerEnv();
    try {
      return await executeWorkflow({
        runId,
        graph,
        input,
        step: runner,
        attempt,
        reuse,
        store: runStore,
        decide: withPermanentErrors(createDecide(env, createLlmClient(env))),
      });
    } catch (error) {
      if (error instanceof InvalidWorkflowError) throw new NonRetriableError(error.message, { cause: error });
      throw error;
    }
  },
);

export const functions = [runWorkflow];
