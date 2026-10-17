import { dispatch } from "@/inngest/dispatch";
import { isRunId, reusableAnswers, runStore } from "@/lib/runs";

// Retries a failed run from the step that failed: a new run with the same input and workflow, which
// reuses the answers given before the failure and asks the model again only from the failed node on.
export async function POST(_request: Request, { params }: RouteContext<"/api/runs/[id]/retry">) {
  const { id } = await params;
  if (!isRunId(id)) return Response.json({ error: "Invalid run id." }, { status: 400 });
  const failed = await runStore.get(id);
  if (!failed) return Response.json({ error: "Run not found." }, { status: 404 });
  if (failed.status !== "failed") {
    return Response.json({ error: "Only a failed run can be retried." }, { status: 409 });
  }

  const run = await runStore.create(failed.input, failed.graph, failed.id);
  return dispatch(run, reusableAnswers(failed));
}
