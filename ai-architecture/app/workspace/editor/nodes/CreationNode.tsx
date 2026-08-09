"use client";

import { Handle, Position, useReactFlow, useNodeId, NodeToolbar } from "@xyflow/react";
import {
  Image as ImageIcon,
  Download,
  Trash2,
  Replace,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  compressImageFile,
  CREATION_LS_KEY,
  loadCreationImage,
  saveCreationImage,
} from "@/lib/workspace/graphUtils";

type CreationData = {
  label?: string;
  creationNumber?: number;
  width?: number;
  height?: number;
  hasImage?: boolean;
};

export default function CreationNode({ data, selected }: { data: CreationData; selected?: boolean }) {
  const { updateNodeData, deleteElements, getNode } = useReactFlow();
  const nodeId = useNodeId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: data.width || 0, h: data.height || 0 });

  const number = data.creationNumber || 1;
  const title = data.label || `Creation #${number}`;

  useEffect(() => {
    if (!nodeId) return;
    const stored = loadCreationImage(nodeId);
    if (stored) {
      setImageSrc(stored);
      const img = new window.Image();
      img.onload = () => {
        setDims({ w: img.naturalWidth, h: img.naturalHeight });
        updateNodeData(nodeId, {
          hasImage: true,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = stored;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const applyFile = async (file: File) => {
    if (!nodeId) return;
    const b64 = await compressImageFile(file, 1280, 0.85);
    saveCreationImage(nodeId, b64);
    setImageSrc(b64);

    const img = new window.Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      updateNodeData(nodeId, {
        hasImage: true,
        width: img.naturalWidth,
        height: img.naturalHeight,
        label: `Creation #${number}`,
        creationNumber: number,
      });
      window.dispatchEvent(new Event("trigger-workspace-save"));
    };
    img.src = b64;
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await applyFile(file);
    if (fileRef.current) fileRef.current.value = "";
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
    localStorage.removeItem(CREATION_LS_KEY(nodeId));
    const node = getNode(nodeId);
    if (node) deleteElements({ nodes: [node] });
  };

  return (
    <div
      className={`relative bg-[#121214] rounded-2xl w-[280px] shadow-2xl transition-all border-2 overflow-hidden ${
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
          <div className="flex items-center gap-1 bg-[#1c1c1f] border border-white/10 rounded-xl px-2 py-1.5 shadow-xl">
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

      <div className="absolute -right-12 top-1/2 -translate-y-1/2">
        <Handle
          type="source"
          position={Position.Right}
          id="image-out"
          className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair !static !transform-none"
          title="Image output"
        >
          <ImageIcon size={14} className="text-blue-400 pointer-events-none" />
        </Handle>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e)} />

      <div className="relative aspect-square bg-[#0a0a0c] group">
        {imageSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={title} className="w-full h-full object-cover" />
            {dims.w > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-black/55 px-2 py-0.5 rounded-md">
                {dims.w} × {dims.h}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[11px] font-medium text-white bg-black/55 hover:bg-black/75 px-2.5 py-1.5 rounded-lg"
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
            <span className="text-xs font-medium">Choose from device</span>
            <span className="text-[10px] text-zinc-600">JPG, PNG, WebP</span>
          </button>
        )}
      </div>
    </div>
  );
}
