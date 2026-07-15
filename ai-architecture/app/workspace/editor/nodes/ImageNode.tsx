"use client";

import { Handle, Position, useReactFlow, useNodeId } from "@xyflow/react";
import {
  Sparkles,
  Image as ImageIcon,
  Download,
  X,
  Settings2,
  Loader2,
  Play,
  Type,
  Link2,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cancelJobs } from "@/lib/mysql/client";
import { resolveImageNodeInputs } from "@/lib/workspace/graphUtils";
import { runImageNodeGeneration } from "@/lib/workspace/generation";
import { useWorkspaceEditor } from "../WorkspaceEditorContext";

export default function ImageNode({ data, selected }: any) {
  const { getEdges, getNode, updateNodeData, setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const { registerRunner } = useWorkspaceEditor();

  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState(data.modelName || "nano-banana-pro-preview");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "16:9");
  const [imageCount, setImageCount] = useState(data.imageCount || 1);
  const activeJobIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (Array.isArray(data.activeJobIds) && data.activeJobIds.length > 0) {
      activeJobIdsRef.current = data.activeJobIds;
    }
  }, [data.activeJobIds]);
  const isCancellingRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [inputPreview, setInputPreview] = useState<{ label?: string; thumb?: string } | null>(null);

  useEffect(() => setMounted(true), []);

  const refreshInputPreview = useCallback(() => {
    if (!nodeId) return;
    const resolved = resolveImageNodeInputs(nodeId, getNode, getEdges);
    const thumb = resolved.referenceImageUrl || resolved.referenceImageB64;
    if (thumb || resolved.promptText) {
      setInputPreview({ label: resolved.referenceLabel || (resolved.promptText ? "Text prompt linked" : undefined), thumb });
    } else {
      setInputPreview(null);
    }
  }, [nodeId, getNode, getEdges]);

  useEffect(() => {
    refreshInputPreview();
  }, [refreshInputPreview, data.imageUrls]);

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

  const handleGenerate = useCallback(async () => {
    if (!nodeId) return;
    setError(null);
    isCancellingRef.current = false;

    const resolved = resolveImageNodeInputs(nodeId, getNode, getEdges);
    if (!resolved.textSourceIds.length && !resolved.imageSourceIds.length) {
      setError("Connect Text → text port and/or Image → image port");
      return;
    }

    try {
      await runImageNodeGeneration(
        nodeId,
        {
          modelName,
          aspectRatio,
          imageCount,
          promptOverride: data.promptOverride,
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
      refreshInputPreview();
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
    data.promptOverride,
    updateNodeData,
    setNodes,
    setEdges,
    refreshInputPreview,
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

  const displayUrl =
    data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls[0] : data.imageUrl;

  return (
    <div
      className={`relative bg-[#121214] rounded-2xl w-[380px] shadow-2xl transition-all border-2 ${
        selected ? "border-purple-500 shadow-purple-500/20" : "border-white/10"
      }`}
    >
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300">
        <div className="bg-[#121214] p-1 rounded-md border border-white/10">
          <ImageIcon size={12} className="text-purple-400" />
        </div>
        <span className="font-bold text-xs">Image Generator</span>
      </div>

      {/* Input handles — Magnific-style typed ports */}
      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <div className="relative group" title="Text prompt input">
          <Handle
            type="target"
            position={Position.Left}
            id="text-in"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-purple-500/40 !rounded-full flex items-center justify-center hover:!bg-purple-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-purple-400 pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group" title="Image input (upstream generation or reference)">
          <Handle
            type="target"
            position={Position.Left}
            id="image-in"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-teal-500/40 !rounded-full flex items-center justify-center hover:!bg-teal-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <ImageIcon size={14} className="text-teal-400 pointer-events-none" />
          </Handle>
        </div>
      </div>

      <div className="absolute -right-12 top-6" title="Image output — connect to next generator">
        <Handle
          type="source"
          position={Position.Right}
          id="image-out"
          className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-teal-500/40 !rounded-full flex items-center justify-center hover:!bg-teal-500/20 transition-colors cursor-crosshair !static !transform-none"
        >
          <ImageIcon size={14} className="text-teal-400 pointer-events-none" />
        </Handle>
      </div>

      {inputPreview && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-[10px] text-zinc-400">
          <Link2 size={12} className="text-purple-400 shrink-0" />
          <span className="truncate flex-1">{inputPreview.label || "Inputs connected"}</span>
          {inputPreview.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inputPreview.thumb} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
          )}
        </div>
      )}

      <div className="p-1">
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
                onClick={() => setIsModalOpen(true)}
                className={`w-full object-cover transition-transform duration-500 hover:scale-[1.02] cursor-pointer ${
                  aspectRatio === "16:9"
                    ? "aspect-video"
                    : aspectRatio === "1:1"
                      ? "aspect-square"
                      : "aspect-[9/16]"
                }`}
              />
              <button
                type="button"
                onClick={handleGenerate}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Regenerate with current inputs"
              >
                <RotateCcw size={11} /> Re-run
              </button>
            </>
          ) : (
            <div className="text-gray-600 flex flex-col items-center gap-2 p-4 text-center w-full">
              {data.isLoading ? (
                <>
                  <Loader2 size={28} className="animate-spin text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">Generating…</span>
                  <span className="text-[10px] text-zinc-500">Tap the red ✕ button below to stop</span>
                </>
              ) : error ? (
                <span className="text-sm font-medium text-red-400 max-w-[240px]">{error}</span>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <Sparkles size={24} className="text-purple-500/50" />
                  <span className="text-xs">Connect nodes &amp; press Play</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-3 pt-3 pb-2">
          <input
            type="text"
            className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
            placeholder="Extra prompt (optional)…"
            value={data.promptOverride || ""}
            onChange={(e) => {
              if (nodeId) {
                updateNodeData(nodeId, { promptOverride: e.target.value });
                window.dispatchEvent(new Event("trigger-workspace-save"));
              }
            }}
          />
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
              className="bg-[#1c1c1f] border border-white/5 rounded-lg px-2 h-8 text-[11px] text-gray-300 focus:outline-none cursor-pointer max-w-[100px]"
            >
              <option value="nano-banana-pro-preview">Auto</option>
              <option value="gemini-2.5-flash-image">Gemini Flash</option>
              <option value="imagen-3.0-generate-001">Imagen 3</option>
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
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showSettings ? "bg-purple-500/20 text-purple-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
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
            <button
              type="button"
              onClick={handleGenerate}
              title="Run this node"
              className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 hover:opacity-90 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 transition-all"
            >
              <Play size={16} fill="currentColor" className="ml-0.5" />
            </button>
          )}
        </div>

        {showSettings && (
          <div className="px-3 pb-3 text-[10px] text-zinc-500 leading-relaxed border-t border-white/5 pt-2 mx-1">
            <strong className="text-zinc-400">Workflow:</strong> Text → purple port · Upstream image → teal port ·
            Output → connect to next Image Generator for edits/variations.
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
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium"
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
