import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { z } from "zod";

// A workflow is a directed acyclic graph:
// - one Start node, the entry point, with a single "next" output;
// - Decision nodes, each asking the model a YES/NO question, with a "yes" and a "no" output;
// - Outcome nodes, where a run ends.

export type StartData = { label: string };
export type DecisionData = { label: string; prompt: string };
export type OutcomeData = { label: string };

export type StartNode = Node<StartData, "start">;
export type DecisionNode = Node<DecisionData, "decision">;
export type OutcomeNode = Node<OutcomeData, "outcome">;
export type FlowNode = StartNode | DecisionNode | OutcomeNode;
export type FlowNodeType = FlowNode["type"];

export type Branch = "next" | "yes" | "no";
export type BranchEdgeData = { branch: Branch };
export type FlowEdge = Edge<BranchEdgeData, "branch">;

export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };

// The output handles each node type has. The handle id is the branch name.
export const OUTPUTS: Record<FlowNodeType, Branch[]> = {
  start: ["next"],
  decision: ["yes", "no"],
  outcome: [],
};

export const START_ID = "start";

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function makeDecisionNode(position: { x: number; y: number }): DecisionNode {
  return {
    id: newId("decision"),
    type: "decision",
    position,
    data: { label: "New decision", prompt: "" },
  };
}

export function makeOutcomeNode(position: { x: number; y: number }): OutcomeNode {
  return { id: newId("outcome"), type: "outcome", position, data: { label: "New outcome" } };
}

export const BRANCH_COLOURS: Record<Branch, string> = { next: "#71717a", yes: "#059669", no: "#e11d48" };

export function makeEdge(source: string, branch: Branch, target: string): FlowEdge {
  return {
    id: `${source}:${branch}->${target}`,
    type: "branch",
    source,
    sourceHandle: branch,
    target,
    data: { branch },
    markerEnd: { type: MarkerType.ArrowClosed, color: BRANCH_COLOURS[branch] },
  };
}

// The example from the brief: "Is this a support request?" YES → Support, NO → Sales.
export function exampleGraph(): Graph {
  const nodes: FlowNode[] = [
    { id: START_ID, type: "start", position: { x: 0, y: 140 }, data: { label: "Start" }, deletable: false },
    {
      id: "decision-support",
      type: "decision",
      position: { x: 240, y: 80 },
      data: { label: "Support request?", prompt: "Is this a support request?" },
    },
    { id: "outcome-support", type: "outcome", position: { x: 620, y: 20 }, data: { label: "Support" } },
    { id: "outcome-sales", type: "outcome", position: { x: 620, y: 240 }, data: { label: "Sales" } },
  ];
  const edges = [
    makeEdge(START_ID, "next", "decision-support"),
    makeEdge("decision-support", "yes", "outcome-support"),
    makeEdge("decision-support", "no", "outcome-sales"),
  ];
  return { nodes, edges };
}

type Point = { x: number; y: number };
type Size = { width: number; height: number };

// Size used for nodes React Flow has not measured yet.
const FALLBACK_SIZE: Record<FlowNodeType, Size> = {
  start: { width: 110, height: 50 },
  decision: { width: 288, height: 190 },
  outcome: { width: 192, height: 50 },
};

// The point nearest `origin` (searching in rings of 40 px) where a box of `size` overlaps no node,
// keeping a small gap around each node.
export function findFreeSpot(origin: Point, size: Size, nodes: FlowNode[]): Point {
  const gap = 24;
  const overlaps = (p: Point) =>
    nodes.some((node) => {
      const box = node.measured?.width ? (node.measured as Size) : FALLBACK_SIZE[node.type];
      return (
        p.x < node.position.x + box.width + gap &&
        p.x + size.width + gap > node.position.x &&
        p.y < node.position.y + box.height + gap &&
        p.y + size.height + gap > node.position.y
      );
    });

  for (let ring = 0; ring <= 25; ring++) {
    const candidates: Point[] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        candidates.push({ x: origin.x + dx * 40, y: origin.y + dy * 40 });
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
    const free = candidates.find((p) => !overlaps(p));
    if (free) return free;
  }
  return origin;
}

// True if `to` can be reached from `from` by following edges.
function reaches(edges: FlowEdge[], from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of edges) if (edge.source === id) stack.push(edge.target);
  }
  return false;
}

export type ConnectionCheck = { ok: true; branch: Branch } | { ok: false; reason: string };

