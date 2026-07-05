"use client";

import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Type, Image as ImageIcon, X } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// imageB64 is stored in localStorage (not Firestore) because base64 images
// can be several MB — well above Firestore's 1MB document limit.
// Key pattern: ws_img_{nodeId}
// ─────────────────────────────────────────────────────────────────────────────
const LS_KEY = (id: string) => `ws_img_${id}`;

export default function PromptNode({ data }: any) {
  const { updateNodeData } = useReactFlow();
  const nodeId = useNodeId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbPrompts, setDbPrompts] = useState<any[]>([]);

  // Controlled prompt text — keeps each node fully independent
  const [localPrompt, setLocalPrompt] = useState<string>(data.prompt || data.label || '');

  // imageB64 lives in localStorage, keyed by nodeId
  const [localImageB64, setLocalImageB64] = useState<string | null>(null);

  // On mount: restore imageB64 from localStorage (survives page refresh)
  useEffect(() => {
    if (!nodeId) return;
    const stored = localStorage.getItem(LS_KEY(nodeId));
    if (stored) {
      setLocalImageB64(stored);
      // Sync into React-Flow node data so ImageNode can read it for generation
      updateNodeData(nodeId, { imageB64: stored });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Load perspective presets from backend
  useEffect(() => {
    fetch('http://127.0.0.1:8000/content/prompts')
      .then(res => res.json())
      .then(resData => {
        if (resData.ok && resData.data) setDbPrompts(resData.data);
      })
      .catch(err => console.error('Failed to load prompts', err));
  }, []);

  const defaultPrompts = [
    { title: 'Photorealistic Exterior', type: 'Exterior' },
    { title: 'Night Shot', type: 'Exterior' },
    { title: 'Sunset/Golden Hour', type: 'Exterior' },
    { title: 'Photorealistic Interior', type: 'Interior' },
    { title: 'Living Room Design', type: 'Interior' },
    { title: 'Bedroom Design', type: 'Interior' },
    { title: 'Kitchen & Dining', type: 'Interior' },
    { title: 'Bathroom Design', type: 'Interior' },
    { title: 'Floor Plan to 3D', type: 'Plan' },
    { title: 'Architectural Plan, Elevation & Section', type: 'Plan' },
    { title: 'Physical Model', type: 'Model' },
    { title: 'Architectural concept sketch', type: 'Sketch' },
  ];

  const allPrompts = [...dbPrompts];
  defaultPrompts.forEach(dp => {
    if (!allPrompts.find(p => p.title === dp.title)) allPrompts.push(dp);
  });

  const groupedPrompts = allPrompts.reduce((acc: any, p: any) => {
    const t = p.type || 'Other';
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});

  // ── Upload handler — saves to localStorage instead of Firestore ──────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !nodeId) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      // Save in localStorage (survives refresh, not limited by Firestore)
      localStorage.setItem(LS_KEY(nodeId), b64);
      setLocalImageB64(b64);
      // Sync into React-Flow data for ImageNode to read during generation
      updateNodeData(nodeId, { imageB64: b64 });
    };
    reader.readAsDataURL(file);
  };

  // ── Remove handler — clears both localStorage and node data ─────────────
  const removeImage = () => {
    if (!nodeId) return;
    localStorage.removeItem(LS_KEY(nodeId));
    setLocalImageB64(null);
    updateNodeData(nodeId, { imageB64: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-[#1c1c1f] border border-gray-800 rounded-xl p-4 w-[320px] shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-gray-300">
        <div className="flex items-center gap-2">
          <Type size={16} className="text-blue-400" />
          <span className="font-medium text-sm">Prompt & Image</span>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs flex items-center gap-1 bg-[#2a2a2e] hover:bg-[#35353a] px-2 py-1 rounded transition-colors text-gray-300"
        >
          <ImageIcon size={12} />
          Add Image
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleImageUpload}
        />
      </div>

      {/* Perspective selector */}
      <div className="mb-3 nodrag nopan">
        <select
          className="w-full bg-[#141417] border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          value={data.perspective || 'Custom Scene'}
          onChange={(e) => {
            if (nodeId) {
              updateNodeData(nodeId, { perspective: e.target.value });
              window.dispatchEvent(new Event('trigger-workspace-save'));
            }
          }}
        >
          <option value="Custom Scene">Custom Scene (Prompt Only)</option>
          {Object.entries(groupedPrompts).map(([type, items]: any) => (
            <optgroup key={type} label={`Perspective Styles (${type})`}>
              {items.map((p: any) => (
                <option key={p.title} value={p.title}>{p.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Uploaded reference image (from localStorage) */}
      {localImageB64 && (
        <div className="relative mb-3 group w-full h-24 rounded-lg overflow-hidden border border-gray-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={localImageB64} alt="Uploaded" className="w-full h-full object-cover" />
          <button
            onClick={removeImage}
            className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Prompt textarea */}
      <textarea
        key={nodeId}
        className="w-full bg-[#0f0f11] text-sm text-gray-200 p-3 rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none resize-none h-24"
        placeholder="Enter your prompt here..."
        value={localPrompt}
        onChange={(e) => {
          setLocalPrompt(e.target.value);
          if (nodeId) {
            updateNodeData(nodeId, { prompt: e.target.value });
            window.dispatchEvent(new Event('trigger-workspace-save'));
          }
        }}
      />

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500 border-2 border-[#1c1c1f]"
      />
    </div>
  );
}
