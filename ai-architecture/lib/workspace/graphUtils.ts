import type { Connection, Edge, Node } from "@xyflow/react";

export type PortKind = "text" | "image";

export function portKindFromHandle(handleId?: string | null): PortKind | null {
  if (!handleId) return null;
  if (handleId.startsWith("text")) return "text";
  if (handleId.startsWith("image")) return "image";
  return null;
}

/** Magnific-style typed ports: text-out → text-in, image-out → image-in */
export function isValidWorkspaceConnection(connection: Connection | Edge): boolean {
  const sourceKind = portKindFromHandle(connection.sourceHandle);
  const targetKind = portKindFromHandle(connection.targetHandle);
  if (!sourceKind || !targetKind) return false;
  return sourceKind === targetKind;
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
    const isTextPort = targetHandle === "text-in";
    const isImagePort = targetHandle === "image-in";

    if (source.type === "promptNode" && (isTextPort || !targetHandle)) {
      textSourceIds.push(source.id);
      const chunk = String(source.data?.prompt || source.data?.label || "").trim();
      if (chunk) {
        promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
      }
      if (source.data?.perspective) {
        perspective = String(source.data.perspective);
      }
      if (isImagePort || targetHandle === "text-in") {
        const b64 = source.data?.compressedImageB64 || source.data?.imageB64;
        if (b64 && !referenceImageB64 && !referenceImageUrl) {
          referenceImageB64 = String(b64);
          referenceLabel = "Text node reference";
        }
      }
    }

    if (source.type === "imageNode" && isImagePort) {
      imageSourceIds.push(source.id);
      const url = getImageUrlFromNode(source);
      if (url) {
        referenceImageUrl = url;
        referenceImageB64 = undefined;
        referenceLabel = "Upstream image";
      }
    }

    if (source.type === "promptNode" && isImagePort) {
      imageSourceIds.push(source.id);
      const b64 = source.data?.compressedImageB64 || source.data?.imageB64;
      if (b64) {
        referenceImageB64 = String(b64);
        referenceImageUrl = undefined;
        referenceLabel = "Reference upload";
      }
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
  const kind = portKindFromHandle(connection.sourceHandle);
  return {
    animated: true,
    stroke: kind === "image" ? "#14b8a6" : "#8b5cf6",
    strokeWidth: 2,
  };
}
