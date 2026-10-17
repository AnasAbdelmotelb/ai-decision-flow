import { isRunId, runStore } from "@/lib/runs";

// The editor polls this while a run is in progress.
export async function GET(_request: Request, { params }: RouteContext<"/api/runs/[id]">) {
  const { id } = await params;
  if (!isRunId(id)) return Response.json({ error: "Invalid run id." }, { status: 400 });
  const run = await runStore.get(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
