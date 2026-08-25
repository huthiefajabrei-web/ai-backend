"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { v4 as uuidv4 } from "uuid";
import {
  ChevronLeft,
  RefreshCw,
  User as UserIcon,
  MessageSquare,
  Headphones,
  Map,
  ChevronDown,
  Zap,
  Play,
  Coins,
  Loader2,
} from "lucide-react";

import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { apiGetMe, getStoredUser, type AppUser } from "@/lib/mysql/client";
import {
  isValidWorkspaceConnection,
  edgeStyleForConnection,
  replaceInputEdge,
  SPOTLIGHT_NODES,
  filterSpotlightForPort,
  nextCreationNumber,
  compressImageFile,
  saveCreationImage,
  ensureLinkedImageGenerator,
  type SpotlightNodeOption,
  PORT_COLORS,
} from "@/lib/workspace/graphUtils";
import { WorkspaceEditorProvider, useWorkspaceEditor } from "./WorkspaceEditorContext";

import FloatingToolbar from "./FloatingToolbar";
import Spotlight from "./Spotlight";
import PromptNode from "./nodes/PromptNode";
import ImageNode from "./nodes/ImageNode";
import CreationNode from "./nodes/CreationNode";

const nodeTypes: NodeTypes = {
  promptNode: PromptNode,
  imageNode: ImageNode,
  creationNode: CreationNode,
};

const initialNodes: any[] = [];
const initialEdges: Edge[] = [];

