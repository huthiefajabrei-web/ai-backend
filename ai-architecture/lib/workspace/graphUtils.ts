import type { Connection, Edge, Node } from "@xyflow/react";

/** Magnific data types for typed ports */
export type PortKind = "text" | "image";

export const PORT_COLORS: Record<PortKind, string> = {
  text: "#3b82f6",
  image: "#a855f7",
};

/** Max reference images per Image Generator (Magnific models typically allow 4–14) */
export const MAX_REFERENCE_IMAGES = 8;

export function portKindFromHandle(handleId?: string | null): PortKind | null {
  if (!handleId) return null;
  if (handleId.startsWith("text")) return "text";
  if (handleId.startsWith("image")) return "image";
  return null;
}

/** Image reference port accepts multiple connections (Magnific Reference input). */
export function isMultiInputHandle(handleId?: string | null): boolean {
  return handleId === "image-in";
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

  // Cap multi-reference connections
  if (isMultiInputHandle(connection.targetHandle)) {
    const existing = edges.filter(
      (e) =>
        e.target === connection.target &&
        (e.targetHandle || null) === (connection.targetHandle || null) &&
        !(e.source === connection.source && e.sourceHandle === connection.sourceHandle),
    );
    if (existing.length >= MAX_REFERENCE_IMAGES) return false;
  }

  if (nodes.length && wouldCreateCycle(nodes, edges, connection)) return false;
  return true;
}

/**
 * Text / single ports: replace previous edge.
 * Image reference port: allow multiple (append; skip exact duplicate).
 */
export function replaceInputEdge(edges: Edge[], newEdge: Edge): Edge[] {
  if (isMultiInputHandle(newEdge.targetHandle)) {
    const duplicate = edges.some(
      (e) =>
        e.source === newEdge.source &&
        e.target === newEdge.target &&
        (e.sourceHandle || null) === (newEdge.sourceHandle || null) &&
        (e.targetHandle || null) === (newEdge.targetHandle || null),
    );
    if (duplicate) return edges;
    const onPort = edges.filter(
      (e) => e.target === newEdge.target && (e.targetHandle || null) === (newEdge.targetHandle || null),
    );
    if (onPort.length >= MAX_REFERENCE_IMAGES) return edges;
    return [...edges, newEdge];
  }

  const filtered = edges.filter((e) => {
    if (e.target !== newEdge.target) return true;
    const a = e.targetHandle || null;
    const b = newEdge.targetHandle || null;
    return a !== b;
  });
  return [...filtered, newEdge];
}

export type WorkspaceReference = {
  id: string;
  index: number;
  /** Display name: Image 1 */
  name: string;
  /** Mention token: @Image1 */
  mention: string;
  source: "upload" | "edge";
  sourceNodeId?: string;
  thumb?: string;
  b64?: string;
  url?: string;
};

