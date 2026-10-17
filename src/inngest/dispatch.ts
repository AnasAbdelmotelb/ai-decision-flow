import { inngest } from "@/inngest/client";
import { RUN_REQUESTED, type RunRequestedData } from "@/inngest/functions";
import { runStore, type RunRecord } from "@/lib/runs";

// Sends a recorded run to Inngest. Also used to retry a failed run.
export async function dispatch(run: RunRecord, reuse?: RunRequestedData["reuse"]) {
  const data: RunRequestedData = { runId: run.id, input: run.input, graph: run.graph, ...(reuse ? { reuse } : {}) };
  try {
    await inngest.send({ name: RUN_REQUESTED, data });
  } catch {
    await runStore.update(run.id, (record) => {
      record.status = "failed";
      record.error = "Could not reach Inngest. Is the dev server running (npm run dev:inngest)?";
    });
    return Response.json(
      { error: "Could not reach Inngest. Is the dev server running?", runId: run.id },
      { status: 503 },
    );
  }
  return Response.json({ runId: run.id }, { status: 202 });
}