function sanitizeForFirestore(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null)
      .map((item) => sanitizeForFirestore(item));
  }

  if (typeof value === "object") {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === "imageB64" || k === "compressedImageB64" || k === "localRefs" || k === "previewUrl") continue;
      if (k === "isLoading") {
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

function initialDataForType(type: string, extras?: Record<string, any>): Record<string, any> {
  if (type === "promptNode") {
    return {
      prompt: "",
      perspective: "Custom Scene",
      imageCount: 1,
      aspectRatio: "16:9",
      modelName: "nano-banana-pro-preview",
      ...extras,
    };
  }
  if (type === "imageNode") {
    return {
      imageUrls: [],
      isLoading: false,
      aspectRatio: "16:9",
      imageCount: 1,
      perspective: "Custom Scene",
      ...extras,
    };
  }
  if (type === "creationNode") {
    return { label: "Creation #1", creationNumber: 1, hasImage: false, ...extras };
  }
  return { ...extras };
}

type PendingConnect = {
  fromNodeId: string;
  fromHandleId: string | null;
  fromHandleType: "source" | "target";
  screen: { x: number; y: number };
};

function Flow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const spaceId = searchParams.get("spaceId");

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const reactFlowInstanceRef = useRef<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled space");
  const [activeTool, setActiveTool] = useState("cursor");
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const { runWorkflow, waitForRunner } = useWorkspaceEditor();

  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightOptions, setSpotlightOptions] = useState(SPOTLIGHT_NODES);
  const [spotlightPos, setSpotlightPos] = useState<{ x: number; y: number } | null>(null);
  const [spotlightTitle, setSpotlightTitle] = useState("Add a node");
  const pendingConnectRef = useRef<PendingConnect | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const pendingAssetConnectRef = useRef<PendingConnect | null>(null);
  const pendingAssetPositionRef = useRef<{ x: number; y: number } | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const userRef = useRef<User | null>(null);
  const isLoadedRef = useRef(false);
  const spaceIdRef = useRef(spaceId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);
  useEffect(() => {
    spaceIdRef.current = spaceId;
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) router.push("/workspace");
  }, [spaceId, router]);

  const triggerSave = useCallback(() => {
    if (!userRef.current || !isLoadedRef.current || !spaceIdRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        const currentNodes = reactFlowInstanceRef.current
          ? reactFlowInstanceRef.current.getNodes()
          : nodesRef.current;
        const currentEdges = reactFlowInstanceRef.current
          ? reactFlowInstanceRef.current.getEdges()
          : edgesRef.current;
        const cleanNodes = sanitizeNodes(currentNodes);
        const cleanEdges = sanitizeForFirestore(currentEdges);
        const userDocRef = doc(db, "app_user_workspaces", userRef.current!.uid);
        await setDoc(
          userDocRef,
          {
            spaces: {
              [spaceIdRef.current!]: {
                nodes: cleanNodes,
                edges: cleanEdges,
                updatedAt: new Date().toISOString(),
              },
            },
          },
          { merge: true },
        );
      } catch (err) {
        console.error("Error saving workspace:", err);
      }
    }, 1500);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const me = await apiGetMe();
        if (me && typeof me === "object" && "email" in me) setAppUser(me);
        else setAppUser(getStoredUser());
        if (spaceId) {
          try {
            const userDocRef = doc(db, "app_user_workspaces", currentUser.uid);
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
            console.error("Error loading workspace:", err);
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
    window.addEventListener("workspace-credits-updated", onCredits);
    return () => window.removeEventListener("workspace-credits-updated", onCredits);
  }, []);

  useEffect(() => {
    const handleForceSave = () => triggerSave();
    window.addEventListener("trigger-workspace-save", handleForceSave);
    return () => window.removeEventListener("trigger-workspace-save", handleForceSave);
  }, [triggerSave]);

  const openSpotlight = useCallback(
    (opts?: {
      options?: SpotlightNodeOption[];
      position?: { x: number; y: number } | null;
      title?: string;
      pending?: PendingConnect | null;
    }) => {
      pendingConnectRef.current = opts?.pending ?? null;
      setSpotlightOptions(opts?.options ?? SPOTLIGHT_NODES);
      setSpotlightPos(opts?.position ?? null);
      setSpotlightTitle(opts?.title ?? "Add a node");
      setSpotlightOpen(true);
    },
    [],
  );

  const closeSpotlight = useCallback(() => {
    setSpotlightOpen(false);
    pendingConnectRef.current = null;
  }, []);

  // Magnific Spotlight: Space or /
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (typing) return;

      if (e.key === "/" || (e.code === "Space" && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        openSpotlight({
          options: SPOTLIGHT_NODES,
          position: null,
          title: "Add a node",
          pending: null,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSpotlight]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      const hasStructural = changes.some((c) => c.type === "remove" || c.type === "add");
      if (hasStructural) triggerSave();
    },
    [onNodesChange, triggerSave],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const hasMutation = changes.some((c) => c.type === "remove" || c.type === "add");
      if (hasMutation) triggerSave();
    },
    [onEdgesChange, triggerSave],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      if (!isValidWorkspaceConnection(params, currentNodes, currentEdges)) return;

      const id = `e-${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}-${Date.now()}`;
      const newEdge: Edge = {
        id,
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        ...edgeStyleForConnection(params),
      };

      setEdges((eds) => replaceInputEdge(eds, newEdge));
      triggerSave();
    },
    [setEdges, triggerSave],
  );

  /** Magnific: drag from a port into empty canvas → Spotlight filtered by type */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: any) => {
      if (connectionState?.isValid) return;
      if (!connectionState?.fromNode || !reactFlowInstanceRef.current) return;

      const fromHandle = connectionState.fromHandle;
      const fromHandleId = fromHandle?.id ?? null;
      const fromHandleType = (fromHandle?.type as "source" | "target" | undefined) ?? null;
      if (!fromHandleType) return;

      // Only open spotlight when dropped on empty space (not on another handle)
      const target = (event as MouseEvent).target as Element | null;
      const droppedOnPane =
        !!target?.classList?.contains("react-flow__pane") ||
        !!target?.closest?.(".react-flow__pane");

      if (!droppedOnPane && connectionState.toNode) return;

      const clientX = "changedTouches" in event ? event.changedTouches[0].clientX : event.clientX;
      const clientY = "changedTouches" in event ? event.changedTouches[0].clientY : event.clientY;

      const filtered = filterSpotlightForPort(SPOTLIGHT_NODES, fromHandleId, fromHandleType);
      if (!filtered.length) return;

      openSpotlight({
        options: filtered,
        position: { x: clientX, y: clientY },
        title: "Compatible nodes",
        pending: {
          fromNodeId: connectionState.fromNode.id,
          fromHandleId,
          fromHandleType,
          screen: { x: clientX, y: clientY },
        },
      });
    },
    [openSpotlight],
  );

  const createCreationNodesFromFiles = useCallback(
    async (files: FileList | File[], position?: { x: number; y: number }, pending?: PendingConnect | null) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) return;

      const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
      if (!list.length) {
        alert("Please choose an image file (JPG, PNG, or WebP).");
        return;
      }

      const basePos =
        position ||
        instance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

      // Auto-wire target: pending port, else selected Image Generator / Text
      let connectTargetId: string | null = null;
      let connectTargetHandle = "image-in";
      if (pending?.fromHandleType === "target" && pending.fromHandleId?.startsWith("image")) {
        connectTargetId = pending.fromNodeId;
        connectTargetHandle = pending.fromHandleId || "image-in";
      } else if (pending?.fromHandleType === "source" && pending.fromHandleId?.startsWith("image")) {
        // Dragging from an image output into empty → Assets: Creation becomes source; wire later manually
        connectTargetId = null;
      } else {
        const selected = nodesRef.current.filter(
          (n) => n.selected && (n.type === "imageNode" || n.type === "promptNode"),
        );
        if (selected.length === 1) {
          connectTargetId = selected[0].id;
          connectTargetHandle = "image-in";
        }
      }

      let number = nextCreationNumber(nodesRef.current);
      const newNodes: any[] = [];
      const newEdges: Edge[] = [];

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const id = uuidv4();
        const creationNumber = number++;
        try {
          const b64 = await compressImageFile(file, 1024, 0.8);
          saveCreationImage(id, b64);

          const img = await new Promise<{ w: number; h: number }>((resolve) => {
            const el = new window.Image();
            el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight });
            el.onerror = () => resolve({ w: 1024, h: 1024 });
            el.src = b64;
          });

          newNodes.push({
            id,
            type: "creationNode",
            position: { x: basePos.x + i * 320, y: basePos.y + (i % 2) * 40 },
            data: {
              label: `Creation #${creationNumber}`,
              creationNumber,
              hasImage: true,
              previewUrl: b64,
              width: img.w,
              height: img.h,
            },
          });

          if (connectTargetId) {
            const connection: Connection = {
              source: id,
              sourceHandle: "image-out",
              target: connectTargetId,
              targetHandle: connectTargetHandle,
            };
            const allNodes = [...nodesRef.current, ...newNodes];
            if (isValidWorkspaceConnection(connection, allNodes, [...edgesRef.current, ...newEdges])) {
              newEdges.push({
                id: `e-${id}-${connectTargetId}-image-${Date.now()}-${i}`,
                source: id,
                target: connectTargetId,
                sourceHandle: "image-out",
                targetHandle: connectTargetHandle,
                ...edgeStyleForConnection(connection),
              });
            }
          }
        } catch (err) {
          console.error("Failed to import asset", err);
          alert("Failed to import image. Try a smaller JPG/PNG file.");
        }
      }

      if (newNodes.length) {
        setNodes((nds) => nds.concat(newNodes));
        if (newEdges.length) {
          setEdges((eds) => {
            let next = eds;
            for (const e of newEdges) next = replaceInputEdge(next, e);
            return next;
          });
        }
        // Fit view lightly toward new nodes
        requestAnimationFrame(() => {
          try {
            instance.fitView({ nodes: newNodes.map((n) => ({ id: n.id })), padding: 0.4, duration: 300 });
          } catch {
            /* ignore */
          }
        });
        triggerSave();
      }
    },
    [setNodes, setEdges, triggerSave],
  );

  const openAssetPicker = useCallback((pending?: PendingConnect | null, position?: { x: number; y: number } | null) => {
    pendingAssetConnectRef.current = pending ?? null;
    pendingAssetPositionRef.current = position ?? null;
    assetFileInputRef.current?.click();
  }, []);

  const placeNodeFromSpotlight = useCallback(
    (option: SpotlightNodeOption) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) return;

      const pending = pendingConnectRef.current;
      const screen = pending?.screen ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };

      const position = instance.screenToFlowPosition({
        x: screen.x + (pending ? 40 : 0),
        y: screen.y,
      });

      // Magnific: Assets / Upload → file picker → Creation node(s)
      if (option.type === "creationNode") {
        closeSpotlight();
        openAssetPicker(pending, position);
        return;
      }

      const newId = uuidv4();
      const extras =
        option.type === "creationNode"
          ? {
              creationNumber: nextCreationNumber(nodesRef.current),
              label: `Creation #${nextCreationNumber(nodesRef.current)}`,
            }
          : undefined;

      const newNode = {
        id: newId,
        type: option.type,
        position,
        data: initialDataForType(option.type, extras),
      };

      setNodes((nds) => nds.concat(newNode));

      if (pending) {
        let connection: Connection | null = null;

        if (pending.fromHandleType === "source") {
          const targetHandle =
            option.connectTargetHandle ||
            (pending.fromHandleId?.startsWith("image") ? "image-in" : "text-in");
          connection = {
            source: pending.fromNodeId,
            sourceHandle: pending.fromHandleId,
            target: newId,
            targetHandle,
          };
        } else {
          const sourceHandle =
            option.connectSourceHandle ||
            (pending.fromHandleId?.startsWith("image") ? "image-out" : "text-out");
          connection = {
            source: newId,
            sourceHandle,
            target: pending.fromNodeId,
            targetHandle: pending.fromHandleId,
          };
        }

        const allNodes = [...nodesRef.current, newNode];
        if (isValidWorkspaceConnection(connection, allNodes, edgesRef.current)) {
          const edge: Edge = {
            id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
            ...connection,
            source: connection.source!,
            target: connection.target!,
            ...edgeStyleForConnection(connection),
          };
          setEdges((eds) => replaceInputEdge(eds, edge));
        }
      }

      closeSpotlight();
      triggerSave();
    },
    [setNodes, setEdges, closeSpotlight, triggerSave, openAssetPicker],
  );

  const handleRunWorkflow = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsRunningWorkflow(true);
    try {
      let currentNodes = reactFlowInstanceRef.current?.getNodes() ?? nodesRef.current;
      let currentEdges = reactFlowInstanceRef.current?.getEdges() ?? edgesRef.current;

      // Magnific: images only come from Image Generator — auto-wire if missing
      if (!currentNodes.some((n: { type?: string }) => n.type === "imageNode")) {
        const seed =
          currentNodes.find((n: { type?: string }) => n.type === "promptNode") ||
          currentNodes.find((n: { type?: string }) => n.type === "creationNode");
        if (seed) {
          const ensured = ensureLinkedImageGenerator(
            seed.id,
            currentNodes,
            currentEdges,
            uuidv4(),
          );
          if (ensured.created) {
            setNodes(ensured.nodes);
            setEdges(ensured.edges);
            currentNodes = ensured.nodes;
            currentEdges = ensured.edges;
            triggerSave();
            await waitForRunner(ensured.imageNodeId);
          }
        }
      }

      await runWorkflow(currentNodes, currentEdges);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunningWorkflow(false);
    }
  }, [user, router, runWorkflow, waitForRunner, setNodes, setEdges, triggerSave]);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    triggerSave();
  }, [triggerSave]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = { id: uuidv4(), type, position, data: initialDataForType(type) };
      setNodes((nds) => nds.concat(newNode));
      triggerSave();
    },
    [reactFlowInstance, setNodes, triggerSave],
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (activeTool === "scissors") {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        triggerSave();
      }
    },
    [activeTool, setEdges, triggerSave],
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
        type: "promptNode",
        position: textPos,
        data: {
          prompt: "",
          perspective: "Photorealistic Exterior",
          imageCount: 1,
          aspectRatio: "16:9",
          modelName: "nano-banana-pro-preview",
        },
      },
      {
        id: imageId,
        type: "imageNode",
        position: imagePos,
        data: { imageUrls: [], isLoading: false, aspectRatio: "16:9", imageCount: 1, perspective: "Custom Scene" },
      },
    ]);
    setEdges([
      {
        id: `e-${textId}-${imageId}`,
        source: textId,
        sourceHandle: "text-out",
        target: imageId,
        targetHandle: "text-in",
        animated: true,
        style: { stroke: PORT_COLORS.text, strokeWidth: 2 },
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

      if (type === "creationNode" || type === "assets" || type === "upload") {
        openAssetPicker(null, position);
        return;
      }

      const extras =
        type === "creationNode"
          ? {
              creationNumber: nextCreationNumber(nodesRef.current),
              label: `Creation #${nextCreationNumber(nodesRef.current)}`,
            }
          : undefined;

      setNodes((nds) =>
        nds.concat({ id: uuidv4(), type, position, data: initialDataForType(type, extras) }),
      );
      triggerSave();
    },
    [reactFlowInstance, setNodes, triggerSave, openAssetPicker],
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
            onClick={() => router.push("/login")}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-700 to-yellow-600 text-white font-semibold"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => router.push("/workspace")}
            className="block mx-auto text-sm text-zinc-500 hover:text-white"
          >
            ← Back to Spaces
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#09090b] overflow-hidden text-gray-200 font-sans relative">
      <input
        ref={assetFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            void createCreationNodesFromFiles(
              files,
              pendingAssetPositionRef.current || undefined,
              pendingAssetConnectRef.current,
            );
          }
          pendingAssetConnectRef.current = null;
          pendingAssetPositionRef.current = null;
          e.target.value = "";
        }}
      />

      <div className="absolute top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6 pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <button
            type="button"
            onClick={() => router.push("/workspace")}
            className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-400" />
          </button>

          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-3 h-3 rounded-sm bg-orange-400" />
            <span className="text-gray-400">Personal project</span>
            <span className="text-gray-600">/</span>
            <div className="flex items-center gap-2 text-white">
              <Zap size={14} className="text-amber-500" />
              <span>{spaceName}</span>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 pointer-events-auto absolute left-1/2 -translate-x-1/2 top-3">
          <button
            type="button"
            disabled={isRunningWorkflow}
            onClick={handleRunWorkflow}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-700 to-yellow-600 hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-amber-600/20"
          >
            {isRunningWorkflow ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
            Run Workflow
          </button>
        </div>

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
            onClick={() => router.push("/#pricing")}
            onKeyDown={(e) => e.key === "Enter" && router.push("/#pricing")}
            className="text-sm font-medium text-amber-500 hover:text-amber-300 transition-colors cursor-pointer mr-1 hidden sm:inline"
          >
            Pricing
          </span>

          <div className="flex items-center gap-2 mr-1 hidden md:flex">
            <Zap size={16} className="text-amber-500" />
            <span className="text-sm font-medium text-white">H_ARCH Flows</span>
            <span className="text-[10px] bg-amber-600/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
              Beta
            </span>
          </div>

          <button
            type="button"
            className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <UserIcon size={16} />
            Share
          </button>

          <button
            type="button"
            className="w-10 h-10 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors"
          >
            <RefreshCw size={18} className="text-gray-400" />
          </button>

          <div className="w-10 h-10 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center overflow-hidden cursor-pointer">
            <UserIcon size={20} className="text-gray-300" />
          </div>
        </div>
      </div>

      <FloatingToolbar onAddNode={handleAddNode} activeTool={activeTool} onToolChange={setActiveTool} />

      <div className="absolute bottom-6 left-6 z-50 pointer-events-auto">
        <div className="bg-[#1c1c1f] border border-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-white shadow-xl">
          <div className="w-4 h-4 border border-gray-500 rounded-sm" />
          Page 1
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-4 pointer-events-auto">
        <button
          type="button"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
        >
          <MessageSquare size={16} />
          Give feedback
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors"
        >
          <Headphones size={16} className="text-gray-400" />
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-[#1c1c1f] border border-gray-800 flex items-center justify-center hover:bg-[#252529] transition-colors"
        >
          <Map size={16} className="text-gray-400" />
        </button>
        <div className="flex items-center gap-1 text-sm font-medium text-gray-300">
          39% <ChevronDown size={14} className="text-gray-500" />
        </div>
      </div>

      <div className="w-full h-full" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) =>
            isValidWorkspaceConnection(c, nodesRef.current, edgesRef.current)
          }
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
          className={`bg-[#09090b] ${activeTool === "scissors" ? "cutting-mode" : ""}`}
          defaultEdgeOptions={{ style: { stroke: "#4b5563", strokeWidth: 2 } }}
          connectionLineStyle={{ stroke: PORT_COLORS.text, strokeWidth: 2 }}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.2}
          maxZoom={2}
          panOnDrag={activeTool === "cursor" || activeTool === "hand"}
          selectionOnDrag={activeTool === "cursor"}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background color="#2a2a2a" gap={20} size={1.5} variant={BackgroundVariant.Dots} />
          <Controls className="!hidden" />
        </ReactFlow>
      </div>

      {isLoaded && nodes.length === 0 && !spotlightOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center bg-[#121214]/95 border border-white/10 backdrop-blur-xl rounded-2xl p-8 max-w-md shadow-2xl">
            <h2 className="text-xl font-display font-bold text-white mb-2">Build your workflow</h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Connect <span className="text-blue-400 font-semibold">Text</span> →{" "}
              <span className="text-amber-500 font-semibold">Image Generator</span>. Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px]">Space</kbd> or{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px]">/</kbd> for Spotlight.
            </p>
            <button
              type="button"
              onClick={addStarterWorkflow}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-700 to-yellow-600 text-white font-semibold text-sm"
            >
              Add starter workflow
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none hidden lg:block">
        <div className="bg-[#121214]/90 border border-white/10 backdrop-blur-md px-4 py-2 rounded-full text-[11px] text-zinc-400 shadow-xl">
          Magnific flow:{" "}
          <span className="text-zinc-200">Assets → Text → Image Generator</span>
          {" "}· images are produced on Image Generator · Run auto-adds it if missing
        </div>
      </div>

      <Spotlight
        open={spotlightOpen}
        options={spotlightOptions}
        title={spotlightTitle}
        position={spotlightPos}
        onClose={closeSpotlight}
        onSelect={placeNodeFromSpotlight}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .cutting-mode .react-flow__edge-path {
          cursor: crosshair !important;
          transition: stroke 0.2s, stroke-width 0.2s;
        }
        .cutting-mode .react-flow__edge:hover .react-flow__edge-path {
          stroke: #ef4444 !important;
          stroke-width: 4px !important;
        }
        .react-flow__handle { z-index: 5; }
      `,
        }}
      />
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
