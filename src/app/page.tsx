import FlowEditor from "@/components/flow/flow-editor-client";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">AI Decision Flow</h1>
        <p className="text-sm text-muted-foreground">
          Each decision asks the model a YES/NO question; the answer picks the next path. Drag from a
          node&apos;s dot to connect it.
        </p>
      </header>
      <section className="min-h-0 flex-1" aria-label="Workflow editor">
        <FlowEditor />
      </section>
    </main>
  );
}
