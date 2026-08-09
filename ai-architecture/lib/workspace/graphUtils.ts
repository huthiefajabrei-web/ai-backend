import type { Connection, Edge, Node } from "@xyflow/react";

/** Magnific data types for typed ports */
export type PortKind = "text" | "image";

export const PORT_COLORS: Record<PortKind, string> = {
  text: "#3b82f6", // blue — Magnific Text
  image: "#a855f7", // purple — Magnific Image
};

export function portKindFromHandle(handleId?: string | null): PortKind | null {
  if (!handleId) return null;
  if (handleId.startsWith("text")) return "text";
  if (handleId.startsWith("image")) return "image";
  return null;
}

export function wouldCreateCycle(
  nodes: Node[],
  edges: Edge[],
  connection: Connection | Edge,
): boolean {
  const source = connection.source;
  const target = connection.target;
  if (!source || !target || source === target) return true;

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  // hypothetical edge
  if (!adj.has(source)) adj.set(source, []);
  adj.get(source)!.push(target);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adj.get(id) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

/** Magnific-style: matching types, no self-loop, no cycles */
export function isValidWorkspaceConnection(
  connection: Connection | Edge,
  nodes: Node[] = [],
  edges: Edge[] = [],
): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const sourceKind = portKindFromHandle(connection.sourceHandle);
  const targetKind = portKindFromHandle(connection.targetHandle);
  if (!sourceKind || !targetKind) return false;
  if (sourceKind !== targetKind) return false;

  if (nodes.length && wouldCreateCycle(nodes, edges, connection)) return false;
  return true;
}

/**
 * Magnific rule: one connection per input port — replace the previous edge
 * on the same target + targetHandle.
 */
export function replaceInputEdge(edges: Edge[], newEdge: Edge): Edge[] {
  const filtered = edges.filter((e) => {
    if (e.target !== newEdge.target) return true;
    const a = e.targetHandle || null;
    const b = newEdge.targetHandle || null;
    return a !== b;
  });
  return [...filtered, newEdge];
}

export interface ResolvedImageInputs {
  promptText: string;
  perspective: string;
  referenceImageB64?: string;
  referenceImageUrl?: string;
  referenceLabel?: string;
  textSourceIds: string[];
  imageSourceIds: string[];
}

function getImageUrlFromNode(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  const urls = node.data?.imageUrls as string[] | undefined;
  if (urls?.[0]) return String(urls[0]);
  if (node.data?.imageUrl) return String(node.data.imageUrl);
  return undefined;
}

/** Walk incoming edges and merge text + image inputs (Magnific workflow resolution). */
export function resolveImageNodeInputs(
  nodeId: string,
  getNode: (id: string) => Node | undefined,
  getEdges: () => Edge[],
): ResolvedImageInputs {
  const incoming = getEdges().filter((e) => e.target === nodeId);

  let promptText = "";
  let perspective = "Custom Scene";
  let referenceImageB64: string | undefined;
  let referenceImageUrl: string | undefined;
  let referenceLabel: string | undefined;
  const textSourceIds: string[] = [];
  const imageSourceIds: string[] = [];

  for (const edge of incoming) {
    const source = getNode(edge.source);
    if (!source) continue;

    const targetHandle = edge.targetHandle || "";
    const isTextPort = targetHandle === "text-in" || targetHandle.startsWith("text");
    const isImagePort = targetHandle === "image-in" || targetHandle.startsWith("image");

    if (source.type === "promptNode" && isTextPort) {
      textSourceIds.push(source.id);
      const chunk = String(source.data?.prompt || source.data?.label || "").trim();
      if (chunk) {
        promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
      }
      if (source.data?.perspective) {
        perspective = String(source.data.perspective);
      }
    }

    if (isImagePort) {
      imageSourceIds.push(source.id);

      if (source.type === "imageNode") {
        const url = getImageUrlFromNode(source);
        if (url) {
          referenceImageUrl = url;
          referenceImageB64 = undefined;
          referenceLabel = "Upstream image";
        }
      }

      if (source.type === "promptNode") {
        const b64 = source.data?.compressedImageB64 || source.data?.imageB64;
        if (b64) {
          referenceImageB64 = String(b64);
          referenceImageUrl = undefined;
          referenceLabel = "Reference upload";
        }
      }
    }

    // Legacy edges without handles: prompt → image as text
    if (source.type === "promptNode" && !targetHandle) {
      textSourceIds.push(source.id);
      const chunk = String(source.data?.prompt || source.data?.label || "").trim();
      if (chunk) promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
      if (source.data?.perspective) perspective = String(source.data.perspective);
    }
  }

  return {
    promptText,
    perspective,
    referenceImageB64,
    referenceImageUrl,
    referenceLabel,
    textSourceIds,
    imageSourceIds,
  };
}

