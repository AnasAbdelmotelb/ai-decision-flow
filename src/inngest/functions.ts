import { inngest } from "@/inngest/client";

// Phase 1 smoke test: proves the app is registered with the Inngest dev server
// and that a step runs. Replaced by the workflow runner in Phase 3.
export const ping = inngest.createFunction(
  { id: "ping", triggers: [{ event: "app/ping" }] },
  async ({ event, step }) => {
    const reply = await step.run("reply", () => ({
      pong: true,
      receivedAt: new Date().toISOString(),
      message: typeof event.data?.message === "string" ? event.data.message : null,
    }));
    return reply;
  },
);

export const functions = [ping];
