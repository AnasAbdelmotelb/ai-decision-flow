"use client";

import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type HandleType,
  type OnConnectEnd,
  type OnConnectStart,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Flag, GitBranch, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { edgeTypes } from "@/components/flow/branch-edge";
import { nodeTypes } from "@/components/flow/nodes";
import { Button } from "@/components/ui/button";
import {
  STORAGE_KEY,
  checkConnection,
  connect,
  exampleGraph,
  findFreeSpot,
  findIssues,
  fromStored,
  makeDecisionNode,
  makeOutcomeNode,
  toStored,
  type FlowEdge,
  type FlowNode,
  type Graph,
} from "@/lib/graph";

// Reads the saved graph. Storage can be unavailable (private mode, blocked site data),
// so any failure falls back to the example graph.
function loadInitialGraph(): { graph: Graph; restored: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const graph = raw ? fromStored(JSON.parse(raw)) : null;
    if (graph) return { graph, restored: true };
  } catch {
    // fall through
  }
  return { graph: exampleGraph(), restored: false };
}

type HandleRef = { nodeId: string; id?: string | null; type: HandleType };

function Editor() {
  const [initial] = useState(loadInitialGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initial.graph.edges);
  const [notice, setNotice] = useState<string | null>(initial.restored ? "Loaded your saved workflow." : null);
  // The JSON last written to localStorage, or null when storage failed.
  const [savedJson, setSavedJson] = useState<string | null>("");
  const { screenToFlowPosition, fitView } = useReactFlow<FlowNode, FlowEdge>();
  const wrapper = useRef<HTMLDivElement>(null);

  const graph = useMemo<Graph>(() => ({ nodes, edges }), [nodes, edges]);
  const issues = useMemo(() => findIssues(graph), [graph]);
  const graphJson = useMemo(() => JSON.stringify(toStored(graph)), [graph]);

  // Save to localStorage shortly after each change (selection and drags in progress don't change the JSON).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, graphJson);
        setSavedJson(graphJson);
      } catch {
        setSavedJson(null);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [graphJson]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => checkConnection(connection, graph).ok,
    [graph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const check = checkConnection(connection, graph);
      if (!check.ok) {
        setNotice(check.reason);
        return;
      }
      setEdges(connect(graph, connection.source, check.branch, connection.target));
      setNotice(null);
    },
    [graph, setEdges],
  );

  // React Flow refuses invalid connections before onConnect runs, so explain the refusal here.
  const explainRefusal = useCallback(
    (from: HandleRef, to: HandleRef) => {
      const [source, target] = from.type === "source" ? [from, to] : [to, from];
      const check = checkConnection({ source: source.nodeId, sourceHandle: source.id, target: target.nodeId }, graph);
      setNotice(check.ok ? "Connect an output dot (right side) to an input dot (left side)." : check.reason);
    },
    [graph],
  );

  // Drag to connect.
  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid === false && state.fromHandle && state.toHandle)
        explainRefusal(state.fromHandle, state.toHandle);
    },
    [explainRefusal],
  );

  // Click one dot, then another, to connect.
  const clickStart = useRef<HandleRef | null>(null);
  const onClickConnectStart: OnConnectStart = useCallback((_event, { nodeId, handleId, handleType }) => {
    clickStart.current = nodeId && handleType ? { nodeId, id: handleId, type: handleType } : null;
  }, []);
  const onClickConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const from = clickStart.current;
      clickStart.current = null;
      const element = (event.target as Element | null)?.closest<HTMLElement>(".react-flow__handle");
      const nodeId = element?.dataset.nodeid;
      if (!from || !element || !nodeId) return;
      const to: HandleRef = {
        nodeId,
        id: element.dataset.handleid ?? null,
        type: element.classList.contains("source") ? "source" : "target",
      };
      const check =
        to.type === from.type
          ? null
          : checkConnection(
              from.type === "source"
                ? { source: from.nodeId, sourceHandle: from.id, target: to.nodeId }
                : { source: to.nodeId, sourceHandle: to.id, target: from.nodeId },
              graph,
            );
      if (!check?.ok) explainRefusal(from, to);
    },
    [explainRefusal, graph],
  );

  // New nodes go to the free spot nearest the middle of the visible canvas.
  const freeSpot = useCallback(
    (size: { width: number; height: number }) => {
      const box = wrapper.current?.getBoundingClientRect();
      const centre = box
        ? screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
        : { x: 0, y: 0 };
      const origin = { x: centre.x - size.width / 2, y: centre.y - size.height / 2 };
      return findFreeSpot(origin, size, nodes);
    },
    [nodes, screenToFlowPosition],
  );

  const addNode = (kind: "decision" | "outcome") => {
    const node =
      kind === "decision"
        ? makeDecisionNode(freeSpot({ width: 288, height: 190 }))
        : makeOutcomeNode(freeSpot({ width: 192, height: 50 }));
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
    setNotice(null);
  };

  const resetToExample = () => {
    if (!window.confirm("Replace the current workflow with the example? This cannot be undone.")) return;
    const example = exampleGraph();
    setNodes(example.nodes);
    setEdges(example.edges);
    setNotice("Workflow reset to the example.");
    window.requestAnimationFrame(() => fitView({ padding: 0.2 }));
  };

  return (
    <div ref={wrapper} className="h-full w-full">
      <ReactFlow<FlowNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onClickConnectStart={onClickConnectStart}
        onClickConnectEnd={onClickConnectEnd}
        isValidConnection={isValidConnection}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={20} />
        {/* On phones, pinch-zoom replaces these and the bottom panel needs the room. */}
        <Controls className="max-md:!hidden" />
        <MiniMap pannable zoomable className="max-md:!hidden" />

        <Panel position="top-left" className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => addNode("decision")}>
            <GitBranch data-icon="inline-start" /> Add decision
          </Button>
          <Button size="sm" variant="outline" onClick={() => addNode("outcome")}>
            <Flag data-icon="inline-start" /> Add outcome
          </Button>
          <Button size="sm" variant="ghost" onClick={resetToExample}>
            <RotateCcw data-icon="inline-start" /> Reset to example
          </Button>
        </Panel>

        <Panel position="bottom-center" className="w-[min(32rem,calc(100vw-2rem))]">
          <div className="rounded-lg border bg-background/95 p-3 text-sm shadow-sm">
            {/* Not announced: it changes on every drag. */}
            <p className="mb-1 text-xs text-muted-foreground">
              {savedJson === null
                ? "Can't save: browser storage is unavailable"
                : savedJson === graphJson
                  ? "Saved in this browser"
                  : "Saving…"}
            </p>
            <div aria-live="polite">
              {notice && <p className="mb-1 font-medium">{notice}</p>}
              {issues.length === 0 ? (
                <p className="text-emerald-700">Ready: every decision has a prompt and both YES and NO paths.</p>
              ) : (
                <>
                  <p className="font-medium text-amber-700">
                    {issues.length} {issues.length === 1 ? "issue" : "issues"} to fix before running:
                  </p>
                  <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-5 text-muted-foreground">
                    {issues.map((issue, index) => (
                      <li key={`${issue.nodeId}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
