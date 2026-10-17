import { describe, expect, it } from "vitest";
import {
  START_ID,
  checkConnection,
  connect,
  exampleGraph,
  findFreeSpot,
  findIssues,
  fromStored,
  makeDecisionNode,
  makeOutcomeNode,
  toStored,
  type Graph,
} from "@/lib/graph";

function withExtraNodes(): Graph {
  const graph = exampleGraph();
  const decision = { ...makeDecisionNode({ x: 0, y: 0 }), id: "d2" };
  const outcome = { ...makeOutcomeNode({ x: 0, y: 0 }), id: "o3" };
  return { nodes: [...graph.nodes, decision, outcome], edges: graph.edges };
}

describe("exampleGraph", () => {
  it("is the brief's support/sales example and has no issues", () => {
    const graph = exampleGraph();
    expect(findIssues(graph)).toEqual([]);
    const branches = graph.edges.map((edge) => `${edge.source}:${edge.data?.branch}->${edge.target}`);
    expect(branches).toEqual([
      "start:next->decision-support",
      "decision-support:yes->outcome-support",
      "decision-support:no->outcome-sales",
    ]);
  });
});

describe("checkConnection", () => {
  const graph = withExtraNodes();

  it("accepts YES and NO outputs from a decision", () => {
    expect(checkConnection({ source: "d2", sourceHandle: "yes", target: "o3" }, graph)).toEqual({ ok: true, branch: "yes" });
    expect(checkConnection({ source: "d2", sourceHandle: "no", target: "o3" }, graph)).toEqual({ ok: true, branch: "no" });
  });

  it("rejects self-loops, edges into Start, unknown handles and outputs from outcomes", () => {
    expect(checkConnection({ source: "d2", sourceHandle: "yes", target: "d2" }, graph).ok).toBe(false);
    expect(checkConnection({ source: "d2", sourceHandle: "yes", target: START_ID }, graph).ok).toBe(false);
    expect(checkConnection({ source: "d2", sourceHandle: "maybe", target: "o3" }, graph).ok).toBe(false);
    expect(checkConnection({ source: "o3", sourceHandle: "yes", target: "d2" }, graph).ok).toBe(false);
    expect(checkConnection({ source: START_ID, sourceHandle: "yes", target: "d2" }, graph).ok).toBe(false);
  });

  it("rejects connections that would create a loop", () => {
    const linked = { ...graph, edges: connect(graph, "decision-support", "yes", "d2") };
    const check = checkConnection({ source: "d2", sourceHandle: "no", target: "decision-support" }, linked);
    expect(check).toEqual({ ok: false, reason: "That connection would create a loop." });
  });

  it("allows re-pointing an output even if its old edge was part of the path", () => {
    // decision-support YES -> d2; re-pointing that same YES output to o3 is fine.
    const linked = { ...graph, edges: connect(graph, "decision-support", "yes", "d2") };
    expect(checkConnection({ source: "decision-support", sourceHandle: "yes", target: "o3" }, linked).ok).toBe(true);
  });
});

describe("connect", () => {
  it("keeps one edge per output by replacing the old one", () => {
    const graph = withExtraNodes();
    const edges = connect(graph, "decision-support", "yes", "d2");
    const yesEdges = edges.filter((edge) => edge.source === "decision-support" && edge.sourceHandle === "yes");
    expect(yesEdges).toHaveLength(1);
    expect(yesEdges[0].target).toBe("d2");
    expect(edges).toHaveLength(3);
  });
});

describe("findIssues", () => {
  it("reports missing YES/NO connections and empty prompts", () => {
    const messages = findIssues(withExtraNodes()).map((issue) => issue.message);
    expect(messages).toEqual([
      '"New decision" has no YES connection.',
      '"New decision" has no NO connection.',
      '"New decision" has an empty prompt.',
    ]);
  });
});

describe("storage round trip", () => {
  it("restores the same graph", () => {
    const graph = exampleGraph();
    const restored = fromStored(JSON.parse(JSON.stringify(toStored(graph))));
    expect(restored).not.toBeNull();
    expect(toStored(restored!)).toEqual(toStored(graph));
    expect(restored!.nodes.find((node) => node.type === "start")?.deletable).toBe(false);
  });

  it("rejects bad data instead of loading it", () => {
    const stored = toStored(exampleGraph());
    expect(fromStored(null)).toBeNull();
    expect(fromStored({ ...stored, version: 2 })).toBeNull();
    expect(fromStored({ ...stored, nodes: [...stored.nodes, stored.nodes[1]] })).toBeNull(); // duplicate id
    expect(fromStored({ ...stored, edges: [...stored.edges, { source: "outcome-sales", target: "decision-support", branch: "yes" }] })).toBeNull();
    expect(
      fromStored({ ...stored, edges: [...stored.edges, { source: "decision-support", target: START_ID, branch: "no" }] }),
    ).toBeNull();
  });
});

describe("findFreeSpot", () => {
  const size = { width: 100, height: 50 };

  it("keeps the requested spot when it is empty", () => {
    expect(findFreeSpot({ x: 1000, y: 1000 }, size, exampleGraph().nodes)).toEqual({ x: 1000, y: 1000 });
  });

  it("moves off an occupied spot to one that overlaps nothing", () => {
    const nodes = exampleGraph().nodes;
    const spot = findFreeSpot({ x: 240, y: 80 }, size, nodes); // on top of the decision node
    expect(spot).not.toEqual({ x: 240, y: 80 });
    expect(findFreeSpot(spot, size, nodes)).toEqual(spot);
  });
});
