"use client";

import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Sparkles, Image as ImageIcon, Download, X, Settings2, Loader2, LayoutTemplate, Type, Play } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Helper to convert base64 to Blob
function dataURLtoBlob(dataurl: string) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export default function ImageNode({ data, selected }: any) {
  const { getEdges, getNode, updateNodeData, setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const [error, setError] = useState<string | null>(null);

  // Local settings state — initialized from persisted node data
  const [modelName, setModelName] = useState(data.modelName || "nano-banana-pro-preview");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "9:16");
  const [imageCount, setImageCount] = useState(data.imageCount || 1);
  const activeJobIdsRef = useRef<string[]>([]);
  const isCancellingRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDownload = async (url: string) => {
    try {
      if (url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `generated-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.warn("Fetch failed due to CORS, falling back to direct link", e);
      // Fallback: Open in new tab / force direct navigation
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-${Date.now()}.jpg`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleGenerate = async () => {
    if (!nodeId) return;
    setError(null);

    // 1. Find incoming edge
    const edges = getEdges();
    const incomingEdge = edges.find((e) => e.target === nodeId);
    
    if (!incomingEdge) {
      setError("Connect a Prompt node first!");
      return;
    }

    // 2. Get prompt and image data
    const sourceNode = getNode(incomingEdge.source);
    // Combine node prompt and local override if provided
    const basePrompt = String(sourceNode?.data?.prompt || sourceNode?.data?.label || "");
    const override = data.promptOverride ? String(data.promptOverride).trim() : "";
    const promptText = override ? `${basePrompt} ${override}`.trim() : basePrompt;
    
    const imageB64 = sourceNode?.data?.compressedImageB64 
      ? String(sourceNode?.data?.compressedImageB64) 
      : sourceNode?.data?.imageB64 
        ? String(sourceNode?.data?.imageB64) 
        : undefined;
    const perspectiveStyle = String(sourceNode?.data?.perspective || 'Custom Scene');

    if (!promptText && !imageB64) {
      setError("Prompt or Image is required!");
      return;
    }

    // 3. Set loading state
    updateNodeData(nodeId, { isLoading: true, imageUrls: [] });
    setShowSettings(false);
    isCancellingRef.current = false;
    activeJobIdsRef.current = [];

    try {
      // Create form data for the backend API
      const formData = new FormData();
      formData.append('perspective', perspectiveStyle);
      formData.append('custom_prompt', promptText);
      formData.append('model_name', modelName);
      formData.append('aspect_ratio', aspectRatio);
      formData.append('image_count', String(imageCount));

      if (imageB64) {
        const blob = dataURLtoBlob(imageB64);
        formData.append('file', blob, 'uploaded_image.jpg');
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      // Call the API
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        body: formData,
      });

      const responseData = await response.json();
      
      if (!responseData.ok || !responseData.job_ids || responseData.job_ids.length === 0) {
        throw new Error(responseData.error || 'Failed to queue job');
      }

      const jobIds = responseData.job_ids;
      activeJobIdsRef.current = jobIds;
      
      // Spawn new nodes if we have more than 1 job
      const currentNode = getNode(nodeId);
      const spawnedNodeIds: string[] = [];
      const newNodes: any[] = [];
      const newEdges: any[] = [];

      if (currentNode) {
        for (let i = 1; i < jobIds.length; i++) {
          const newNodeId = `dndnode_${Date.now()}_${i}`;
          spawnedNodeIds.push(newNodeId);
          
          newNodes.push({
            id: newNodeId,
            type: 'imageNode',
            position: { x: currentNode.position.x, y: currentNode.position.y + (i * 280) },
            data: { isLoading: true, imageUrls: [] }
          });
          
          newEdges.push({
            id: `e-${incomingEdge.source}-${newNodeId}`,
            source: incomingEdge.source,
            target: newNodeId,
            animated: true,
            style: { stroke: '#8b5cf6', strokeWidth: 2 }
          });
        }

        if (newNodes.length > 0) {
          setNodes((nds) => [...nds, ...newNodes]);
          setEdges((eds) => [...eds, ...newEdges]);
        }
      }

      // Function to poll a single job
      const pollJob = async (jobId: string, targetNodeId: string) => {
        try {
          let isCompleted = false;
          let finalUrl = null;

          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
          while (!isCompleted) {
            if (isCancellingRef.current) {
              throw new Error("Cancelled by user");
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (isCancellingRef.current) {
              throw new Error("Cancelled by user");
            }
            const statusRes = await fetch(`${apiUrl}/status/${jobId}`);
            const statusData = await statusRes.json();

            if (statusData.status === 'COMPLETED') {
              isCompleted = true;
              finalUrl = statusData.file_url || statusData.image_data_url;
            } else if (statusData.status === 'FAILED' || statusData.status === 'TIMEOUT') {
              throw new Error(statusData.error || `Job ${jobId} failed or timed out`);
            }
          }
          updateNodeData(targetNodeId, {
            // Filter out any null/undefined to prevent Firestore's
            // "invalid nested entity" error on arrays
            imageUrls: [finalUrl].filter((u): u is string => typeof u === 'string' && u.length > 0),
            isLoading: false,
          });
          window.dispatchEvent(new Event('trigger-workspace-save'));
        } catch (e: any) {
          updateNodeData(targetNodeId, { isLoading: false });
          window.dispatchEvent(new Event('trigger-workspace-save'));
          // If it's the main node, set error, otherwise we might not have a way to set local error for spawned nodes
          if (targetNodeId === nodeId) setError(e.message || "Failed");
        }
      };

      // Poll all jobs concurrently
      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i];
        const targetNodeId = i === 0 ? nodeId : spawnedNodeIds[i - 1];
        pollJob(jobId, targetNodeId);
      }

    } catch (err: any) {
      if (err.message !== "Cancelled by user") {
        setError(err.message || "Failed to generate image.");
      } else {
        setError("Generation Cancelled");
      }
      if (nodeId) updateNodeData(nodeId, { isLoading: false });
      window.dispatchEvent(new Event('trigger-workspace-save'));
    } finally {
      activeJobIdsRef.current = [];
    }
  };

  const handleCancel = async () => {
    if (!nodeId || !data.isLoading) return;
    isCancellingRef.current = true;
    updateNodeData(nodeId, { isLoading: false });
    setError("Generation Cancelled");
    window.dispatchEvent(new Event('trigger-workspace-save'));

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`${apiUrl}/cancel-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ job_ids: activeJobIdsRef.current })
      });
    } catch (e) {
      console.error("Failed to cancel jobs on backend", e);
    }
  };

  const displayUrl = (data.imageUrls && data.imageUrls.length > 0) ? data.imageUrls[0] : data.imageUrl;

  return (
    <div className={`relative bg-[#1c1c1f] rounded-2xl w-[400px] shadow-2xl transition-all border-2 ${selected ? 'border-purple-500' : 'border-transparent'}`}>
      
      {/* Node Header */}
      <div className="absolute -top-7 left-2 flex items-center gap-2 text-gray-300">
        <div className="bg-[#1c1c1f] p-1 rounded-md border border-gray-800">
          <ImageIcon size={12} className="text-gray-300" />
        </div>
        <span className="font-bold text-xs">Image Generator</span>
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
            id="image-out"
            className="!w-8 !h-8 !bg-[#2a2a2e] !border-none !rounded-full flex items-center justify-center hover:!bg-[#35353a] transition-colors cursor-crosshair !static !transform-none"
          >
            <ImageIcon size={14} className="text-gray-400 group-hover:text-white pointer-events-none" />
          </Handle>
        </div>
      </div>

      <div className="p-1">
        {/* Image Preview Area */}
        <div className={`w-full bg-[#141417] rounded-xl flex items-center justify-center relative overflow-hidden group ${displayUrl && !data.isLoading ? '' : 'h-[320px]'}`}>
          {displayUrl && !data.isLoading ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img 
              src={displayUrl} 
              alt={`Generated`} 
              onClick={() => setIsModalOpen(true)}
              className={`w-full object-cover transition-transform duration-500 hover:scale-105 cursor-pointer ${aspectRatio === '16:9' ? 'aspect-video' : aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[9/16]'}`} 
            />
          ) : (
            <div className="text-gray-600 flex flex-col items-center gap-2 p-4 text-center absolute">
              {data.isLoading ? (
                <div className="flex flex-col items-center gap-3 text-purple-400">
                  <Loader2 size={28} className="animate-spin" />
                  <span className="text-sm font-medium">Creating magic...</span>
                  <button 
                    onClick={handleCancel}
                    className="mt-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ) : error ? (
                <span className="text-sm font-medium text-red-400">{error}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Inline Prompt Input */}
        <div className="px-3 pt-4 pb-2">
          <input
            type="text"
            className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
            placeholder="Describe the image you want to generate..."
            value={data.promptOverride || ''}
            onChange={(e) => {
              if (nodeId) {
                updateNodeData(nodeId, { promptOverride: e.target.value });
                window.dispatchEvent(new Event('trigger-workspace-save'));
              }
            }}
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="px-3 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Quantity Control */}
            <div className="flex items-center bg-[#2a2a2e] rounded-lg text-xs font-medium text-gray-300 h-8">
              <button 
                className="px-2.5 h-full hover:bg-[#35353a] hover:text-white transition-colors rounded-l-lg border-r border-gray-700"
                onClick={() => {
                  const val = Math.max(1, imageCount - 1);
                  setImageCount(val);
                  if (nodeId) updateNodeData(nodeId, { imageCount: val });
                }}
              >
                -
              </button>
              <span className="px-2">x{imageCount}</span>
              <button 
                className="px-2.5 h-full hover:bg-[#35353a] hover:text-white transition-colors rounded-r-lg border-l border-gray-700"
                onClick={() => {
                  const val = Math.min(4, imageCount + 1);
                  setImageCount(val);
                  if (nodeId) updateNodeData(nodeId, { imageCount: val });
                }}
              >
                +
              </button>
            </div>

            {/* Model/Style Dropdown */}
            <select 
              value={modelName} 
              onChange={(e) => {
                setModelName(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { modelName: e.target.value });
                  window.dispatchEvent(new Event('trigger-workspace-save'));
                }
              }}
              className="bg-[#2a2a2e] hover:bg-[#35353a] rounded-lg px-3 h-8 text-xs font-medium text-gray-300 focus:outline-none appearance-none cursor-pointer transition-colors"
            >
              <option value="nano-banana-pro-preview">Auto</option>
              <option value="imagen-3.0-generate-001">Imagen 3.0</option>
            </select>

            {/* Aspect Ratio Dropdown */}
            <select 
              value={aspectRatio} 
              onChange={(e) => {
                setAspectRatio(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { aspectRatio: e.target.value });
                  window.dispatchEvent(new Event('trigger-workspace-save'));
                }
              }}
              className="bg-[#2a2a2e] hover:bg-[#35353a] rounded-lg px-3 h-8 text-xs font-medium text-gray-300 focus:outline-none appearance-none cursor-pointer flex items-center gap-1 transition-colors"
            >
              <option value="1:1">⬜ 1:1</option>
              <option value="9:16">▯ 9:16</option>
              <option value="16:9">▭ 16:9</option>
              <option value="4:3">▭ 4:3</option>
            </select>

            {/* Settings Button */}
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-[#2a2a2e] transition-colors"
            >
              <Settings2 size={14} />
            </button>
          </div>

          {/* Generate (Play) Button */}
          <button 
            onClick={handleGenerate}
            disabled={data.isLoading}
            className="w-10 h-10 rounded-full bg-[#3f3f46] hover:bg-[#52525b] disabled:bg-[#2a2a2e] disabled:cursor-not-allowed flex items-center justify-center text-gray-200 hover:text-white transition-colors"
          >
            {data.isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" className="ml-1" />}
          </button>
        </div>
      </div>
      
      {mounted && isModalOpen && displayUrl && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 nodrag nopan">
          <button 
            onClick={() => setIsModalOpen(false)}
            className="absolute top-6 right-6 text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
          
          <div className="relative max-w-4xl max-h-[80vh] flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={displayUrl} 
              alt="Generated Full" 
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
            
            <button
              onClick={() => handleDownload(displayUrl)}
              className="mt-6 bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-colors shadow-lg"
            >
              <Download size={20} />
              Download Image
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


