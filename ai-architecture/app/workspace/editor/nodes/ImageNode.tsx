"use client";

import { Handle, Position, useReactFlow, useNodeId, useEdges } from "@xyflow/react";
import {
  Sparkles,
  Image as ImageIcon,
  Download,
  X,
  Settings2,
  Loader2,
  Play,
  Type,
  RotateCcw,
  ChevronDown,
  GitBranch,
  Workflow,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import { cancelJobs } from "@/lib/mysql/client";
import {
  compressImageFile,
  collectDroppedImageFiles,
  isExternalOsFileDrop,
  loadLocalRefs,
  MAX_REFERENCE_IMAGES,
  pickPerspective,
  resolveImageNodeInputs,
  saveLocalRefs,
  type WorkspaceReference,
} from "@/lib/workspace/graphUtils";
import { groupStylePrompts, mergeStylePrompts, type StylePrompt } from "@/lib/workspace/perspectives";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "@/lib/workspace/imageModels";
import { runImageNodeGeneration } from "@/lib/workspace/generation";
import { useWorkspaceEditor } from "../WorkspaceEditorContext";

export default function ImageNode({ data, selected }: { data: any; selected?: boolean }) {
  const { getEdges, getNode, getNodes, updateNodeData, setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const edges = useEdges();
  const { registerRunner, runDownstream, runWorkflow } = useWorkspaceEditor();

  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState(data.modelName || DEFAULT_IMAGE_MODEL);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "16:9");
  const [imageCount, setImageCount] = useState(data.imageCount || 1);
  const [perspective, setPerspective] = useState<string>(data.perspective || "Custom Scene");
  const [showStyles, setShowStyles] = useState(false);
  const [dbPrompts, setDbPrompts] = useState<StylePrompt[]>([]);
  const activeJobIdsRef = useRef<string[]>([]);
  const [showRunMenu, setShowRunMenu] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const [localRefsTick, setLocalRefsTick] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    if (Array.isArray(data.activeJobIds) && data.activeJobIds.length > 0) {
      activeJobIdsRef.current = data.activeJobIds;
    }
  }, [data.activeJobIds]);

  const isCancellingRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [references, setReferences] = useState<WorkspaceReference[]>([]);
  const [linkedPrompt, setLinkedPrompt] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiUrl}/content/prompts`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.data) setDbPrompts(resData.data);
      })
      .catch(() => {
        /* defaults still work */
      });
  }, []);

  useEffect(() => {
    if (data.perspective) setPerspective(String(data.perspective));
  }, [data.perspective]);

  const styleGroups = useMemo(
    () => groupStylePrompts(mergeStylePrompts(dbPrompts)),
    [dbPrompts],
  );

  const refreshInputs = useCallback(() => {
    if (!nodeId) return;
    const resolved = resolveImageNodeInputs(nodeId, getNode, getEdges);
    setReferences(resolved.references);
    setLinkedPrompt(resolved.promptText);
  }, [nodeId, getNode, getEdges]);

  useEffect(() => {
    refreshInputs();
  }, [refreshInputs, data.imageUrls, edges, localRefsTick]);

  const history: string[] = useMemo(() => {
    if (Array.isArray(data.imageUrls) && data.imageUrls.length) return data.imageUrls.map(String);
    if (data.imageUrl) return [String(data.imageUrl)];
    return [];
  }, [data.imageUrls, data.imageUrl]);

  useEffect(() => {
    setHistoryIndex(0);
  }, [history[0]]);

  const displayUrl = history[historyIndex] || history[0];

  const handleDownload = async (url: string) => {
    try {
      if (url.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `harch-${Date.now()}.jpg`;
        a.click();
        return;
      }
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `harch-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const addLocalRefFiles = async (files: File[]) => {
    if (!nodeId || !files.length) return;
    const existing = loadLocalRefs(nodeId);
    const allowed = Math.max(0, MAX_REFERENCE_IMAGES - references.length);
    const toAdd = files.slice(0, allowed);
    if (!toAdd.length) return;
    const next = [...existing];
    for (const file of toAdd) {
      try {
        const b64 = await compressImageFile(file);
        next.push({ id: uuidv4(), b64 });
      } catch (err) {
        console.error(err);
      }
    }
    saveLocalRefs(nodeId, next);
    updateNodeData(nodeId, { localRefCount: next.length });
    setLocalRefsTick((t) => t + 1);
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const handleAddLocalRefs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addLocalRefFiles(Array.from(e.target.files || []));
    if (refInputRef.current) refInputRef.current.value = "";
  };

  const removeReference = (ref: WorkspaceReference) => {
    if (!nodeId) return;
    if (ref.source === "upload") {
      const next = loadLocalRefs(nodeId).filter((r) => r.id !== ref.id);
      saveLocalRefs(nodeId, next);
      updateNodeData(nodeId, { localRefCount: next.length });
      setLocalRefsTick((t) => t + 1);
    } else if (ref.source === "edge" && ref.sourceNodeId) {
      setEdges((eds) =>
        eds.filter(
          (e) =>
            !(
              e.target === nodeId &&
              e.source === ref.sourceNodeId &&
              (e.targetHandle === "image-in" || (e.targetHandle || "").startsWith("image"))
            ),
        ),
      );
    }
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const insertMention = (ref: WorkspaceReference) => {
    const mention = ref.mention;
    const current = String(data.promptOverride || "");
    const needsSpace = current.length > 0 && !current.endsWith(" ");
    const next = `${current}${needsSpace ? " " : ""}${mention} `;
    if (nodeId) {
      updateNodeData(nodeId, { promptOverride: next });
      window.dispatchEvent(new Event("trigger-workspace-save"));
    }
    promptInputRef.current?.focus();
  };

  const handleGenerate = useCallback(async () => {
    if (!nodeId) return;
    setError(null);
    isCancellingRef.current = false;

    const resolved = resolveImageNodeInputs(nodeId, getNode, getEdges);
    const effectivePerspective = pickPerspective(perspective, resolved.perspective);
    const hasStyle = Boolean(effectivePerspective && effectivePerspective !== "Custom Scene");
    if (
      !resolved.textSourceIds.length &&
      !resolved.references.length &&
      !data.promptOverride &&
      !hasStyle
    ) {
      setError("Add a prompt, Style/Perspective, and/or reference images");
      return;
    }

    try {
      await runImageNodeGeneration(
        nodeId,
        {
          modelName: resolved.modelName || modelName,
          aspectRatio: resolved.aspectRatio || aspectRatio,
          imageCount: resolved.imageCount || imageCount,
          promptOverride: data.promptOverride,
          perspective: effectivePerspective,
        },
        {
          getNode,
          getEdges,
          updateNodeData,
          setNodes,
          setEdges,
          isCancelled: () => isCancellingRef.current,
          onJobIds: (ids) => {
            activeJobIdsRef.current = ids;
          },
        },
      );
      refreshInputs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      if (msg !== "Cancelled by user") setError(msg);
      else setError("Cancelled");
      updateNodeData(nodeId, { isLoading: false });
      window.dispatchEvent(new Event("trigger-workspace-save"));
    }
  }, [
    nodeId,
    getNode,
    getEdges,
    modelName,
    aspectRatio,
    imageCount,
    perspective,
    data.promptOverride,
    updateNodeData,
    setNodes,
    setEdges,
    refreshInputs,
  ]);

  useEffect(() => {
    if (!nodeId) return;
    return registerRunner(nodeId, handleGenerate);
  }, [nodeId, registerRunner, handleGenerate]);

  const handleCancel = async () => {
    if (!nodeId || !data.isLoading) return;
    isCancellingRef.current = true;
    updateNodeData(nodeId, { isLoading: false });
    setError("Cancelled");
    try {
      await cancelJobs(activeJobIdsRef.current);
    } catch (e) {
      console.error(e);
    } finally {
      activeJobIdsRef.current = [];
      updateNodeData(nodeId, { activeJobIds: [] });
    }
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const handleRunMode = async (mode: "node" | "workflow" | "downstream") => {
    setShowRunMenu(false);
    if (!nodeId) return;
    if (mode === "node") {
      await handleGenerate();
      return;
    }
    const nodes = getNodes();
    const allEdges = getEdges();
    if (mode === "workflow") {
      await runWorkflow(nodes, allEdges);
      return;
    }
    await runDownstream(nodeId, nodes, allEdges);
  };

  return (
    <div
      className={`relative bg-[#121214] rounded-2xl w-[400px] shadow-2xl transition-all border-2 ${
        selected ? "border-amber-600 shadow-amber-600/20" : "border-white/10"
      }`}
    >
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300">
        <div className="bg-[#121214] p-1 rounded-md border border-white/10">
          <ImageIcon size={12} className="text-amber-500" />
        </div>
        <span className="font-bold text-xs">Image Generator</span>
      </div>

      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <div className="relative group" title="Text prompt input">
          <Handle
            type="target"
            position={Position.Left}
            id="text-in"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-blue-400 pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group" title="Reference images (multiple)">
          <Handle
            type="target"
            position={Position.Left}
            id="image-in"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-amber-600/50 !rounded-full flex items-center justify-center hover:!bg-amber-600/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <ImageIcon size={14} className="text-amber-500 pointer-events-none" />
          </Handle>
        </div>
      </div>

      <div className="absolute -right-12 top-6" title="Generated image output">
        <Handle
          type="source"
          position={Position.Right}
          id="image-out"
          className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-amber-600/50 !rounded-full flex items-center justify-center hover:!bg-amber-600/20 transition-colors cursor-crosshair !static !transform-none"
        >
          <ImageIcon size={14} className="text-amber-500 pointer-events-none" />
        </Handle>
      </div>

      {/* References strip — Magnific style */}
      <div
        className="px-3 pt-3 nodrag nopan"
        onDragOver={(e) => {
          if (!isExternalOsFileDrop(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (!isExternalOsFileDrop(e.dataTransfer)) return;
          const files = collectDroppedImageFiles(e.dataTransfer);
          if (!files.length) return;
          e.preventDefault();
          e.stopPropagation();
          void addLocalRefFiles(files);
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            References {references.length > 0 ? `(${references.length})` : ""}
          </span>
          <span className="text-[10px] text-zinc-600">Click to insert @ImageN</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {references.map((ref) => (
            <button
              key={ref.id}
              type="button"
              title={`Insert ${ref.mention} into prompt`}
              onClick={() => insertMention(ref)}
              className="relative group w-14 h-14 rounded-xl overflow-hidden border border-white/10 hover:border-amber-500/60 bg-[#0a0a0c] shrink-0"
            >
              {ref.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ref.thumb} alt={ref.name} draggable={false} className="w-full h-full object-cover pointer-events-none select-none [-webkit-user-drag:none]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <ImageIcon size={16} />
                </div>
              )}
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-bold text-white text-center py-0.5 truncate px-0.5">
                {ref.creationNumber ? `#${ref.creationNumber}` : ref.index}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  removeReference(ref);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    removeReference(ref);
                  }
                }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <X size={10} />
              </span>
            </button>
          ))}

          {references.length < MAX_REFERENCE_IMAGES && (
            <button
              type="button"
              onClick={() => refInputRef.current?.click()}
              className="w-14 h-14 rounded-xl border border-dashed border-white/15 hover:border-amber-500/50 flex flex-col items-center justify-center text-zinc-500 hover:text-amber-300 transition-colors"
              title="Add reference images — or drop files here"
            >
              <Plus size={16} />
              <span className="text-[9px] mt-0.5">Add</span>
            </button>
          )}

          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleAddLocalRefs(e)}
          />
        </div>
        {linkedPrompt && (
          <p className="mt-2 text-[10px] text-zinc-500 truncate" title={linkedPrompt}>
            Linked text: {linkedPrompt}
          </p>
        )}
      </div>

      <div className="p-1 pt-2">
        {/* Generated output on the card */}
        <div
          className={`w-full bg-[#0a0a0c] rounded-xl flex items-center justify-center relative overflow-hidden group min-h-[200px] ${
            displayUrl && !data.isLoading ? "" : "h-[240px]"
          }`}
        >
          {displayUrl && !data.isLoading ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt="Generated"
                draggable={false}
                onClick={() => setIsModalOpen(true)}
                className={`w-full object-cover transition-transform duration-500 hover:scale-[1.02] cursor-pointer select-none [-webkit-user-drag:none] ${
                  aspectRatio === "16:9"
                    ? "aspect-video"
                    : aspectRatio === "1:1"
                      ? "aspect-square"
                      : "aspect-[9/16]"
                }`}
              />
              {history.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-full px-1 py-0.5">
                  <button
                    type="button"
                    className="p-1 text-white/80 hover:text-white"
                    onClick={() => setHistoryIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[10px] text-white px-1">
                    {historyIndex + 1}/{history.length}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-white/80 hover:text-white"
                    onClick={() => setHistoryIndex((i) => Math.min(history.length - 1, i + 1))}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleGenerate()}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <RotateCcw size={11} /> Re-run
              </button>
            </>
          ) : (
            <div className="text-gray-600 flex flex-col items-center gap-2 p-4 text-center w-full">
              {data.isLoading ? (
                <>
                  <Loader2 size={28} className="animate-spin text-amber-500" />
                  <span className="text-sm font-medium text-amber-300">Generating…</span>
                  <span className="text-[10px] text-zinc-500">Result appears here on this card</span>
                </>
              ) : error ? (
                <span className="text-sm font-medium text-red-400 max-w-[260px]">{error}</span>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <Sparkles size={24} className="text-amber-600/50" />
                  <span className="text-xs">Output appears here after Run</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-3 pt-3 pb-2">
          <input
            ref={promptInputRef}
            type="text"
            className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
            placeholder={
              references.length
                ? `e.g. Keep the sofa from ${references[0]?.mention || "@Image1"}…`
                : "Custom prompt (optional)…"
            }
            value={data.promptOverride || ""}
            onChange={(e) => {
              if (nodeId) {
                updateNodeData(nodeId, { promptOverride: e.target.value });
                window.dispatchEvent(new Event("trigger-workspace-save"));
              }
            }}
          />
          {references.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {references.map((ref) => (
                <button
                  key={`chip-${ref.id}`}
                  type="button"
                  onClick={() => insertMention(ref)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-300 border border-amber-600/20 hover:bg-amber-600/25"
                >
                  {ref.mention}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-white/5 pt-2">
            <button
              type="button"
              onClick={() => setShowStyles((v) => !v)}
              className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-amber-400 mb-2"
            >
              Style / Perspective {showStyles ? "▲" : "▼"}
            </button>
            {showStyles ? (
              <select
                value={perspective}
                onChange={(e) => {
                  const next = e.target.value;
                  setPerspective(next);
                  if (nodeId) {
                    updateNodeData(nodeId, { perspective: next });
                    window.dispatchEvent(new Event("trigger-workspace-save"));
                  }
                }}
                className="w-full bg-[#1c1c1f] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-amber-500/50"
              >
                {Object.entries(styleGroups).map(([type, items]) => (
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
        </div>

        <div className="px-3 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center bg-[#1c1c1f] rounded-lg text-xs font-medium text-gray-300 h-8 border border-white/5">
              <button
                type="button"
                className="px-2 h-full hover:bg-white/5 rounded-l-lg"
                onClick={() => {
                  const val = Math.max(1, imageCount - 1);
                  setImageCount(val);
                  if (nodeId) updateNodeData(nodeId, { imageCount: val });
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
                  if (nodeId) updateNodeData(nodeId, { imageCount: val });
                }}
              >
                +
              </button>
            </div>

            <select
              value={modelName}
              onChange={(e) => {
                setModelName(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { modelName: e.target.value });
                  window.dispatchEvent(new Event("trigger-workspace-save"));
                }
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
                setAspectRatio(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { aspectRatio: e.target.value });
                  window.dispatchEvent(new Event("trigger-workspace-save"));
                }
              }}
              className="bg-[#1c1c1f] border border-white/5 rounded-lg px-2 h-8 text-[11px] text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
            </select>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showSettings ? "bg-amber-600/20 text-amber-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              <Settings2 size={14} />
            </button>
          </div>

          {data.isLoading ? (
            <button
              type="button"
              onClick={handleCancel}
              title="Stop generation"
              className="w-10 h-10 shrink-0 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/40 transition-all active:scale-95 ring-2 ring-red-400/50"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          ) : (
            <div className="relative flex items-center shrink-0">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                title="Run this node"
                className="w-10 h-10 rounded-l-full bg-gradient-to-br from-amber-700 to-yellow-600 hover:opacity-90 flex items-center justify-center text-white shadow-lg shadow-amber-600/30 transition-all"
              >
                <Play size={16} fill="currentColor" className="ml-0.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowRunMenu((v) => !v)}
                title="Run options"
                className="w-7 h-10 rounded-r-full bg-amber-800/80 hover:bg-amber-700 flex items-center justify-center text-white border-l border-white/10"
              >
                <ChevronDown size={14} />
              </button>

              {showRunMenu && (
                <div className="absolute bottom-12 right-0 w-52 bg-[#1c1c1f] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20">
                  <button
                    type="button"
                    onClick={() => void handleRunMode("node")}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                  >
                    <Play size={14} className="text-amber-500" />
                    Run Node
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunMode("downstream")}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                  >
                    <GitBranch size={14} className="text-blue-400" />
                    Run Downstream
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunMode("workflow")}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                  >
                    <Workflow size={14} className="text-emerald-400" />
                    Run Workflow
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {showSettings && (
          <div className="px-3 pb-3 text-[10px] text-zinc-500 leading-relaxed border-t border-white/5 pt-2 mx-1">
            Add up to {MAX_REFERENCE_IMAGES} references. Use{" "}
            <span className="text-amber-300">@Image1</span>,{" "}
            <span className="text-amber-300">@Image2</span> in the prompt. The generated image
            appears on this card.
          </div>
        )}
      </div>

      {mounted &&
        isModalOpen &&
        displayUrl &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 nodrag nopan">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-white bg-white/10 hover:bg-white/20 p-2 rounded-full"
            >
              <X size={24} />
            </button>
            <div className="relative max-w-4xl max-h-[80vh] flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt="Full"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleDownload(displayUrl)}
                  className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium"
                >
                  <Download size={20} />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    void handleGenerate();
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium"
                >
                  <RotateCcw size={18} />
                  Regenerate
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
