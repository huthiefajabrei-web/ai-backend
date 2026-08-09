"use client";

import { Handle, Position, useReactFlow, useNodeId, useEdges } from "@xyflow/react";
import { Type, Image as ImageIcon, Video, X } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  loadCreationImage,
  type WorkspaceReference,
} from "@/lib/workspace/graphUtils";

export default function PromptNode({ data, selected }: { data: any; selected?: boolean }) {
  const { updateNodeData, getNode, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const edges = useEdges();
  const [dbPrompts, setDbPrompts] = useState<any[]>([]);

  const [localPrompt, setLocalPrompt] = useState<string>(data.prompt || data.label || "");
  const [perspective, setPerspective] = useState<string>(data.perspective || "Custom Scene");
  const [showStyles, setShowStyles] = useState(false);
  const [linkedCreations, setLinkedCreations] = useState<WorkspaceReference[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshLinkedCreations = useCallback(() => {
    if (!nodeId) return;
    const incoming = edges.filter(
      (e) => e.target === nodeId && (e.targetHandle === "image-in" || (e.targetHandle || "").startsWith("image")),
    );
    const refs: WorkspaceReference[] = [];
    let i = 1;
    for (const edge of incoming) {
      const src = getNode(edge.source);
      if (!src || src.type !== "creationNode") continue;
      const b64 = loadCreationImage(src.id) || (src.data?.previewUrl ? String(src.data.previewUrl) : null);
      if (!b64) continue;
      const creationNumber = Number(src.data?.creationNumber) || i;
      refs.push({
        id: src.id,
        index: i,
        name: `Creation #${creationNumber}`,
        mention: `@Creation #${creationNumber}`,
        source: "creation",
        sourceNodeId: src.id,
        creationNumber,
        thumb: b64,
        b64,
      });
      i += 1;
    }
    setLinkedCreations(refs);
  }, [nodeId, edges, getNode]);

  useEffect(() => {
    refreshLinkedCreations();
  }, [refreshLinkedCreations]);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiUrl}/content/prompts`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.data) setDbPrompts(resData.data);
      })
      .catch((err) => console.error("Failed to load prompts", err));
  }, []);

  const defaultPrompts = [
    { title: "Photorealistic Exterior", type: "Exterior" },
    { title: "Night Shot", type: "Exterior" },
    { title: "Sunset/Golden Hour", type: "Exterior" },
    { title: "Photorealistic Interior", type: "Interior" },
    { title: "Living Room Design", type: "Interior" },
    { title: "Bedroom Design", type: "Interior" },
    { title: "Kitchen & Dining", type: "Interior" },
    { title: "Bathroom Design", type: "Interior" },
    { title: "Floor Plan to 3D", type: "Plan" },
    { title: "Architectural Plan, Elevation & Section", type: "Plan" },
    { title: "Physical Model", type: "Model" },
    { title: "Architectural concept sketch", type: "Sketch" },
  ];

  const allPrompts = [...dbPrompts];
  defaultPrompts.forEach((dp) => {
    if (!allPrompts.find((p) => p.title === dp.title)) allPrompts.push(dp);
  });

  const groupedPrompts = allPrompts.reduce((acc: Record<string, any[]>, p: any) => {
    const t = p.type || "Other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});

  const insertMention = (mention: string) => {
    const el = textareaRef.current;
    const current = localPrompt;
    let next: string;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const needsSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
      next = `${before}${needsSpace ? " " : ""}${mention} ${after}`;
    } else {
      const needsSpace = current.length > 0 && !current.endsWith(" ");
      next = `${current}${needsSpace ? " " : ""}${mention} `;
    }
    setLocalPrompt(next);
    if (nodeId) {
      updateNodeData(nodeId, { prompt: next });
      window.dispatchEvent(new Event("trigger-workspace-save"));
    }
  };

  const unlinkCreation = (creationId: string) => {
    if (!nodeId) return;
    setEdges((eds) =>
      eds.filter((e) => !(e.target === nodeId && e.source === creationId && e.targetHandle === "image-in")),
    );
  };

  return (
    <div
      className={`relative bg-[#121214] rounded-2xl w-[340px] shadow-2xl transition-all border-2 ${
        selected ? "border-blue-500 shadow-blue-500/20" : "border-white/10"
      }`}
    >
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300">
        <div className="bg-[#121214] p-1 rounded-md border border-white/10">
          <Type size={12} className="text-blue-400" />
        </div>
        <span className="font-bold text-xs">Text</span>
      </div>

      {/* Magnific left ports: text / video / image (Assets connect here) */}
      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <div className="relative group" title="Text input">
          <Handle
            type="target"
            position={Position.Left}
            id="text-in"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-gray-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group" title="Video (soon)">
          <Handle
            type="target"
            position={Position.Left}
            id="video-in"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none opacity-40"
          >
            <Video size={14} className="text-gray-400 pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group" title="Connect Creation / Assets here">
          <Handle
            type="target"
            position={Position.Left}
            id="image-in"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <ImageIcon size={14} className="text-blue-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
      </div>

      <div className="absolute -right-12 top-1/2 -translate-y-1/2">
        <div className="relative group" title="Text output → Image Generator">
          <Handle
            type="source"
            position={Position.Right}
            id="text-out"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-blue-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
      </div>

      {/* Linked Creations strip */}
      {linkedCreations.length > 0 && (
        <div className="px-3 pt-3 border-b border-white/5 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Linked assets
            </span>
            <span className="text-[10px] text-zinc-600">Click to insert @mention</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {linkedCreations.map((ref) => (
              <button
                key={ref.id}
                type="button"
                title={`Insert ${ref.mention}`}
                onClick={() => insertMention(ref.mention)}
                className="relative group w-14 h-14 rounded-xl overflow-hidden border border-white/10 hover:border-blue-400/60 bg-[#0a0a0c]"
              >
                {ref.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ref.thumb} alt={ref.name} className="w-full h-full object-cover" />
                ) : null}
                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-bold text-white text-center py-0.5 truncate px-0.5">
                  #{ref.creationNumber}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ref.sourceNodeId) unlinkCreation(ref.sourceNodeId);
                  }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                >
                  <X size={10} />
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {linkedCreations.map((ref) => (
              <button
                key={`chip-${ref.id}`}
                type="button"
                onClick={() => insertMention(ref.mention)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25"
              >
                {ref.mention}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-1">
        <textarea
          ref={textareaRef}
          key={nodeId}
          className="w-full bg-transparent text-sm text-gray-300 p-4 focus:outline-none resize-none h-[140px] custom-scrollbar rounded-2xl"
          placeholder={'Try "Happy dog with sunglasses and floating ring"'}
          value={localPrompt}
          onChange={(e) => {
            setLocalPrompt(e.target.value);
            if (nodeId) {
              updateNodeData(nodeId, { prompt: e.target.value });
              window.dispatchEvent(new Event("trigger-workspace-save"));
            }
          }}
        />

        <div className="px-3 pb-3 border-t border-white/5 mx-2 pt-2">
          <button
            type="button"
            onClick={() => setShowStyles(!showStyles)}
            className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-blue-400 mb-2"
          >
            Style / Perspective {showStyles ? "▲" : "▼"}
          </button>
          {showStyles && (
            <select
              value={perspective}
              onChange={(e) => {
                setPerspective(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { perspective: e.target.value });
                  window.dispatchEvent(new Event("trigger-workspace-save"));
                }
              }}
              className="w-full bg-[#1c1c1f] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
            >
              {Object.entries(groupedPrompts).map(([type, items]) => (
                <optgroup key={type} label={type}>
                  {(items as { title: string }[]).map((p) => (
                    <option key={p.title} value={p.title}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {!showStyles && <p className="text-[10px] text-zinc-600 truncate">{perspective}</p>}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `,
        }}
      />
    </div>
  );
}
