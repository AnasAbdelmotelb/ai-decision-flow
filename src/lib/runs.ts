import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Answer } from "@/lib/decide";
import type { StoredGraph } from "@/lib/graph";

// One record per workflow run, written by the Inngest function as it goes and polled by the editor.

export type RunStep = {
  order: number; // 1, 2, 3… in execution order
  nodeId: string;
  label: string;
  prompt: string;
  status: "running" | "done" | "failed";
  attempt: number; // 1 = first try; higher = an Inngest retry
  startedAt: string;
  finishedAt?: string;
  answer?: Answer;
  raw?: string; // the model's reply, as returned
  calls?: number; // model calls in the successful attempt (2 = needed the repair request)
  model?: string;
  edgeId?: string; // the edge taken because of the answer
  error?: string;
};

export type RunStatus = "queued" | "running" | "completed" | "failed";

export type RunRecord = {
  id: string;
  status: RunStatus;
  input: string;
  graph: StoredGraph;
  createdAt: string;
  updatedAt: string;
  currentNodeId: string | null;
  visited: string[]; // node ids in the order the run reached them
  edgeIds: string[]; // edges taken, in order
  steps: RunStep[];
  outcome?: { nodeId: string; label: string };
  error?: string;
};

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRunId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export class RunStore {
  // Updates to one run are applied one at a time, so concurrent writers can't lose each other's changes.
  private queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dir: string) {}

  private file(id: string) {
    if (!isRunId(id)) throw new Error("Invalid run id.");
    return path.join(this.dir, `${id}.json`);
  }

  private async write(record: RunRecord) {
    await mkdir(this.dir, { recursive: true });
    const target = this.file(record.id);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(record, null, 2));
    await rename(temp, target); // atomic: readers never see a half-written file
  }

  async create(input: string, graph: StoredGraph): Promise<RunRecord> {
    const now = new Date().toISOString();
    const record: RunRecord = {
      id: crypto.randomUUID(),
      status: "queued",
      input,
      graph,
      createdAt: now,
      updatedAt: now,
      currentNodeId: null,
      visited: [],
      edgeIds: [],
      steps: [],
    };
    await this.write(record);
    return record;
  }

  async get(id: string): Promise<RunRecord | null> {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as RunRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  update(id: string, change: (record: RunRecord) => void): Promise<RunRecord> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const record = await this.get(id);
        if (!record) throw new Error(`Run ${id} not found.`);
        change(record);
        record.updatedAt = new Date().toISOString();
        await this.write(record);
        return record;
      });
    this.queues.set(id, next);
    const cleanUp = () => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    };
    next.then(cleanUp, cleanUp);
    return next;
  }
}

// One store per server process (kept on globalThis so dev hot reloads don't create a second queue).
const shared = globalThis as typeof globalThis & { __runStore?: RunStore };
export const runStore: RunStore = (shared.__runStore ??= new RunStore(
  process.env.RUNS_DIR ?? path.join(process.cwd(), ".data", "runs"),
));
