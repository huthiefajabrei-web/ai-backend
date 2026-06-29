"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import Sidebar from './Sidebar';
import PromptNode from './nodes/PromptNode';
import ImageNode from './nodes/ImageNode';

const nodeTypes: NodeTypes = {
  promptNode: PromptNode,
  imageNode: ImageNode,
  // we can add upscaleNode and uploadNode later
};

const initialNodes = [
  {
    id: '1',
    type: 'promptNode',
    data: { label: 'A cinematic shot of a futuristic city...' },
    position: { x: 250, y: 150 },
  },
  {
    id: '2',
    type: 'imageNode',
    data: { imageUrl: null },
    position: { x: 700, y: 100 },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
];

let id = 0;
const getId = () => `dndnode_${id++}`;

function Flow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load user & workspace
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'app_user_workspaces', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.nodes && data.nodes.length > 0) setNodes(data.nodes);
            if (data.edges && data.edges.length > 0) setEdges(data.edges);
          }
        } catch (error) {
          console.error("Error loading workspace:", error);
        }
      }
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, [setNodes, setEdges]);

  // Save workspace on changes (debounced)
  useEffect(() => {
    if (!user || !isLoaded) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'app_user_workspaces', user.uid);
        await setDoc(docRef, {
          nodes: nodes,
          edges: edges,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Error saving workspace:", error);
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, user, isLoaded]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      // Style the edge
      const styledEdge = {
        ...params,
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 }
      };
      setEdges((eds) => addEdge(styledEdge, eds));
    },
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      
      <div className="flex-grow h-full relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0a0a0c]"
          defaultEdgeOptions={{
            style: { stroke: '#4b5563', strokeWidth: 2 },
          }}
        >
          <Background color="#1f2937" gap={24} size={2} />
          <Controls className="bg-[#1c1c1f] border-gray-800 fill-white text-gray-300" />
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
