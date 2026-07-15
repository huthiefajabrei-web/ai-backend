"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  NodeTypes,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { ChevronLeft, Share2, RefreshCw, User as UserIcon, MessageSquare, Headphones, Map, ChevronDown, Zap, Play, Coins, Loader2 } from 'lucide-react';

import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { apiGetMe, getStoredUser, type AppUser } from '@/lib/mysql/client';
import { isValidWorkspaceConnection, edgeStyleForConnection } from '@/lib/workspace/graphUtils';
import { WorkspaceEditorProvider, useWorkspaceEditor } from './WorkspaceEditorContext';

import FloatingToolbar from './FloatingToolbar';
import PromptNode from './nodes/PromptNode';
import ImageNode from './nodes/ImageNode';

const nodeTypes: NodeTypes = {
  promptNode: PromptNode,
  imageNode: ImageNode,
};

const initialNodes: any[] = [];
const initialEdges: Edge[] = [];

// ─────────────────────────────────────────────────────────────────────────────
function sanitizeForFirestore(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null)
      .map((item) => sanitizeForFirestore(item));
  }

  if (typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'imageB64') continue;
      if (k === 'isLoading') {
        cleaned[k] = false;
        continue;
      }
      cleaned[k] = sanitizeForFirestore(v);
    }
    return cleaned;
  }
  return value;
}

function sanitizeNodes(nodes: any[]): any[] {
  return nodes.map((node) => ({
    ...sanitizeForFirestore(node),
    data: sanitizeForFirestore(node.data ?? {}),
  }));
}
// ─────────────────────────────────────────────────────────────────────────────

