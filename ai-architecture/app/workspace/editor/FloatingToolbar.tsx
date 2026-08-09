import React, { useState } from 'react';
import { 
  Plus, 
  Play, 
  Hand, 
  Scissors, 
  Square, 
  Type, 
  Undo2, 
  Redo2, 
  Settings,
  X,
  Search,
  LayoutGrid,
  Image as ImageIcon,
  Video,
  Sparkles,
  Zap,
  List,
  Upload,
  Layers,
  Box
} from 'lucide-react';

interface FloatingToolbarProps {
  onAddNode?: (type: string) => void;
  activeTool?: string;
  onToolChange?: (tool: string) => void;
}

export default function FloatingToolbar({ onAddNode, activeTool = 'cursor', onToolChange }: FloatingToolbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNode = (type: string) => {
    if (onAddNode) {
      onAddNode(type);
      setIsMenuOpen(false); // Close menu after adding
    }
  };

  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex items-start gap-4">
      {/* Main Toolbar */}
      <div className="flex flex-col gap-3 bg-[#18181b] p-3 rounded-2xl border border-gray-800 shadow-2xl">
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isMenuOpen ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-[#27272a]'}`}
          >
            {isMenuOpen ? <X size={20} /> : <Plus size={20} />}
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

          <button 
            onClick={() => onToolChange?.('cursor')}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${activeTool === 'cursor' ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-[#27272a]'}`}
            title="Pan & Select Tool"
          >
            <Hand size={20} />
          </button>
          
          <button 
            onClick={() => onToolChange?.('scissors')}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${activeTool === 'scissors' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white hover:bg-[#27272a]'}`}
            title="Cut Connections Tool"
          >
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

      {/* Node Menu Panel */}
      {isMenuOpen && (
        <div className="w-[300px] h-[600px] bg-[#18181b] rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text" 
                placeholder="Search" 
                className="w-full bg-[#27272a] text-white text-sm rounded-lg pl-10 pr-4 py-2 outline-none focus:ring-1 focus:ring-gray-600 transition-all placeholder:text-gray-500"
              />
            </div>
            
            {/* Quick Icons */}
            <div className="flex items-center justify-between mt-4 px-1 text-gray-400">
              <button className="hover:text-white transition-colors"><LayoutGrid size={16} /></button>
              <button className="hover:text-white transition-colors"><Type size={16} /></button>
              <button className="hover:text-white transition-colors"><ImageIcon size={16} /></button>
              <button className="hover:text-white transition-colors"><Video size={16} /></button>
              <button className="hover:text-white transition-colors"><Type size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {/* BASICS */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-500 mb-3 tracking-wider">BASICS</h3>
              
              <button onClick={() => handleAddNode('promptNode')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/25 transition-colors">
                  <Type size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Text</span>
              </button>

              <button onClick={() => handleAddNode('imageNode')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/25 transition-colors">
                  <ImageIcon size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Image Generator</span>
              </button>

              <button onClick={() => { window.location.href = '/video'; }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-[#183a30] flex items-center justify-center text-emerald-400 group-hover:bg-[#1f4c3f] transition-colors">
                  <Video size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Video Generator</span>
              </button>

              <button onClick={() => alert('Assistant coming soon!')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-[#2d1b36] flex items-center justify-center text-purple-400 group-hover:bg-[#3d244a] transition-colors">
                  <Sparkles size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Assistant</span>
              </button>

              <button onClick={() => alert('Image Upscaler coming soon!')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-[#1a2c42] flex items-center justify-center text-blue-400 group-hover:bg-[#233a57] transition-colors">
                  <Zap size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Image Upscaler</span>
              </button>

              <button onClick={() => alert('List coming soon!')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:bg-[#3a3a3a] transition-colors">
                  <List size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">List</span>
              </button>
            </div>

            {/* MEDIA */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 mb-3 tracking-wider">MEDIA</h3>
              
              <button onClick={() => handleAddNode('creationNode')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/25 transition-colors">
                  <Upload size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Upload</span>
              </button>

              <button onClick={() => handleAddNode('creationNode')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/25 transition-colors">
                  <Layers size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Assets</span>
              </button>

              <button onClick={() => alert('Stock coming soon!')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#27272a] transition-colors group mb-1 text-left">
                <div className="w-8 h-8 rounded-md bg-[#2a2a2a] flex items-center justify-center text-gray-400 group-hover:bg-[#3a3a3a] transition-colors">
                  <Box size={16} />
                </div>
                <span className="text-sm font-medium text-gray-200">Stock</span>
              </button>
            </div>
          </div>

          {/* Footer Shortcuts */}
          <div className="p-3 border-t border-gray-800 bg-[#1c1c1f] flex items-center justify-between text-[10px] text-gray-500 font-medium">
            <div className="flex items-center gap-1">
              <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">N</span>
              Open
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">↑↓</span>
                Navigate
              </div>
              <div className="flex items-center gap-1">
                <span className="bg-[#27272a] px-1.5 py-0.5 rounded text-gray-400">↵</span>
                Insert
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Custom Scrollbar Styles */}
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
