import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">Phase 1 · Setup</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">AI Decision Flow</h1>
        <p className="text-muted-foreground">
          Each node asks the model a YES/NO question; the answer picks the next edge. Inngest runs the
          workflow and React Flow shows it.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Project set up</CardTitle>
          <CardDescription>The flow editor arrives in Phase 2.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Next.js App Router with TypeScript, Tailwind and shadcn/ui</li>
            <li>React Flow (<code>@xyflow/react</code>) installed</li>
            <li>Inngest functions served at <code>/api/inngest</code></li>
            <li>OpenAI SDK pointed at a local Ollama model</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
