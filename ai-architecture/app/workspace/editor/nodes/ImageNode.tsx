"use client";

import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Image as ImageIcon, Sparkles, Loader2, Settings2, LayoutTemplate, Download, X } from 'lucide-react';
import { useState, useEffect } from 'react';
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

export default function ImageNode({ data }: any) {
  const { getEdges, getNode, updateNodeData, setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const [error, setError] = useState<string | null>(null);

  // Local settings state — initialized from persisted node data
  const [modelName, setModelName] = useState(data.modelName || "nano-banana-pro-preview");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || "9:16");
  const [imageCount, setImageCount] = useState(data.imageCount || 1);
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
    const promptText = String(sourceNode?.data?.prompt || sourceNode?.data?.label || "");
    const imageB64 = sourceNode?.data?.imageB64 ? String(sourceNode?.data?.imageB64) : undefined;
    const perspectiveStyle = String(sourceNode?.data?.perspective || 'Custom Scene');

    if (!promptText && !imageB64) {
      setError("Prompt or Image is required!");
      return;
    }

    // 3. Set loading state
    updateNodeData(nodeId, { isLoading: true, imageUrls: [] });
    setShowSettings(false);

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
            await new Promise(resolve => setTimeout(resolve, 2000));
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
      setError(err.message || "Failed to generate image.");
      updateNodeData(nodeId, { isLoading: false });
      window.dispatchEvent(new Event('trigger-workspace-save'));
    }
  };

  const displayUrl = (data.imageUrls && data.imageUrls.length > 0) ? data.imageUrls[0] : data.imageUrl;

  return (
    <div className="bg-[#1c1c1f] border border-gray-800 rounded-xl p-4 shadow-2xl backdrop-blur-md transition-all w-[320px]">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-purple-500 border-2 border-[#1c1c1f]"
      />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-300">
          <ImageIcon size={16} className="text-purple-400" />
          <span className="font-medium text-sm">AI Generation</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2a2a2e] transition-colors"
          >
            <Settings2 size={14} />
          </button>
          <button 
            onClick={handleGenerate}
            disabled={data.isLoading}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold"
          >
            {data.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {data.isLoading ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mb-3 p-3 bg-[#141417] rounded-lg border border-gray-800 text-xs flex flex-col gap-3 nodrag nopan">
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 font-medium">Model</label>
            <select 
              value={modelName} 
              onChange={(e) => {
                setModelName(e.target.value);
                if (nodeId) {
                  updateNodeData(nodeId, { modelName: e.target.value });
                  window.dispatchEvent(new Event('trigger-workspace-save'));
                }
              }}
              className="bg-[#1c1c1f] border border-gray-700 rounded p-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
            >
              <option value="nano-banana-pro-preview">Nano Banana Pro</option>
              <option value="imagen-3.0-generate-001">Imagen 3.0</option>
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-gray-400 font-medium">Size (Ratio)</label>
              <select 
                value={aspectRatio} 
                onChange={(e) => {
                  setAspectRatio(e.target.value);
                  if (nodeId) {
                    updateNodeData(nodeId, { aspectRatio: e.target.value });
                    window.dispatchEvent(new Event('trigger-workspace-save'));
                  }
                }}
                className="bg-[#1c1c1f] border border-gray-700 rounded p-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
              >
                <option value="1:1">1:1 Square</option>
                <option value="9:16">9:16 Vertical</option>
                <option value="16:9">16:9 Landscape</option>
                <option value="4:3">4:3 Standard</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 w-20">
              <label className="text-gray-400 font-medium">Count</label>
              <input 
                type="number" 
                min="1" 
                max="4" 
                value={imageCount} 
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setImageCount(val);
                  if (nodeId) {
                    updateNodeData(nodeId, { imageCount: val });
                    window.dispatchEvent(new Event('trigger-workspace-save'));
                  }
                }}
                className="bg-[#1c1c1f] border border-gray-700 rounded p-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      )}
      
      <div className={`w-full bg-[#0f0f11] rounded-lg border border-dashed border-gray-700 flex items-center justify-center mt-2 relative overflow-hidden group ${displayUrl && !data.isLoading ? '' : 'h-48'}`}>
        {displayUrl && !data.isLoading ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img 
            src={displayUrl} 
            alt={`Generated`} 
            onClick={() => setIsModalOpen(true)}
            className={`w-full object-cover rounded-md transition-transform duration-500 hover:scale-105 cursor-pointer ${aspectRatio === '16:9' ? 'aspect-video' : aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[9/16]'}`} 
          />
        ) : (
          <div className="text-gray-500 flex flex-col items-center gap-2 p-4 text-center absolute">
            {data.isLoading ? (
              <div className="flex flex-col items-center gap-2 text-purple-400">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-xs">Creating magic...</span>
              </div>
            ) : error ? (
              <span className="text-xs text-red-400">{error}</span>
            ) : (
              <>
                <LayoutTemplate size={24} className="opacity-50" />
                <span className="text-xs">Connect a prompt and click generate</span>
              </>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-purple-500 border-2 border-[#1c1c1f]"
      />
      
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


