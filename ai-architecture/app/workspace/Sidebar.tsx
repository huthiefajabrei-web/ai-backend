"use client";

import { Type, Image as ImageIcon, Zap, Upload, Sparkles } from 'lucide-react';

const tools = [
  { type: 'promptNode', label: 'Prompt', icon: Type, color: 'text-blue-400' },
  { type: 'imageNode', label: 'Generate', icon: Sparkles, color: 'text-purple-400' },
  { type: 'upscaleNode', label: 'Upscale', icon: Zap, color: 'text-yellow-400' },
  { type: 'uploadNode', label: 'Upload', icon: Upload, color: 'text-green-400' },
];

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 bg-[#141417] border-r border-gray-800 h-full flex flex-col p-4 shadow-xl z-10 relative">
      <div className="mb-8 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          Spaces
        </h1>
      </div>
      
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Tools (Drag & Drop)
      </div>
      
      <div className="flex flex-col gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.type}
              className="flex items-center gap-3 bg-[#1c1c1f] hover:bg-[#252529] p-3 rounded-lg border border-gray-800 cursor-grab active:cursor-grabbing transition-all hover:border-gray-600"
              onDragStart={(event) => onDragStart(event, tool.type)}
              draggable
            >
              <div className={`p-2 rounded-md bg-[#2a2a2e] ${tool.color}`}>
                <Icon size={16} />
              </div>
              <span className="text-sm font-medium text-gray-200">{tool.label}</span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-auto bg-gradient-to-br from-purple-600/10 to-blue-600/10 p-4 rounded-xl border border-purple-500/20">
        <h3 className="text-sm font-medium text-purple-300 mb-1">Infinite Canvas</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Connect nodes to build custom AI workflows. Drag tools onto the canvas to get started.
        </p>
      </div>
    </div>
  );
}
