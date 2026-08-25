"use client";

import { Handle, Position, useReactFlow, useNodeId, useEdges, NodeToolbar } from "@xyflow/react";
import { Type, Image as ImageIcon, Video, X } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  loadCreationImage,
  type WorkspaceReference,
} from "@/lib/workspace/graphUtils";
import { groupStylePrompts, mergeStylePrompts, type StylePrompt } from "@/lib/workspace/perspectives";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "@/lib/workspace/imageModels";
import NodeRunMenu from "../NodeRunMenu";

export default function PromptNode({ data, selected }: { data: any; selected?: boolean }) {
  const { updateNodeData, getNode, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const edges = useEdges();
  const [dbPrompts, setDbPrompts] = useState<StylePrompt[]>([]);

  const [localPrompt, setLocalPrompt] = useState<string>(data.prompt || data.label || "");
  const [perspective, setPerspective] = useState<string>(data.perspective || "Custom Scene");
  const [imageCount, setImageCount] = useState<number>(Number(data.imageCount) || 1);
  const [aspectRatio, setAspectRatio] = useState<string>(data.aspectRatio || "16:9");
  const [modelName, setModelName] = useState<string>(data.modelName || DEFAULT_IMAGE_MODEL);
  const [showStyles, setShowStyles] = useState(false);
  const [linkedCreations, setLinkedCreations] = useState<WorkspaceReference[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (data.perspective) setPerspective(String(data.perspective));
  }, [data.perspective]);
  useEffect(() => {
    if (data.imageCount) setImageCount(Number(data.imageCount) || 1);
  }, [data.imageCount]);
  useEffect(() => {
    if (data.aspectRatio) setAspectRatio(String(data.aspectRatio));
  }, [data.aspectRatio]);
  useEffect(() => {
    if (data.modelName) setModelName(String(data.modelName));
  }, [data.modelName]);

  const persist = (patch: Record<string, unknown>) => {
    if (!nodeId) return;
    updateNodeData(nodeId, patch);
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const refreshLinkedCreations = useCallback(() => {
    if (!nodeId) return;
    const incoming = edges.filter(
      (e) => e.target === nodeId && (e.targetHandle === "image-in" || (e.targetHandle || "").startsWith("image")),
    );
    const refs: WorkspaceReference[] = [];
    let i = 1;
    for (const edge of incoming) {
      const src = getNode(edge.source);
      if (!src) continue;

      if (src.type === "creationNode") {
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
        continue;
      }

      // Generated Image Generator outputs can be re-used as references (Magnific-style)
      if (src.type === "imageNode") {
        const urls = src.data?.imageUrls as string[] | undefined;
        const url = urls?.[0] ? String(urls[0]) : src.data?.imageUrl ? String(src.data.imageUrl) : null;
        if (!url) continue;
        refs.push({
          id: src.id,
          index: i,
          name: `Image ${i}`,
          mention: `@Image${i}`,
          source: "edge",
          sourceNodeId: src.id,
          thumb: url,
          url,
        });
        i += 1;
      }
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

  const allPrompts = mergeStylePrompts(dbPrompts);
  const groupedPrompts = groupStylePrompts(allPrompts);

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

      {selected && (
        <NodeToolbar isVisible position={Position.Top} offset={36} className="!bg-transparent !border-0 !p-0 !shadow-none">
          <div className="flex items-center gap-0.5 bg-[#1c1c1f] border border-white/10 rounded-xl px-1.5 py-1 shadow-xl">
            <NodeRunMenu nodeId={nodeId} />
          </div>
        </NodeToolbar>
      )}

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
        <div className="relative group" title="Connect Creation / generated Image here">
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
                  {ref.creationNumber ? `#${ref.creationNumber}` : ref.name}
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

        <div className="px-3 pb-3 border-t border-white/5 mx-2 pt-2 space-y-3">
          <div>
            <button
              type="button"
              onClick={() => setShowStyles(!showStyles)}
              className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-blue-400 mb-2"
            >
              Style / Perspective {showStyles ? "▲" : "▼"}
            </button>
            {showStyles ? (
              <select
                value={perspective}
                onChange={(e) => {
                  const next = e.target.value;
                  setPerspective(next);
                  persist({ perspective: next });
                }}
                className="w-full bg-[#1c1c1f] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
              >
                {Object.entries(groupedPrompts).map(([type, items]) => (
                  <optgroup key={type} label={type}>
                    {items.map((p) => (
                      <option key={p.title} value={p.title}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <p className="text-[10px] text-zinc-600 truncate">{perspective}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center bg-[#1c1c1f] rounded-lg text-xs font-medium text-gray-300 h-8 border border-white/5">
              <button
                type="button"
                className="px-2 h-full hover:bg-white/5 rounded-l-lg"
                onClick={() => {
                  const val = Math.max(1, imageCount - 1);
                  setImageCount(val);
                  persist({ imageCount: val });
                }}
              >
                -
              </button>
              <span className="px-1.5">×{imageCount}</span>
              <button
                type="button"
                className="px-2 h-full hover:bg-white/5 rounded-r-lg"
                onClick={() => {
                  const val = Math.min(4, imageCount + 1);
                  setImageCount(val);
                  persist({ imageCount: val });
                }}
              >
                +
              </button>
            </div>

            <select
              value={modelName}
              onChange={(e) => {
                const next = e.target.value;
                setModelName(next);
                persist({ modelName: next });
              }}
              className="bg-[#1c1c1f] border border-white/5 rounded-lg px-2 h-8 text-[11px] text-gray-300 focus:outline-none cursor-pointer max-w-[160px]"
              title={modelName}
            >
              {IMAGE_MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={aspectRatio}
              onChange={(e) => {
                const next = e.target.value;
                setAspectRatio(next);
                persist({ aspectRatio: next });
              }}
              className="bg-[#1c1c1f] border border-white/5 rounded-lg px-2 h-8 text-[11px] text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
            </select>
          </div>
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
