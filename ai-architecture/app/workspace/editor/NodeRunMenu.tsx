"use client";

import { useState, useRef, useEffect } from "react";
import { FastForward, ChevronDown, Loader2, Check, Workflow } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useWorkspaceEditor } from "./WorkspaceEditorContext";
import { getDownstreamImageNodes, getImageNodeExecutionOrder } from "@/lib/workspace/graphUtils";

type Props = {
  nodeId: string | null;
};

/**
 * Magnific-style Run control for Creation / Text nodes:
 * Run from here (downstream Image Generators) · All workflow
 */
export default function NodeRunMenu({ nodeId }: Props) {
  const { getNodes, getEdges } = useReactFlow();
  const { runWorkflow, runNode } = useWorkspaceEditor();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"from-here" | "all">("from-here");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const runFromHere = async () => {
    if (!nodeId) return;
    const nodes = getNodes();
    const edges = getEdges();
    const order = getDownstreamImageNodes(nodeId, nodes, edges);

    if (!order.length) {
      // Fallback: any Image Generator that eventually depends on this node (incoming path)
      const imageIds = nodes.filter((n) => n.type === "imageNode").map((n) => n.id);
      const affected: string[] = [];
      for (const imgId of imageIds) {
        const seen = new Set<string>();
        const queue = [imgId];
        let hits = false;
        while (queue.length) {
          const cur = queue.shift()!;
          if (seen.has(cur)) continue;
          seen.add(cur);
          if (cur === nodeId) {
            hits = true;
            break;
          }
          for (const e of edges.filter((ed) => ed.target === cur)) {
            queue.push(e.source);
          }
        }
        if (hits) affected.push(imgId);
      }
      const ordered = getImageNodeExecutionOrder(
        nodes.filter((n) => affected.includes(n.id)),
        edges,
      );
      if (!ordered.length) {
        alert(
          "Connect this asset to an Image Generator (directly or via Text), then press Run.\n\nاربط هذه الصورة بـ Image Generator ثم شغّل.",
        );
        return;
      }
      setRunning(true);
      try {
        for (const id of ordered) await runNode(id);
      } finally {
        setRunning(false);
      }
      return;
    }

    setRunning(true);
    try {
      for (const id of order) await runNode(id);
    } finally {
      setRunning(false);
    }
  };

  const runAll = async () => {
    setRunning(true);
    try {
      await runWorkflow(getNodes(), getEdges());
    } finally {
      setRunning(false);
    }
  };

  const handlePrimary = async () => {
    setOpen(false);
    if (mode === "all") await runAll();
    else await runFromHere();
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        disabled={running}
        onClick={() => void handlePrimary()}
        className="p-1.5 rounded-lg text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        title={mode === "all" ? "All workflow" : "Run from here"}
      >
        {running ? <Loader2 size={15} className="animate-spin text-purple-400" /> : <FastForward size={15} />}
      </button>
      <button
        type="button"
        disabled={running}
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-50 -ml-0.5"
        title="Run options"
      >
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="absolute top-9 left-0 z-50 w-48 bg-[#1c1c1f] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1">
          <button
            type="button"
            onClick={() => {
              setMode("from-here");
              setOpen(false);
              void runFromHere();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
          >
            {mode === "from-here" ? (
              <Check size={14} className="text-purple-400 shrink-0" />
            ) : (
              <FastForward size={14} className="text-zinc-500 shrink-0" />
            )}
            Run from here
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("all");
              setOpen(false);
              void runAll();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
          >
            {mode === "all" ? (
              <Check size={14} className="text-purple-400 shrink-0" />
            ) : (
              <Workflow size={14} className="text-zinc-500 shrink-0" />
            )}
            All workflow
          </button>
        </div>
      )}
    </div>
  );
}
