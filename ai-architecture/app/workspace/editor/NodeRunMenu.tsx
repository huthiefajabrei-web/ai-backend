"use client";

import { useState, useRef, useEffect } from "react";
import { FastForward, ChevronDown, Loader2, Check, Workflow } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import { useWorkspaceEditor } from "./WorkspaceEditorContext";
import {
  ensureLinkedImageGenerator,
  getDownstreamImageNodes,
  getImageNodesDependingOn,
} from "@/lib/workspace/graphUtils";

type Props = {
  nodeId: string | null;
};

/**
 * Magnific-style Run control for Creation / Text nodes:
 * Run from here (downstream Image Generators) · All workflow
 *
 * If no Image Generator is linked, auto-create & wire one (images are only
 * produced on Image Generator nodes), then run it.
 */
export default function NodeRunMenu({ nodeId }: Props) {
  const { getNodes, getEdges, setNodes, setEdges, fitView } = useReactFlow();
  const { runWorkflow, runNode, waitForRunner } = useWorkspaceEditor();
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

  const resolveImageTargets = async (startId: string): Promise<string[]> => {
    const nodes = getNodes();
    const edges = getEdges();

    const downstream = getDownstreamImageNodes(startId, nodes, edges);
    if (downstream.length) return downstream;

    const depending = getImageNodesDependingOn(startId, nodes, edges);
    if (depending.length) return depending;

    // Magnific: auto-attach Image Generator when missing
    const ensured = ensureLinkedImageGenerator(startId, nodes, edges, uuidv4());
    if (!ensured.created || !ensured.imageNodeId) return [];

    setNodes(ensured.nodes);
    setEdges(ensured.edges);
    window.dispatchEvent(new Event("trigger-workspace-save"));

    requestAnimationFrame(() => {
      try {
        fitView({ nodes: [{ id: ensured.imageNodeId }], padding: 0.35, duration: 400 });
      } catch {
        /* ignore */
      }
    });

    const ready = await waitForRunner(ensured.imageNodeId);
    if (!ready) return [];
    return [ensured.imageNodeId];
  };

  const runFromHere = async () => {
    if (!nodeId) return;
    setRunning(true);
    try {
      const order = await resolveImageTargets(nodeId);
      if (!order.length) {
        alert(
          "Could not create an Image Generator. Add one from the toolbar, connect Text → Image Generator, then Run.\n\nأضف Image Generator واربط Text به ثم شغّل.",
        );
        return;
      }
      for (const id of order) await runNode(id);
    } finally {
      setRunning(false);
    }
  };

  const runAll = async () => {
    setRunning(true);
    try {
      let nodes = getNodes();
      let edges = getEdges();
      const hasImage = nodes.some((n) => n.type === "imageNode");
      if (!hasImage) {
        const seed =
          nodes.find((n) => n.type === "promptNode") ||
          nodes.find((n) => n.type === "creationNode");
        if (seed) {
          const ensured = ensureLinkedImageGenerator(seed.id, nodes, edges, uuidv4());
          if (ensured.created) {
            setNodes(ensured.nodes);
            setEdges(ensured.edges);
            nodes = ensured.nodes;
            edges = ensured.edges;
            window.dispatchEvent(new Event("trigger-workspace-save"));
            await waitForRunner(ensured.imageNodeId);
          }
        }
      }
      await runWorkflow(nodes, edges);
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
        {running ? <Loader2 size={15} className="animate-spin text-amber-500" /> : <FastForward size={15} />}
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
              <Check size={14} className="text-amber-500 shrink-0" />
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
              <Check size={14} className="text-amber-500 shrink-0" />
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
