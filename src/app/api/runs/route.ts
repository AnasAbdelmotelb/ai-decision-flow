import { z } from "zod";
import { inngest } from "@/inngest/client";
import { RUN_REQUESTED } from "@/inngest/functions";
import { findIssues, fromStored, StoredGraph } from "@/lib/graph";
import { runStore } from "@/lib/runs";

const RunRequest = z.object({
  input: z.string().trim().min(1, "Enter some input for the workflow.").max(4000),
  graph: StoredGraph,
});

// Starts a run: checks the workflow, records the run, then hands it to Inngest.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RunRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const graph = fromStored(parsed.data.graph);
  if (!graph) return Response.json({ error: "The workflow data is not valid." }, { status: 400 });
  const issues = findIssues(graph);
  if (issues.length > 0) {
    return Response.json({ error: "Fix the workflow before running it.", issues }, { status: 422 });
  }

  const run = await runStore.create(parsed.data.input, parsed.data.graph);
  try {
    await inngest.send({ name: RUN_REQUESTED, data: { runId: run.id, input: run.input, graph: run.graph } });
  } catch {
    await runStore.update(run.id, (record) => {
      record.status = "failed";
      record.error = "Could not reach Inngest. Is the dev server running (npm run dev:inngest)?";
    });
    return Response.json({ error: "Could not reach Inngest. Is the dev server running?", runId: run.id }, { status: 503 });
  }
  return Response.json({ runId: run.id }, { status: 202 });
}