export function checkConnection(
  connection: { source: string; target: string; sourceHandle?: string | null },
  graph: Graph,
): ConnectionCheck {
  const { source, target, sourceHandle } = connection;
  const sourceNode = graph.nodes.find((node) => node.id === source);
  const targetNode = graph.nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) return { ok: false, reason: "Unknown node." };
  if (source === target) return { ok: false, reason: "A node cannot connect to itself." };
  if (targetNode.type === "start") return { ok: false, reason: "Nothing can lead back into Start." };

  const branch = sourceHandle as Branch | null;
  if (!branch || !OUTPUTS[sourceNode.type].includes(branch)) {
    return { ok: false, reason: "That output does not exist on this node." };
  }

  // The output's current edge (if any) gets replaced, so ignore it when looking for cycles.
  const others = graph.edges.filter((edge) => !(edge.source === source && edge.sourceHandle === branch));
  if (reaches(others, target, source)) return { ok: false, reason: "That connection would create a loop." };

  return { ok: true, branch };
}

// Connects an output to a node. Each output holds at most one edge, so this replaces any existing one.
export function connect(graph: Graph, source: string, branch: Branch, target: string): FlowEdge[] {
  const others = graph.edges.filter((edge) => !(edge.source === source && edge.sourceHandle === branch));
  return [...others, makeEdge(source, branch, target)];
}

export type Issue = { nodeId?: string; message: string };

// Problems that would stop a run. The editor shows them; Phase 3 refuses to run until they are fixed.
export function findIssues(graph: Graph): Issue[] {
  const issues: Issue[] = [];
  const starts = graph.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1) issues.push({ message: "The workflow needs exactly one Start node." });

  for (const node of graph.nodes) {
    for (const branch of OUTPUTS[node.type]) {
      if (!graph.edges.some((edge) => edge.source === node.id && edge.sourceHandle === branch)) {
        const name = branch === "next" ? "outgoing" : branch.toUpperCase();
        issues.push({ nodeId: node.id, message: `"${node.data.label}" has no ${name} connection.` });
      }
    }
    if (node.type === "decision" && node.data.prompt.trim() === "") {
      issues.push({ nodeId: node.id, message: `"${node.data.label}" has an empty prompt.` });
    }
  }
  return issues;
}

// ---- Local storage ----

export const STORAGE_KEY = "ai-decision-flow:graph:v1";

const position = z.object({ x: z.number(), y: z.number() });
const label = z.string().max(80);

const StoredNode = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("start"), position, data: z.object({ label }) }),
  z.object({
    id: z.string(),
    type: z.literal("decision"),
    position,
    data: z.object({ label, prompt: z.string().max(2000) }),
  }),
  z.object({ id: z.string(), type: z.literal("outcome"), position, data: z.object({ label }) }),
]);

const StoredEdge = z.object({
  source: z.string(),
  target: z.string(),
  branch: z.enum(["next", "yes", "no"]),
});

export const StoredGraph = z.object({
  version: z.literal(1),
  nodes: z.array(StoredNode).max(200),
  edges: z.array(StoredEdge).max(400),
});
export type StoredGraph = z.infer<typeof StoredGraph>;

export function toStored(graph: Graph): StoredGraph {
  return {
    version: 1,
    nodes: graph.nodes.map(
      ({ id, type, position, data }) => ({ id, type, position, data }) as StoredGraph["nodes"][number],
    ),
    edges: graph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      branch: edge.data?.branch ?? (edge.sourceHandle as Branch),
    })),
  };
}

export type ParseResult = { ok: true; graph: Graph } | { ok: false; reason: string };

// Rebuilds a graph from stored or imported JSON, rejecting anything that does not match the schema
// or breaks the connection rules, with the reason.
export function parseStoredGraph(value: unknown): ParseResult {
  const parsed = StoredGraph.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    return { ok: false, reason: `Not a workflow file (version 1)${where}: ${issue?.message ?? "invalid data"}.` };
  }
  const ids = parsed.data.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "Two nodes share the same id." };
  if (parsed.data.nodes.filter((node) => node.type === "start").length !== 1) {
    return { ok: false, reason: "The workflow must have exactly one Start node." };
  }

  const nodes: FlowNode[] = parsed.data.nodes.map((node) =>
    node.type === "start" ? { ...node, deletable: false } : node,
  );
  let graph: Graph = { nodes, edges: [] };
  for (const edge of parsed.data.edges) {
    const check = checkConnection({ source: edge.source, target: edge.target, sourceHandle: edge.branch }, graph);
    if (!check.ok) return { ok: false, reason: `Connection ${edge.source} → ${edge.target}: ${check.reason}` };
    graph = { nodes, edges: connect(graph, edge.source, edge.branch, edge.target) };
  }
  return { ok: true, graph };
}

// Identifies what a run depends on (nodes, prompts, edges) and ignores layout, so moving nodes
// doesn't count as a different workflow.
export function structureKey(stored: StoredGraph): string {
  const nodes = stored.nodes.map(({ id, type, data }) => ({ id, type, data })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = stored.edges.map(({ source, branch, target }) => `${source}:${branch}->${target}`).sort();
  return JSON.stringify({ nodes, edges });
}

export function fromStored(value: unknown): Graph | null {
  const result = parseStoredGraph(value);
  return result.ok ? result.graph : null;
}
