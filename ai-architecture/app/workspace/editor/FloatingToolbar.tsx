import React from 'react';
import { 
  Plus, 
  Play, 
  Hand, 
  Scissors, 
  Square, 
  Type, 
  Undo2, 
  Redo2, 
  Settings 
} from 'lucide-react';

export default function FloatingToolbar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 bg-[#18181b] p-3 rounded-2xl border border-gray-800 shadow-2xl">
      <div className="flex flex-col gap-3">
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Plus size={20} />
        </button>
        
        {/* Generate / Image Node (Draggable) */}
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:bg-gray-200 cursor-grab active:cursor-grabbing transition-colors"
          onDragStart={(event) => onDragStart(event, 'imageNode')}
          draggable
          title="Drag to add Generate Node"
        >
          <Play size={18} fill="currentColor" className="ml-1" />
        </div>

        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Hand size={20} />
        </button>
        
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Scissors size={20} />
        </button>
        
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Square size={20} />
        </button>

        {/* Text / Prompt Node (Draggable) */}
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] cursor-grab active:cursor-grabbing transition-colors"
          onDragStart={(event) => onDragStart(event, 'promptNode')}
          draggable
          title="Drag to add Prompt Node"
        >
          <Type size={20} />
        </div>
      </div>

      <div className="w-full h-[1px] bg-gray-800 my-1"></div>

      <div className="flex flex-col gap-3">
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Undo2 size={18} />
        </button>
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Redo2 size={18} />
        </button>
        <button className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-[#27272a] transition-colors">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