export interface ResolvedImageInputs {
  promptText: string;
  perspective: string;
  /** @deprecated use references[0] */
  referenceImageB64?: string;
  /** @deprecated use references[0] */
  referenceImageUrl?: string;
  referenceLabel?: string;
  references: WorkspaceReference[];
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

export type LocalRefStored = {
  id: string;
  b64: string;
};

export function loadLocalRefs(nodeId: string): LocalRefStored[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`ws_refs_${nodeId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r?.b64) : [];
  } catch {
    return [];
  }
}

export function saveLocalRefs(nodeId: string, refs: LocalRefStored[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`ws_refs_${nodeId}`, JSON.stringify(refs));
}

/** Expand @Image1 / @Image 1 → Image 1 for the model */
export function expandImageMentions(prompt: string): string {
  return prompt
    .replace(/@Image\s*(\d+)/gi, "Image $1")
    .replace(/@img\s*(\d+)/gi, "Image $1");
}

/** Build prompt prefix so the model knows how numbered references map */
export function buildReferenceAwarePrompt(
  userPrompt: string,
  references: WorkspaceReference[],
): string {
  const body = expandImageMentions(userPrompt).trim();
  if (!references.length) return body;

  const legend = references
    .map((r) => `${r.name} = attached reference #${r.index}`)
    .join("; ");

  const instruction =
    `You are given ${references.length} reference image(s) labeled ${references.map((r) => r.name).join(", ")}. ` +
    `When the prompt mentions Image N or @ImageN, use that numbered reference. Mapping: ${legend}.`;

  return body ? `${instruction}\n\n${body}` : instruction;
}

/** Walk incoming edges + local uploads → numbered references (Magnific-style). */
export function resolveImageNodeInputs(
  nodeId: string,
  getNode: (id: string) => Node | undefined,
  getEdges: () => Edge[],
): ResolvedImageInputs {
  const node = getNode(nodeId);
  const incoming = getEdges().filter((e) => e.target === nodeId);

  let promptText = "";
  let perspective = "Custom Scene";
  const textSourceIds: string[] = [];
  const imageSourceIds: string[] = [];
  const references: WorkspaceReference[] = [];

  // 1) Local uploads on the Image Generator card
  const localRefs = loadLocalRefs(nodeId);
  for (const local of localRefs) {
    if (references.length >= MAX_REFERENCE_IMAGES) break;
    const index = references.length + 1;
    references.push({
      id: local.id,
      index,
      name: `Image ${index}`,
      mention: `@Image${index}`,
      source: "upload",
      thumb: local.b64,
      b64: local.b64,
    });
  }

  // Also accept legacy single compressedImageB64 on image node
  const legacyLocal = node?.data?.compressedImageB64 || node?.data?.imageB64;
  if (legacyLocal && !localRefs.length && references.length < MAX_REFERENCE_IMAGES) {
    const index = references.length + 1;
    references.push({
      id: `legacy_${nodeId}`,
      index,
      name: `Image ${index}`,
      mention: `@Image${index}`,
      source: "upload",
      thumb: String(legacyLocal),
      b64: String(legacyLocal),
    });
  }

  // 2) Connected image edges (multi-reference port)
  for (const edge of incoming) {
    const source = getNode(edge.source);
    if (!source) continue;

    const targetHandle = edge.targetHandle || "";
    const isTextPort = targetHandle === "text-in" || targetHandle.startsWith("text");
    const isImagePort = targetHandle === "image-in" || targetHandle.startsWith("image");

    if (source.type === "promptNode" && isTextPort) {
      textSourceIds.push(source.id);
      const chunk = String(source.data?.prompt || source.data?.label || "").trim();
      if (chunk) promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
      if (source.data?.perspective) perspective = String(source.data.perspective);
    }

    if (isImagePort && references.length < MAX_REFERENCE_IMAGES) {
      imageSourceIds.push(source.id);

      if (source.type === "imageNode") {
        const url = getImageUrlFromNode(source);
        if (url) {
          const index = references.length + 1;
          references.push({
            id: `edge_${edge.id}`,
            index,
            name: `Image ${index}`,
            mention: `@Image${index}`,
            source: "edge",
            sourceNodeId: source.id,
            thumb: url,
            url,
          });
        }
      } else if (source.type === "promptNode") {
        // Expand all uploads on the Text node into numbered refs
        const promptLocals = loadLocalRefs(source.id);
        const legacy = source.data?.compressedImageB64 || source.data?.imageB64;
        const payloads: { id: string; b64: string }[] = promptLocals.length
          ? promptLocals
          : legacy
            ? [{ id: `legacy_${source.id}`, b64: String(legacy) }]
            : [];

        for (const item of payloads) {
          if (references.length >= MAX_REFERENCE_IMAGES) break;
          const index = references.length + 1;
          references.push({
            id: `edge_${edge.id}_${item.id}`,
            index,
            name: `Image ${index}`,
            mention: `@Image${index}`,
            source: "edge",
            sourceNodeId: source.id,
            thumb: item.b64,
            b64: item.b64,
          });
        }
      }
    }

    if (source.type === "promptNode" && !targetHandle) {
      textSourceIds.push(source.id);
      const chunk = String(source.data?.prompt || source.data?.label || "").trim();
      if (chunk) promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
      if (source.data?.perspective) perspective = String(source.data.perspective);
    }
  }

  const first = references[0];

  return {
    promptText,
    perspective,
    referenceImageB64: first?.b64,
    referenceImageUrl: first?.url,
    referenceLabel: references.length
      ? `${references.length} reference${references.length > 1 ? "s" : ""}`
      : undefined,
    references,
    textSourceIds,
    imageSourceIds,
  };
}

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
  connectTargetHandle?: string;
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

export function filterSpotlightForPort(
  options: SpotlightNodeOption[],
  fromHandle: string | null | undefined,
  fromHandleType: "source" | "target" | null,
): SpotlightNodeOption[] {
  const kind = portKindFromHandle(fromHandle);
  if (!kind || !fromHandleType) return options;

  if (fromHandleType === "source") {
    return options
      .filter((o) => o.accepts.includes(kind))
      .map((o) => ({
        ...o,
        connectTargetHandle: kind === "text" ? "text-in" : "image-in",
      }));
  }

  return options
    .filter((o) => o.produces.includes(kind))
    .map((o) => ({
      ...o,
      connectSourceHandle: kind === "text" ? "text-out" : "image-out",
    }));
}

/** Compress a File / data URL for local reference storage */
export async function compressImageFile(file: File, maxSize = 720, quality = 0.75): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unsupported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
