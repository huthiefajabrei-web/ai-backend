"use client";

import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Type, Image as ImageIcon, Video, X } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// imageB64 is stored in localStorage (not Firestore) because base64 images
// can be several MB — well above Firestore's 1MB document limit.
// Key pattern: ws_img_{nodeId}
// ─────────────────────────────────────────────────────────────────────────────
const LS_KEY = (id: string) => `ws_img_${id}`;

export default function PromptNode({ data, selected }: any) {
  const { updateNodeData } = useReactFlow();
  const nodeId = useNodeId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbPrompts, setDbPrompts] = useState<any[]>([]);

  // Controlled prompt text — keeps each node fully independent
  const [localPrompt, setLocalPrompt] = useState<string>(data.prompt || data.label || '');
  const [perspective, setPerspective] = useState<string>(data.perspective || 'Custom Scene');
  const [showStyles, setShowStyles] = useState(false);

  // imageB64 lives in localStorage, keyed by nodeId
  const [localImageB64, setLocalImageB64] = useState<string | null>(null);

  // On mount: restore imageB64 from localStorage (survives page refresh)
  useEffect(() => {
    if (data.compressedImageB64) {
      setLocalImageB64(data.compressedImageB64);
    } else if (nodeId) {
      const stored = localStorage.getItem(LS_KEY(nodeId));
      if (stored) {
        setLocalImageB64(stored);
        updateNodeData(nodeId, { compressedImageB64: stored });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, data.compressedImageB64]);

  // Load perspective presets from backend
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    fetch(`${apiUrl}/content/prompts`)
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

  // ── Upload handler — compresses image to fit in Firestore ──────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !nodeId) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_SIZE = 800;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedB64 = canvas.toDataURL('image/jpeg', 0.8);
          setLocalImageB64(compressedB64);
          localStorage.setItem(LS_KEY(nodeId), compressedB64);
          updateNodeData(nodeId, { compressedImageB64: compressedB64 });
          window.dispatchEvent(new Event('trigger-workspace-save'));
        }
      };
      img.src = b64;
    };
    reader.readAsDataURL(file);
  };

  // ── Remove handler — clears both localStorage and node data ─────────────
  const removeImage = () => {
    if (!nodeId) return;
    localStorage.removeItem(LS_KEY(nodeId));
    setLocalImageB64(null);
    updateNodeData(nodeId, { imageB64: null, compressedImageB64: null });
    window.dispatchEvent(new Event('trigger-workspace-save'));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`relative bg-[#121214] rounded-2xl w-[340px] shadow-2xl transition-all border-2 ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-white/10'}`}>
      
      {/* Node Header */}
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300">
        <div className="bg-[#121214] p-1 rounded-md border border-white/10">
          <Type size={12} className="text-indigo-400" />
        </div>
        <span className="font-bold text-xs">Text</span>
      </div>

      {/* Floating Target Handles (Left) */}
      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <div className="relative group">
          <Handle
            type="target"
            position={Position.Left}
            id="text-in"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-gray-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group">
          <Handle
            type="target"
            position={Position.Left}
            id="video-in"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none"
          >
            <Video size={14} className="text-gray-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
        <div className="relative group" onClick={() => fileInputRef.current?.click()}>
          <Handle
            type="target"
            position={Position.Left}
            id="image-in"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none"
          >
            <ImageIcon size={14} className="text-gray-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
      </div>

      {/* Floating Source Handle (Right) */}
      <div className="absolute -right-12 top-6 flex flex-col gap-3">
        <div className="relative group">
          <Handle
            type="source"
            position={Position.Right}
            id="text-out"
            className="!w-8 !h-8 !bg-[#1c1c1f] !border-2 !border-purple-500/40 !rounded-full flex items-center justify-center hover:!bg-purple-500/20 transition-colors cursor-crosshair !static !transform-none"
          >
            <Type size={14} className="text-purple-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />

      {/* Uploaded reference image preview (if any) */}
      {localImageB64 && (
        <div className="relative group w-full h-32 border-b border-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={localImageB64} alt="Uploaded" className="w-full h-full object-cover rounded-t-2xl" />
          <button
            onClick={removeImage}
            className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Prompt textarea body */}
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
              window.dispatchEvent(new Event('trigger-workspace-save'));
            }
          }}
        />

        <div className="px-3 pb-3 border-t border-white/5 mx-2 pt-2">
          <button
            type="button"
            onClick={() => setShowStyles(!showStyles)}
            className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-purple-400 mb-2"
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
                  window.dispatchEvent(new Event('trigger-workspace-save'));
                }
              }}
              className="w-full bg-[#1c1c1f] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50"
            >
              {Object.entries(groupedPrompts).map(([type, items]: [string, any]) => (
                <optgroup key={type} label={type}>
                  {(items as { title: string }[]).map((p) => (
                    <option key={p.title} value={p.title}>{p.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {!showStyles && (
            <p className="text-[10px] text-zinc-600 truncate">{perspective}</p>
          )}
        </div>
      </div>
      
      {/* Custom Scrollbar Styles for textarea */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}} />
    </div>
  );
}
