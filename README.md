# AI Decision Flow

A visual AI workflow editor. Each node asks a language model a YES/NO question; the answer decides which
edge the run follows next. The workflow runs as an [Inngest](https://www.inngest.com/) function, and the
frontend shows it with [React Flow](https://reactflow.dev/).

FlyRank AI Internship, Backend AI Engineering track, Week 7 (BE-09).

> **Status:** Phases 1–2 done (setup and the flow editor). Execution through Inngest comes in Phase 3,
> polish in Phase 4.

## The flow editor

- **Nodes:** one **Start** node (the entry point), **Decision** nodes (a YES/NO question for the model)
  and **Outcome** nodes (where a run ends). Add them from the toolbar; rename them and edit prompts
  directly on the node.
- **Edges:** each Decision has a green **YES** output and a red **NO** output; Start has one output.
  Drag from an output dot to an input dot, or click one dot and then the other.
- **Rules:** each output holds one edge (connecting it again re-points it), nothing can lead back into
  Start, and connections that would create a loop are refused with a message.
- **Ready check:** the panel at the bottom lists what must be fixed before a run, such as a Decision
  without a YES or NO path, or an empty prompt.
- **Saved locally:** the workflow is saved in this browser's `localStorage` after every change and
  restored on reload. Saved data is validated when loaded; anything invalid falls back to the example.
- **Delete:** select a node or edge and press Backspace or Delete. Start cannot be deleted.
- **Example:** "Reset to example" restores the brief's example: "Is this a support request?"
  YES → Support, NO → Sales.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui
- React Flow (`@xyflow/react`) for the canvas
- Inngest for durable, step-by-step execution, with the local Inngest dev server
- OpenAI SDK as an OpenAI-compatible client, pointed at a local [Ollama](https://ollama.com/) model
  by default, so no paid API key is needed
- Vitest for tests

## Run locally

Requirements: Node.js 20.9 or newer, and Ollama with the model pulled (`ollama pull llama3.2:3b`).

```bash
npm install
cp .env.example .env.local   # local settings; .env.local is gitignored
npm run dev                  # app on http://localhost:3000
npm run dev:inngest          # in a second terminal: Inngest dev server on http://localhost:8288
```

The Inngest dev server connects to the app at `http://localhost:3000/api/inngest` and lists its
functions. To check the setup, send a test event from the dev server UI, or:

```bash
curl -X POST http://localhost:8288/e/dev -H 'Content-Type: application/json' -d '{"name":"app/ping","data":{"message":"hello"}}'
```

The `ping` function then appears under **Runs** with one completed step.

### Other commands

```bash
npm test            # unit tests
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build       # production build
```

## Environment variables

See `.env.example`. Never commit real keys; `.env.local` and other `.env*` files are gitignored
(`.env.example` is the only exception and holds no secrets).

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_BASE_URL` | `http://localhost:11434/v1/` | OpenAI-compatible endpoint (Ollama) |
| `OPENAI_API_KEY` | `ollama` | Placeholder accepted by Ollama |
| `LLM_MODEL` | `llama3.2:3b` | Model used for YES/NO decisions |
| `LLM_TIMEOUT_MS` | `20000` | Per-call timeout |
| `LLM_STUB` | `0` | `1` returns canned answers instead of calling a model |
| `INNGEST_DEV` | `1` | Use the local Inngest dev server |

## Project structure

```text
src/
├── app/
│   ├── api/inngest/route.ts   # Inngest serve endpoint
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── flow/                  # React Flow editor, custom nodes and YES/NO edge
│   └── ui/                    # shadcn/ui components
├── inngest/
│   ├── client.ts              # Inngest client
│   └── functions.ts           # Inngest functions (Phase 1: ping)
└── lib/
    ├── env.ts                 # validated server settings
    ├── graph.ts               # graph types, connection rules, ready check, storage format
    └── llm.ts                 # OpenAI SDK client
tests/                         # Vitest tests
```
