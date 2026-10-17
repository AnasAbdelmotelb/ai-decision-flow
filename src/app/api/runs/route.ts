import { z } from "zod";
import { dispatch } from "@/inngest/dispatch";
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
  return dispatch(run);
}

// Past runs for the History tab, newest first.
export async function GET() {
  return Response.json({ runs: await runStore.list() }, { headers: { "Cache-Control": "no-store" } });
}