/** Topological order for image nodes (dependencies first) — Run Workflow. */
export function getImageNodeExecutionOrder(nodes: Node[], edges: Edge[]): string[] {
  const imageIds = nodes.filter((n) => n.type === "imageNode").map((n) => n.id);
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);

    for (const edge of edges.filter((e) => e.target === id)) {
      const src = nodes.find((n) => n.id === edge.source);
      if (src?.type === "imageNode") visit(src.id);
    }

    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const id of imageIds) visit(id);
  return order;
}

/** Downstream image nodes from a starting node (Run Downstream). */
export function getDownstreamImageNodes(startId: string, nodes: Node[], edges: Edge[]): string[] {
  const imageIds = new Set(nodes.filter((n) => n.type === "imageNode").map((n) => n.id));
  const result: string[] = [];
  const queue = [startId];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const edge of edges.filter((e) => e.source === current)) {
      if (imageIds.has(edge.target) && edge.target !== startId) {
        result.push(edge.target);
      }
      queue.push(edge.target);
    }
  }

  const all = [startId, ...result].filter((id) => imageIds.has(id));
  return getImageNodeExecutionOrder(
    nodes.filter((n) => all.includes(n.id)),
    edges.filter((e) => all.includes(e.source) && all.includes(e.target)),
  );
}

export function edgeStyleForConnection(connection: Connection | Edge) {
  const kind = portKindFromHandle(connection.sourceHandle) || "text";
  const stroke = PORT_COLORS[kind];
  return {
    animated: true,
    style: { stroke, strokeWidth: 2 },
  };
}

export type SpotlightNodeOption = {
  type: string;
  label: string;
  description: string;
  category: string;
  /** Which input handle to wire when placing from a source port */
  connectTargetHandle?: string;
  /** Which source handle to wire when placing from a target port */
  connectSourceHandle?: string;
  accepts: PortKind[];
  produces: PortKind[];
};

export const SPOTLIGHT_NODES: SpotlightNodeOption[] = [
  {
    type: "promptNode",
    label: "Text",
    description: "Write prompts and feed them to generators",
    category: "Text",
    connectSourceHandle: "text-out",
    accepts: [],
    produces: ["text", "image"],
  },
  {
    type: "imageNode",
    label: "Image Generator",
    description: "Generate images from text and/or reference images",
    category: "Image",
    connectTargetHandle: "text-in",
    accepts: ["text", "image"],
    produces: ["image"],
  },
];

/** Filter spotlight by the port you dragged from (Magnific port-connection mode). */
export function filterSpotlightForPort(
  options: SpotlightNodeOption[],
  fromHandle: string | null | undefined,
  fromHandleType: "source" | "target" | null,
): SpotlightNodeOption[] {
  const kind = portKindFromHandle(fromHandle);
  if (!kind || !fromHandleType) return options;

  if (fromHandleType === "source") {
    // Dragging FROM an output → need nodes that ACCEPT this kind
    return options
      .filter((o) => o.accepts.includes(kind))
      .map((o) => ({
        ...o,
        connectTargetHandle: kind === "text" ? "text-in" : "image-in",
      }));
  }

  // Dragging FROM an input → need nodes that PRODUCE this kind
  return options
    .filter((o) => o.produces.includes(kind))
    .map((o) => ({
      ...o,
      connectSourceHandle: kind === "text" ? "text-out" : "image-out",
    }));
}
