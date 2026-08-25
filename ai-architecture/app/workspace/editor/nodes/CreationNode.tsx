"use client";

import { Handle, Position, useReactFlow, useNodeId, NodeToolbar } from "@xyflow/react";
import {
  Image as ImageIcon,
  Download,
  Trash2,
  Replace,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import {
  clearCreationImage,
  persistCreationImage,
  collectDroppedImageFiles,
  isExternalOsFileDrop,
  loadCreationImage,
} from "@/lib/workspace/graphUtils";
import NodeRunMenu from "../NodeRunMenu";

type CreationData = {
  label?: string;
  creationNumber?: number;
  width?: number;
  height?: number;
  hasImage?: boolean;
  /** Display + generation source — set when uploading via Assets */
  previewUrl?: string | null;
};

export default function CreationNode({ data, selected }: { data: CreationData; selected?: boolean }) {
  const { updateNodeData, deleteElements, getNode } = useReactFlow();
  const nodeId = useNodeId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(data.previewUrl || null);
  const [dims, setDims] = useState({ w: data.width || 0, h: data.height || 0 });
  const [isFileOver, setIsFileOver] = useState(false);

  const number = data.creationNumber || 1;
  const title = data.label || `Creation #${number}`;

  // Prefer node data (instant after Assets upload), then memory/localStorage
  useEffect(() => {
    if (data.previewUrl) {
      setImageSrc(data.previewUrl);
      return;
    }
    if (!nodeId) return;
    const stored = loadCreationImage(nodeId);
    if (stored) setImageSrc(stored);
  }, [nodeId, data.previewUrl, data.hasImage]);

  useEffect(() => {
    if (!imageSrc) return;
    const img = new window.Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      if (nodeId && (!data.width || !data.height)) {
        updateNodeData(nodeId, {
          hasImage: true,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
    };
    img.src = imageSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, nodeId]);

  const applyFile = async (file: File) => {
    if (!nodeId) return;
    const persisted = await persistCreationImage(nodeId, file);
    setImageSrc(persisted.src);
    setDims({ w: persisted.width, h: persisted.height });
    updateNodeData(nodeId, {
      hasImage: true,
      previewUrl: persisted.src,
      width: persisted.width,
      height: persisted.height,
      label: `Creation #${number}`,
      creationNumber: number,
    });
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await applyFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileDragOver = (e: DragEvent) => {
    if (!isExternalOsFileDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsFileOver(true);
  };

  const onFileDrop = async (e: DragEvent) => {
    if (!isExternalOsFileDrop(e.dataTransfer)) return;
    const files = collectDroppedImageFiles(e.dataTransfer);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFileOver(false);
    await applyFile(files[0]);
  };

  const handleDownload = () => {
    if (!imageSrc) return;
    const a = document.createElement("a");
    a.href = imageSrc;
    a.download = `creation-${number}.jpg`;
    a.click();
  };

  const handleDelete = () => {
    if (!nodeId) return;
    clearCreationImage(nodeId);
    const node = getNode(nodeId);
    if (node) deleteElements({ nodes: [node] });
  };

  return (
    <div
      className={`relative bg-[#121214] rounded-2xl w-[280px] shadow-2xl transition-all border-2 ${
        selected ? "border-blue-500 shadow-blue-500/20" : "border-white/10"
      }`}
    >
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300 z-10">
        <div className="bg-[#121214] p-1 rounded-md border border-white/10">
          <ImageIcon size={12} className="text-blue-400" />
        </div>
        <span className="font-bold text-xs">{title}</span>
      </div>

      {selected && (
        <NodeToolbar isVisible position={Position.Top} offset={36} className="!bg-transparent !border-0 !p-0 !shadow-none">
          <div className="flex items-center gap-0.5 bg-[#1c1c1f] border border-white/10 rounded-xl px-1.5 py-1 shadow-xl">
            <NodeRunMenu nodeId={nodeId} />
            <div className="w-px h-5 bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-1.5 rounded-lg text-zinc-300 hover:bg-white/10"
              title="Replace"
            >
              <Replace size={14} />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!imageSrc}
              className="p-1.5 rounded-lg text-zinc-300 hover:bg-white/10 disabled:opacity-30"
              title="Download"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-zinc-300 hover:bg-red-500/20 hover:text-red-300"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
            <button type="button" className="p-1.5 rounded-lg text-zinc-500" title="More">
              <MoreHorizontal size={14} />
            </button>
          </div>
        </NodeToolbar>
      )}

      {/* Handle OUTSIDE overflow so it stays connectable (Magnific-style port) */}
      <Handle
        type="source"
        position={Position.Right}
        id="image-out"
        className="!w-8 !h-8 !-right-10 !top-1/2 !-translate-y-1/2 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair"
        title="Image output — drag to Text or Image Generator"
      >
        <ImageIcon size={14} className="text-blue-400 pointer-events-none" />
      </Handle>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e)} />

      <div
        className={`relative aspect-square bg-[#0a0a0c] rounded-2xl overflow-hidden group ${
          isFileOver ? "ring-2 ring-amber-500/70" : ""
        }`}
        onDragOver={onFileDragOver}
        onDragEnter={onFileDragOver}
        onDragLeave={() => setIsFileOver(false)}
        onDrop={(e) => void onFileDrop(e)}
      >
        {imageSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={title}
              draggable={false}
              className="w-full h-full object-cover pointer-events-none select-none [-webkit-user-drag:none]"
            />
            {dims.w > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-black/55 px-2 py-0.5 rounded-md pointer-events-none">
                {dims.w} × {dims.h}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[11px] font-medium text-white bg-black/55 hover:bg-black/75 px-2.5 py-1.5 rounded-lg nodrag nopan"
            >
              <Replace size={12} />
              Replace
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ImageIcon size={28} className="opacity-50" />
            <span className="text-xs font-medium">Drop image or click to upload</span>
            <span className="text-[10px] text-zinc-600">JPG, PNG, WebP</span>
          </button>
        )}
        {isFileOver && (
          <div className="absolute inset-0 bg-amber-950/50 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-semibold text-amber-200">Drop to add image</span>
          </div>
        )}
      </div>
    </div>
  );
}
