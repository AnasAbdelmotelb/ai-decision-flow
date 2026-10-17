"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { BRANCH_COLOURS, type FlowEdge } from "@/lib/graph";

const styles = {
  yes: { stroke: BRANCH_COLOURS.yes, label: "YES", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  no: { stroke: BRANCH_COLOURS.no, label: "NO", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  next: { stroke: BRANCH_COLOURS.next, label: null, chip: "" },
} as const;

// An edge coloured by its branch: green YES, red NO, grey for Start's single output.
export function BranchEdge(props: EdgeProps<FlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected } = props;
  const style = styles[data?.branch ?? "next"];
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: style.stroke, strokeWidth: selected ? 3 : 2 }} />
      {style.label && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan pointer-events-none absolute rounded-full border px-1.5 text-[10px] font-semibold ${style.chip}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {style.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { branch: BranchEdge };
