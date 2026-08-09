"use client";

import { Handle, Position, useReactFlow, useNodeId } from "@xyflow/react";
import { Type, Image as ImageIcon, X, Upload, Plus } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  compressImageFile,
  loadLocalRefs,
  MAX_REFERENCE_IMAGES,
  saveLocalRefs,
} from "@/lib/workspace/graphUtils";

const LS_KEY = (id: string) => `ws_img_${id}`;

export default function PromptNode({ data, selected }: { data: any; selected?: boolean }) {
  const { updateNodeData } = useReactFlow();
  const nodeId = useNodeId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbPrompts, setDbPrompts] = useState<any[]>([]);

  const [localPrompt, setLocalPrompt] = useState<string>(data.prompt || data.label || "");
  const [perspective, setPerspective] = useState<string>(data.perspective || "Custom Scene");
  const [showStyles, setShowStyles] = useState(false);
  const [localRefs, setLocalRefs] = useState<{ id: string; b64: string }[]>([]);

  useEffect(() => {
    if (!nodeId) return;
    const fromStore = loadLocalRefs(nodeId);
    if (fromStore.length) {
      setLocalRefs(fromStore);
      return;
    }
    // Migrate legacy single image
    const legacy = data.compressedImageB64 || localStorage.getItem(LS_KEY(nodeId));
    if (legacy) {
      const migrated = [{ id: uuidv4(), b64: String(legacy) }];
      saveLocalRefs(nodeId, migrated);
      setLocalRefs(migrated);
      updateNodeData(nodeId, { compressedImageB64: String(legacy), localRefCount: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

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

  const persistRefs = (next: { id: string; b64: string }[]) => {
    if (!nodeId) return;
    setLocalRefs(next);
    saveLocalRefs(nodeId, next);
    if (next[0]) {
      localStorage.setItem(LS_KEY(nodeId), next[0].b64);
      updateNodeData(nodeId, { compressedImageB64: next[0].b64, localRefCount: next.length });
    } else {
      localStorage.removeItem(LS_KEY(nodeId));
      updateNodeData(nodeId, { compressedImageB64: null, imageB64: null, localRefCount: 0 });
    }
    window.dispatchEvent(new Event("trigger-workspace-save"));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !nodeId) return;

    const room = MAX_REFERENCE_IMAGES - localRefs.length;
    const toAdd = files.slice(0, room);
    const next = [...localRefs];
    for (const file of toAdd) {
      try {
        const b64 = await compressImageFile(file);
        next.push({ id: uuidv4(), b64 });
      } catch (err) {
        console.error(err);
      }
    }
    persistRefs(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    persistRefs(localRefs.filter((r) => r.id !== id));
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <div className="relative group" title="Text output">
          <Handle
            type="source"
            position={Position.Right}
            id="text-out"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-blue-500/50 !rounded-full flex items-center justify-center hover:!bg-blue-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-blue-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
        {localRefs.length > 0 && (
          <div className="relative group" title="Reference images output">
            <Handle
              type="source"
              position={Position.Right}
              id="image-out"
              className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-purple-500/50 !rounded-full flex items-center justify-center hover:!bg-purple-500/20 transition-colors cursor-crosshair !static !transform-none"
            >
              <ImageIcon size={14} className="text-purple-400 group-hover:text-white pointer-events-none" />
            </Handle>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => void handleImageUpload(e)}
      />

      <div className="px-3 pt-3 border-b border-white/5 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            References {localRefs.length ? `(${localRefs.length})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {localRefs.map((ref, i) => (
            <div
              key={ref.id}
              className="relative group w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0c]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ref.b64} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-white text-center py-0.5">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeImage(ref.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {localRefs.length < MAX_REFERENCE_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-xl border border-dashed border-white/15 hover:border-blue-400/50 flex flex-col items-center justify-center text-zinc-500 hover:text-blue-300 transition-colors"
            >
              {localRefs.length ? <Plus size={16} /> : <Upload size={16} />}
              <span className="text-[9px] mt-0.5">{localRefs.length ? "Add" : "Upload"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-1">
        <textarea
          key={nodeId}
          className="w-full bg-transparent text-sm text-gray-300 p-4 focus:outline-none resize-none h-[140px] custom-scrollbar rounded-2xl"
          placeholder='Describe your scene — e.g. "Modern villa at golden hour, photorealistic"'
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