function Flow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const spaceId = searchParams.get('spaceId');

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const reactFlowInstanceRef = useRef<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled space");
  const [activeTool, setActiveTool] = useState('cursor');
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const { runWorkflow } = useWorkspaceEditor();

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const userRef = useRef<User | null>(null);
  const isLoadedRef = useRef(false);
  const spaceIdRef = useRef(spaceId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { isLoadedRef.current = isLoaded; }, [isLoaded]);
  useEffect(() => { spaceIdRef.current = spaceId; }, [spaceId]);

  useEffect(() => {
    if (!spaceId) {
      router.push('/workspace');
    }
  }, [spaceId, router]);

  const triggerSave = useCallback(() => {
    if (!userRef.current || !isLoadedRef.current || !spaceIdRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        const currentNodes = reactFlowInstanceRef.current ? reactFlowInstanceRef.current.getNodes() : nodesRef.current;
        const currentEdges = reactFlowInstanceRef.current ? reactFlowInstanceRef.current.getEdges() : edgesRef.current;
        const cleanNodes = sanitizeNodes(currentNodes);
        const cleanEdges = sanitizeForFirestore(currentEdges);
        const userDocRef = doc(db, 'app_user_workspaces', userRef.current!.uid);
        await setDoc(
          userDocRef,
          { 
            spaces: {
              [spaceIdRef.current!]: {
                nodes: cleanNodes, 
                edges: cleanEdges, 
                updatedAt: new Date().toISOString() 
              }
            }
          },
          { merge: true },
        );
      } catch (err) {
        console.error('Error saving workspace:', err);
      }
    }, 1500);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const me = await apiGetMe();
        if (me && typeof me === 'object' && 'email' in me) setAppUser(me);
        else setAppUser(getStoredUser());
        if (spaceId) {
          try {
          const userDocRef = doc(db, 'app_user_workspaces', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.spaces && data.spaces[spaceId]) {
              const saved = data.spaces[spaceId];
              if (saved.name) setSpaceName(saved.name);
              if (saved.nodes?.length > 0) setNodes(sanitizeNodes(saved.nodes));
              if (saved.edges?.length > 0) setEdges(saved.edges);
            }
          }
        } catch (err) {
          console.error('Error loading workspace:', err);
        }
        }
      } else {
        setAppUser(null);
      }
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, [setNodes, setEdges, spaceId]);

  useEffect(() => {
    const onCredits = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setAppUser(detail);
    };
    window.addEventListener('workspace-credits-updated', onCredits);
    return () => window.removeEventListener('workspace-credits-updated', onCredits);
  }, []);

  useEffect(() => {
    const handleForceSave = () => triggerSave();
    window.addEventListener('trigger-workspace-save', handleForceSave);
    return () => window.removeEventListener('trigger-workspace-save', handleForceSave);
  }, [triggerSave]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      const hasStructural = changes.some((c) => c.type === 'remove' || c.type === 'add');
      if (hasStructural) triggerSave();
    },
    [onNodesChange, triggerSave],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const hasMutation = changes.some((c) => c.type === 'remove' || c.type === 'add');
      if (hasMutation) triggerSave();
    },
    [onEdgesChange, triggerSave],
  );

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (!isValidWorkspaceConnection(params)) return;
      const styledEdge = {
        ...params,
        ...edgeStyleForConnection(params),
      };
      setEdges((eds) => addEdge(styledEdge, eds));
      triggerSave();
    },
    [setEdges, triggerSave],
  );

  const handleRunWorkflow = useCallback(async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setIsRunningWorkflow(true);
    try {
      const currentNodes = reactFlowInstanceRef.current?.getNodes() ?? nodesRef.current;
      const currentEdges = reactFlowInstanceRef.current?.getEdges() ?? edgesRef.current;
      await runWorkflow(currentNodes, currentEdges);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunningWorkflow(false);
    }
  }, [user, router, runWorkflow]);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    triggerSave();
  }, [triggerSave]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let initialData: Record<string, any> = {};
      if (type === 'promptNode') {
        initialData = { prompt: '', perspective: 'Custom Scene' };
      } else if (type === 'imageNode') {
        initialData = { imageUrls: [], isLoading: false };
      }

      const newNode = { id: uuidv4(), type, position, data: initialData };
      setNodes((nds) => nds.concat(newNode));
      triggerSave();
    },
    [reactFlowInstance, setNodes, triggerSave],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (activeTool === 'scissors') {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        triggerSave();
      }
    },
    [activeTool, setEdges, triggerSave]
  );

  const addStarterWorkflow = useCallback(() => {
    if (!reactFlowInstance) return;
    const textId = uuidv4();
    const imageId = uuidv4();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const textPos = reactFlowInstance.screenToFlowPosition({ x: cx - 280, y: cy });
    const imagePos = reactFlowInstance.screenToFlowPosition({ x: cx + 120, y: cy });

    setNodes([
      {
        id: textId,
        type: 'promptNode',
        position: textPos,
        data: { prompt: '', perspective: 'Photorealistic Exterior' },
      },
      {
        id: imageId,
        type: 'imageNode',
        position: imagePos,
        data: { imageUrls: [], isLoading: false, aspectRatio: '16:9', imageCount: 1 },
      },
    ]);
    setEdges([
      {
        id: `e-${textId}-${imageId}`,
        source: textId,
        sourceHandle: 'text-out',
        target: imageId,
        targetHandle: 'text-in',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
      },
    ]);
    triggerSave();
  }, [reactFlowInstance, setNodes, setEdges, triggerSave]);

  const handleAddNode = useCallback(
    (type: string) => {
      if (!reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      let initialData: Record<string, any> = {};
      if (type === 'promptNode') {
        initialData = { prompt: '', perspective: 'Custom Scene' };
      } else if (type === 'imageNode') {
        initialData = { imageUrls: [], isLoading: false };
      }

      const newNode = { id: uuidv4(), type, position, data: initialData };
      setNodes((nds) => nds.concat(newNode));
      triggerSave();
    },
    [reactFlowInstance, setNodes, triggerSave],
  );

  if (!spaceId) return null;

  if (isLoaded && !user) {
    return (
      <div className="flex h-screen w-screen bg-[#09090b] items-center justify-center text-center p-8">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-display font-bold text-white">H_ARCH Flows</h1>
          <p className="text-zinc-400 text-sm">Sign in to save and run node workflows on your spaces.</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold"
          >
            Sign In
          </button>
          <button type="button" onClick={() => router.push('/workspace')} className="block mx-auto text-sm text-zinc-500 hover:text-white">
            ← Back to Spaces
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#09090b] overflow-hidden text-gray-200 font-sans relative">
      
      {/* Absolute Top Header Overlay */}
      <div className="absolute top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6 pointer-events-none">
        
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-4 pointer-events-auto">
          <button 
            onClick={() => router.push('/workspace')} 
            className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-400" />
          </button>
          
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-3 h-3 rounded-sm bg-orange-400"></div>
            <span className="text-gray-400 cursor-pointer hover:text-gray-200 transition-colors">Personal project</span>
            <span className="text-gray-600">/</span>
            <div className="flex items-center gap-2 text-white">
              <Zap size={14} className="text-purple-400" />
              <span>{spaceName}</span>
            </div>
          </div>
        </div>

        {/* Center: Run controls (Magnific-style) */}
        <div className="hidden lg:flex items-center gap-2 pointer-events-auto absolute left-1/2 -translate-x-1/2 top-3">
          <button
            type="button"
            disabled={isRunningWorkflow}
            onClick={handleRunWorkflow}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-purple-500/20"
          >
            {isRunningWorkflow ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
            Run Workflow
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {appUser && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 text-xs font-bold">
              <Coins size={14} />
              {appUser.credits ?? 0}
            </div>
          )}
          <span
            role="link"
            tabIndex={0}
            onClick={() => router.push('/#pricing')}
            onKeyDown={(e) => e.key === 'Enter' && router.push('/#pricing')}
            className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer mr-1 hidden sm:inline"
          >
            Pricing
          </span>

          <div className="flex items-center gap-2 mr-1 hidden md:flex">
            <Zap size={16} className="text-purple-400" />
            <span className="text-sm font-medium text-white">H_ARCH Flows</span>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold">Beta</span>
          </div>

          <button className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
            <UserIcon size={16} />
            Share
          </button>
          
          <button className="w-10 h-10 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors">
            <RefreshCw size={18} className="text-gray-400" />
          </button>
          
          <div className="w-10 h-10 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center overflow-hidden cursor-pointer">
             <UserIcon size={20} className="text-gray-300" />
          </div>
        </div>
      </div>

      {/* Floating Left Toolbar */}
      <FloatingToolbar 
        onAddNode={handleAddNode} 
        activeTool={activeTool} 
        onToolChange={setActiveTool} 
      />

      {/* Bottom Left Chip */}
      <div className="absolute bottom-6 left-6 z-50 pointer-events-auto">
        <div className="bg-[#1c1c1f] border border-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-white shadow-xl">
          <div className="w-4 h-4 border border-gray-500 rounded-sm"></div>
          Page 1
        </div>
      </div>

      {/* Bottom Right Tools */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-4 pointer-events-auto">
        <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
          <MessageSquare size={16} />
          Give feedback
        </button>
        <button className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors">
          <Headphones size={16} className="text-gray-400" />
        </button>
        <button className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors">
          <Map size={16} className="text-gray-400" />
        </button>
        <div className="flex items-center gap-1 text-sm font-medium text-gray-300">
          39% <ChevronDown size={14} className="text-gray-500" />
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="w-full h-full" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          isValidConnection={(c) => isValidWorkspaceConnection(c)}
          onEdgeClick={onEdgeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onInit={(instance) => {
            setReactFlowInstance(instance);
            reactFlowInstanceRef.current = instance;
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          className={`bg-[#09090b] ${activeTool === 'scissors' ? 'cutting-mode' : ''}`}
          defaultEdgeOptions={{ style: { stroke: '#4b5563', strokeWidth: 2 } }}
          connectionLineStyle={{ stroke: '#8b5cf6', strokeWidth: 2 }}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.2}
          maxZoom={2}
          panOnDrag={activeTool === 'cursor' || activeTool === 'hand'}
          selectionOnDrag={activeTool === 'cursor'}
        >
          <Background color="#2a2a2a" gap={20} size={1.5} variant={BackgroundVariant.Dots} />
          <Controls className="!hidden" /> {/* Hide default controls since we have custom zoom/pan */}
        </ReactFlow>
      </div>

      {/* Empty canvas starter */}
      {isLoaded && nodes.length === 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center bg-[#121214]/95 border border-white/10 backdrop-blur-xl rounded-2xl p-8 max-w-md shadow-2xl">
            <h2 className="text-xl font-display font-bold text-white mb-2">Build your workflow</h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Like Magnific Spaces: connect <strong className="text-purple-400">Text</strong> →{" "}
              <strong className="text-purple-400">Image Generator</strong>, then chain outputs to edit images.
            </p>
            <button
              type="button"
              onClick={addStarterWorkflow}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm"
            >
              Add starter workflow
            </button>
          </div>
        </div>
      )}

      {/* Desktop workflow hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none hidden lg:block">
        <div className="bg-[#121214]/90 border border-white/10 backdrop-blur-md px-4 py-2 rounded-full text-[11px] text-zinc-400 shadow-xl">
          <span className="text-purple-400 font-semibold">Text</span> → purple ·{" "}
          <span className="text-teal-400 font-semibold">Image</span> → teal · Chain outputs to edit &amp; regenerate
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .cutting-mode .react-flow__edge-path {
          cursor: crosshair !important;
          transition: stroke 0.2s, stroke-width 0.2s;
        }
        .cutting-mode .react-flow__edge:hover .react-flow__edge-path {
          stroke: #ef4444 !important;
          stroke-width: 4px !important;
        }
      `}} />
    </div>
  );
}

export default function Workspace() {
  return (
    <ReactFlowProvider>
      <WorkspaceEditorProvider>
        <Flow />
      </WorkspaceEditorProvider>
    </ReactFlowProvider>
  );
}
