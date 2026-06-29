"use client";

import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Type, Image as ImageIcon, X } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

export default function PromptNode({ data }: any) {
  const { updateNodeData } = useReactFlow();
  const nodeId = useNodeId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbPrompts, setDbPrompts] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/content/prompts')
      .then(res => res.json())
      .then(resData => {
        if (resData.ok && resData.data) {
          setDbPrompts(resData.data);
        }
      })
      .catch(err => console.error("Failed to load prompts", err));
  }, []);

  // Merge default backend perspectives if DB is empty or missing them
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
  defaultPrompts.forEach(dp => {
    if (!allPrompts.find(p => p.title === dp.title)) {
      allPrompts.push(dp);
    }
  });

  const groupedPrompts = allPrompts.reduce((acc: any, p: any) => {
    const type = p.type || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(p);
    return acc;
  }, {});

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (nodeId) {
          updateNodeData(nodeId, { imageB64: reader.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    if (nodeId) {
      updateNodeData(nodeId, { imageB64: null });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="bg-[#1c1c1f] border border-gray-800 rounded-xl p-4 w-[320px] shadow-2xl backdrop-blur-md">
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

      <div className="mb-3 nodrag nopan">
        <select 
          className="w-full bg-[#141417] border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          value={data.perspective || "Custom Scene"}
          onChange={(e) => {
            if (nodeId) updateNodeData(nodeId, { perspective: e.target.value });
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
      
      {data.imageB64 && (
        <div className="relative mb-3 group w-full h-24 rounded-lg overflow-hidden border border-gray-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageB64} alt="Uploaded" className="w-full h-full object-cover" />
          <button 
            onClick={removeImage}
            className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <textarea
        className="w-full bg-[#0f0f11] text-sm text-gray-200 p-3 rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none resize-none h-24"
        placeholder="Enter your prompt here..."
        defaultValue={data.prompt || data.label || ''}
        onChange={(e) => {
          if (nodeId) updateNodeData(nodeId, { prompt: e.target.value });
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
