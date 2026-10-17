"use client";

import dynamic from "next/dynamic";

// The editor reads the saved workflow from localStorage, so it renders in the browser only.
const FlowEditor = dynamic(() => import("@/components/flow/flow-editor"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading the editor…</p>,
});

export default FlowEditor;
