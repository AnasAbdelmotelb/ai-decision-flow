"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Flag, GitBranch, Play } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DecisionNode, FlowNode, OutcomeNode, StartNode } from "@/lib/graph";

const shell = "rounded-xl border bg-card text-card-foreground shadow-sm";
const handleBase = "!size-3 !border-2 !border-background";

export function StartNodeView({ selected }: NodeProps<StartNode>) {
  return (
    <div className={cn(shell, "flex items-center gap-2 px-4 py-3", selected && "ring-2 ring-ring")}>
      <Play className="size-4 text-emerald-600" aria-hidden />
      <span className="text-sm font-semibold">Start</span>
      <Handle type="source" position={Position.Right} id="next" className={cn(handleBase, "!bg-foreground")} />
    </div>
  );
}

export function DecisionNodeView({ id, data, selected }: NodeProps<DecisionNode>) {
  const { updateNodeData } = useReactFlow<FlowNode>();
  return (
    <div className={cn(shell, "w-72", selected && "ring-2 ring-ring")}>
      <Handle type="target" position={Position.Left} className={cn(handleBase, "!bg-foreground")} />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <GitBranch className="size-4 shrink-0 text-sky-600" aria-hidden />
        <input
          aria-label="Decision name"
          className="nodrag min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          value={data.label}
          maxLength={80}
          onChange={(event) => updateNodeData(id, { label: event.target.value })}
        />
      </div>
      <div className="p-3">
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`prompt-${id}`}>
          YES/NO question for the model
        </label>
        <Textarea
          id={`prompt-${id}`}
          className="nodrag nowheel min-h-16 resize-none text-sm"
          placeholder="e.g. Is this a support request?"
          value={data.prompt}
          maxLength={2000}
          onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
        />
      </div>
      <div className="flex flex-col items-end gap-3 pb-3 pr-3 text-xs font-semibold">
        <span className="text-emerald-700">YES</span>
        <span className="text-rose-700">NO</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{ top: "auto", bottom: 38 }}
        className={cn(handleBase, "!bg-emerald-600")}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        style={{ top: "auto", bottom: 10 }}
        className={cn(handleBase, "!bg-rose-600")}
      />
    </div>
  );
}

export function OutcomeNodeView({ id, data, selected }: NodeProps<OutcomeNode>) {
  const { updateNodeData } = useReactFlow<FlowNode>();
  return (
    <div className={cn(shell, "flex w-48 items-center gap-2 px-3 py-3", selected && "ring-2 ring-ring")}>
      <Handle type="target" position={Position.Left} className={cn(handleBase, "!bg-foreground")} />
      <Flag className="size-4 shrink-0 text-amber-600" aria-hidden />
      <input
        aria-label="Outcome name"
        className="nodrag min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        value={data.label}
        maxLength={80}
        onChange={(event) => updateNodeData(id, { label: event.target.value })}
      />
    </div>
  );
}

export const nodeTypes = {
  start: StartNodeView,
  decision: DecisionNodeView,
  outcome: OutcomeNodeView,
};
