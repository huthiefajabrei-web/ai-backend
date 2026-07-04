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
import { ChevronLeft, Share2, RefreshCw, User as UserIcon, MessageSquare, Headphones, Map, ChevronDown, Zap } from 'lucide-react';

import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled space");

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
        const cleanNodes = sanitizeNodes(nodesRef.current);
        const cleanEdges = sanitizeForFirestore(edgesRef.current);
        const docRef = doc(db, 'app_user_workspaces', userRef.current!.uid, 'spaces', spaceIdRef.current!);
        await setDoc(
          docRef,
          { nodes: cleanNodes, edges: cleanEdges, updatedAt: new Date().toISOString() },
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
      if (currentUser && spaceId) {
        try {
          const docRef = doc(db, 'app_user_workspaces', currentUser.uid, 'spaces', spaceId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const saved = docSnap.data();
            if (saved.name) setSpaceName(saved.name);
            if (saved.nodes?.length > 0) setNodes(sanitizeNodes(saved.nodes));
            if (saved.edges?.length > 0) setEdges(saved.edges);
          }
        } catch (err) {
          console.error('Error loading workspace:', err);
        }
      }
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, [setNodes, setEdges, spaceId]);

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
      const styledEdge = {
        ...params,
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(styledEdge, eds));
      triggerSave();
    },
    [setEdges, triggerSave],
  );

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

  return (
    <div className="flex h-screen w-screen bg-[#111111] overflow-hidden text-gray-200 font-sans relative">
      
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
              <Zap size={14} className="text-gray-400" />
              <span>{spaceName}</span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 pointer-events-auto">
          <span className="text-sm font-medium text-[#ff2e93] hover:text-[#ff56a5] transition-colors cursor-pointer mr-2">Pricing</span>
          
          <div className="flex items-center gap-2 mr-2">
            <Zap size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-white">Flows</span>
            <span className="text-[10px] bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded font-bold">Beta</span>
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
      <FloatingToolbar onAddNode={handleAddNode} />

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
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#111111]"
          defaultEdgeOptions={{ style: { stroke: '#4b5563', strokeWidth: 2 } }}
        >
          {/* Using dotted background to match screenshot */}
          <Background color="#2a2a2a" gap={20} size={1.5} variant={BackgroundVariant.Dots} />
          <Controls className="!hidden" /> {/* Hide default controls since we have custom zoom/pan */}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function Workspace() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
