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
  /** Display name: Creation #3 or Image 1 */
  name: string;
  /** Mention token: @Creation #3 */
  mention: string;
  source: "upload" | "edge" | "creation";
  sourceNodeId?: string;
  creationNumber?: number;
  thumb?: string;
  b64?: string;
  url?: string;
};

export const CREATION_LS_KEY = (id: string) => `ws_creation_${id}`;

/** In-memory fallback when localStorage quota is exceeded */
const creationImageMemory = new Map<string, string>();

export function loadCreationImage(nodeId: string): string | null {
  if (typeof window === "undefined") return null;
  return creationImageMemory.get(nodeId) || localStorage.getItem(CREATION_LS_KEY(nodeId));
}

export function saveCreationImage(nodeId: string, b64: string) {
  if (typeof window === "undefined") return;
  creationImageMemory.set(nodeId, b64);
  try {
    localStorage.setItem(CREATION_LS_KEY(nodeId), b64);
  } catch {
    // Quota exceeded — keep memory copy so the node still shows the image
    try {
      localStorage.removeItem(CREATION_LS_KEY(nodeId));
    } catch {
      /* ignore */
    }
  }
}

export function clearCreationImage(nodeId: string) {
  creationImageMemory.delete(nodeId);
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CREATION_LS_KEY(nodeId));
  } catch {
    /* ignore */
  }
}

export function nextCreationNumber(nodes: Node[]): number {
  let max = 0;
  for (const n of nodes) {
    if (n.type !== "creationNode") continue;
    const num = Number(n.data?.creationNumber) || 0;
    if (num > max) max = num;
  }
  return max + 1;
}

function pushReference(
  references: WorkspaceReference[],
  partial: Omit<WorkspaceReference, "index" | "name" | "mention"> & {
    name?: string;
    mention?: string;
    creationNumber?: number;
  },
) {
  if (references.length >= MAX_REFERENCE_IMAGES) return;
  const index = references.length + 1;
  const creationNumber = partial.creationNumber;
  const name =
    partial.name ||
    (creationNumber ? `Creation #${creationNumber}` : `Image ${index}`);
  const mention = partial.mention || (creationNumber ? `@Creation #${creationNumber}` : `@Image${index}`);
  references.push({
    ...partial,
    index,
    name,
    mention,
    creationNumber,
  });
}

export interface ResolvedImageInputs {
  promptText: string;
  perspective: string;
  /** From linked Text node when set */
  modelName?: string;
  aspectRatio?: string;
  imageCount?: number;
  /** @deprecated use references[0] */
  referenceImageB64?: string;
  /** @deprecated use references[0] */
  referenceImageUrl?: string;
  referenceLabel?: string;
  references: WorkspaceReference[];
  textSourceIds: string[];
  imageSourceIds: string[];
}

/** Prefer an explicit Style over default "Custom Scene". */
export function pickPerspective(...candidates: Array<unknown>): string {
  let fallback = "Custom Scene";
  for (const raw of candidates) {
    const v = String(raw || "").trim();
    if (!v) continue;
    if (v !== "Custom Scene") return v;
    fallback = v;
  }
  return fallback;
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

/** Expand @Creation #4 / @Image1 → stable labels for the model */
export function expandImageMentions(
  prompt: string,
  references: WorkspaceReference[] = [],
): string {
  let body = prompt;

  // Map @Creation #N → "Creation #N (reference image K)"
  for (const ref of references) {
    if (!ref.creationNumber) continue;
    const re = new RegExp(`@Creation\\s*#?\\s*${ref.creationNumber}\\b`, "gi");
    body = body.replace(re, `${ref.name} (reference image ${ref.index})`);
  }

  body = body
    .replace(/@Creation\s*#?\s*(\d+)/gi, "Creation #$1")
    .replace(/@Image\s*(\d+)/gi, "Image $1")
    .replace(/@img\s*(\d+)/gi, "Image $1");

  return body;
}

/** Build prompt prefix so the model knows how numbered references map */
export function buildReferenceAwarePrompt(
  userPrompt: string,
  references: WorkspaceReference[],
): string {
  const body = expandImageMentions(userPrompt, references).trim();
  if (!references.length) return body;

  const legend = references
    .map((r) => `${r.name} = attached reference image ${r.index}`)
    .join("; ");

  const labels = references.map((r) => r.name).join(", ");
  const instruction =
    `You are given ${references.length} reference image(s): ${labels}. ` +
    `When the prompt mentions @Creation #N, Creation #N, @ImageN, or Image N, use that exact reference. Mapping: ${legend}. ` +
    `CRITICAL: Preserve the exact building massing, facade, openings, proportions, camera view, and facade colors from the reference. ` +
    `Do not redesign, warp architectural details, or bleach/recolor the facade — apply only the requested presentation/style change.`;

  return body ? `${instruction}\n\n${body}` : instruction;
}

function addCreationRef(
  references: WorkspaceReference[],
  creationNode: Node,
  edgeId: string,
) {
  const fromData = creationNode.data?.previewUrl ? String(creationNode.data.previewUrl) : undefined;
  const b64 = loadCreationImage(creationNode.id) || fromData || undefined;
  const url = !b64 ? getImageUrlFromNode(creationNode) : undefined;
  if (!b64 && !url) return;
  const creationNumber = Number(creationNode.data?.creationNumber) || undefined;
  pushReference(references, {
    id: `creation_${edgeId}_${creationNode.id}`,
    source: "creation",
    sourceNodeId: creationNode.id,
    creationNumber,
    thumb: b64 || url,
    b64,
    url,
  });
}

/** Collect Creation + generated Image nodes wired into a Text node's image-in. */
function collectImageRefsIntoTextNode(
  textNodeId: string,
  getNode: (id: string) => Node | undefined,
  getEdges: () => Edge[],
  references: WorkspaceReference[],
) {
  const incoming = getEdges().filter(
    (e) => e.target === textNodeId && (e.targetHandle === "image-in" || (e.targetHandle || "").startsWith("image")),
  );
  for (const edge of incoming) {
    const src = getNode(edge.source);
    if (!src) continue;
    if (references.some((r) => r.sourceNodeId === src.id)) continue;

    if (src.type === "creationNode") {
      addCreationRef(references, src, edge.id);
      continue;
    }

    if (src.type === "imageNode") {
      const url = getImageUrlFromNode(src);
      if (!url) continue;
      const n = references.length + 1;
      pushReference(references, {
        id: `text_img_${edge.id}_${src.id}`,
        source: "edge",
        sourceNodeId: src.id,
        thumb: url,
        url,
        name: `Image ${n}`,
        mention: `@Image${n}`,
      });
    }
  }
}

/** @deprecated use collectImageRefsIntoTextNode */
function collectCreationsIntoTextNode(
  textNodeId: string,
  getNode: (id: string) => Node | undefined,
  getEdges: () => Edge[],
  references: WorkspaceReference[],
) {
  collectImageRefsIntoTextNode(textNodeId, getNode, getEdges, references);
}

/** Walk incoming edges + Creations + local uploads → Magnific-style references. */
export function resolveImageNodeInputs(
  nodeId: string,
  getNode: (id: string) => Node | undefined,
  getEdges: () => Edge[],
): ResolvedImageInputs {
  const node = getNode(nodeId);
  const incoming = getEdges().filter((e) => e.target === nodeId);

  let promptText = "";
  let textPerspective = "";
  let textModelName: string | undefined;
  let textAspectRatio: string | undefined;
  let textImageCount: number | undefined;
  const textSourceIds: string[] = [];
  const imageSourceIds: string[] = [];
  const references: WorkspaceReference[] = [];

  const applyTextNodeSettings = (source: Node) => {
    textSourceIds.push(source.id);
    const chunk = String(source.data?.prompt || source.data?.label || "").trim();
    if (chunk) promptText = promptText ? `${promptText} ${chunk}`.trim() : chunk;
    if (source.data?.perspective) textPerspective = String(source.data.perspective);
    if (source.data?.modelName) textModelName = String(source.data.modelName);
    if (source.data?.aspectRatio) textAspectRatio = String(source.data.aspectRatio);
    const count = Number(source.data?.imageCount);
    if (Number.isFinite(count) && count >= 1) textImageCount = Math.min(4, Math.max(1, count));
    collectImageRefsIntoTextNode(source.id, getNode, getEdges, references);
  };

  // 1) Local uploads on the Image Generator card
  const localRefs = loadLocalRefs(nodeId);
  for (const local of localRefs) {
    pushReference(references, {
      id: local.id,
      source: "upload",
      thumb: local.b64,
      b64: local.b64,
    });
  }

  const legacyLocal = node?.data?.compressedImageB64 || node?.data?.imageB64;
  if (legacyLocal && !localRefs.length) {
    pushReference(references, {
      id: `legacy_${nodeId}`,
      source: "upload",
      thumb: String(legacyLocal),
      b64: String(legacyLocal),
    });
  }

  // 2) Connected ports
  for (const edge of incoming) {
    const source = getNode(edge.source);
    if (!source) continue;

    const targetHandle = edge.targetHandle || "";
    const isTextPort = targetHandle === "text-in" || targetHandle.startsWith("text");
    const isImagePort = targetHandle === "image-in" || targetHandle.startsWith("image");

    if (source.type === "promptNode" && isTextPort) {
      applyTextNodeSettings(source);
    }

    if (isImagePort) {
      imageSourceIds.push(source.id);

      if (source.type === "creationNode") {
        addCreationRef(references, source, edge.id);
      } else if (source.type === "imageNode") {
        const url = getImageUrlFromNode(source);
        if (url) {
          pushReference(references, {
            id: `edge_${edge.id}`,
            source: "edge",
            sourceNodeId: source.id,
            thumb: url,
            url,
          });
        }
      } else if (source.type === "promptNode") {
        const promptLocals = loadLocalRefs(source.id);
        const legacy = source.data?.compressedImageB64 || source.data?.imageB64;
        const payloads: { id: string; b64: string }[] = promptLocals.length
          ? promptLocals
          : legacy
            ? [{ id: `legacy_${source.id}`, b64: String(legacy) }]
            : [];

        for (const item of payloads) {
          pushReference(references, {
            id: `edge_${edge.id}_${item.id}`,
            source: "edge",
            sourceNodeId: source.id,
            thumb: item.b64,
            b64: item.b64,
          });
        }
        collectImageRefsIntoTextNode(source.id, getNode, getEdges, references);
      }
    }

    if (source.type === "promptNode" && !targetHandle) {
      applyTextNodeSettings(source);
    }
  }

  // Text Style wins over Image Generator default "Custom Scene".
  // Explicit non-Custom style on Image Generator still wins.
  const perspective = pickPerspective(
    node?.data?.perspective != null ? String(node.data.perspective) : undefined,
    textPerspective,
  );

  // Re-style / re-prompt: if no external refs but this node already has a result,
  // use the current output as the reference image (edit-in-place like Magnific).
  if (!references.length) {
    const selfUrl = getImageUrlFromNode(node);
    if (selfUrl) {
      pushReference(references, {
        id: `self_${nodeId}`,
        source: "edge",
        sourceNodeId: nodeId,
        thumb: selfUrl,
        url: selfUrl,
        name: "Image 1",
        mention: "@Image1",
      });
    }
  }

  const first = references[0];

  return {
    promptText,
    perspective,
    modelName: textModelName,
    aspectRatio: textAspectRatio,
    imageCount: textImageCount,
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

/**
 * Magnific "Run from here": walk outbound edges from any node
 * (Creation / Text / Image) and collect reachable Image Generators.
 */
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
      if (imageIds.has(edge.target)) {
        result.push(edge.target);
      }
      queue.push(edge.target);
    }
  }

  // Dedupe while preserving discovery order
  const unique = Array.from(new Set(result));
  return getImageNodeExecutionOrder(
    nodes.filter((n) => unique.includes(n.id)),
    edges.filter((e) => unique.includes(e.source) && unique.includes(e.target)),
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

/** Image Generators that eventually depend on `startId` (incoming walk). */
export function getImageNodesDependingOn(
  startId: string,
  nodes: Node[],
  edges: Edge[],
): string[] {
  const imageIds = nodes.filter((n) => n.type === "imageNode").map((n) => n.id);
  const affected: string[] = [];
  for (const imgId of imageIds) {
    const seen = new Set<string>();
    const queue = [imgId];
    let hits = false;
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (cur === startId) {
        hits = true;
        break;
      }
      for (const e of edges.filter((ed) => ed.target === cur)) {
        queue.push(e.source);
      }
    }
    if (hits) affected.push(imgId);
  }
  return getImageNodeExecutionOrder(
    nodes.filter((n) => affected.includes(n.id)),
    edges,
  );
}

export type EnsureImageGeneratorResult = {
  nodes: Node[];
  edges: Edge[];
  imageNodeId: string;
  created: boolean;
};

/**
 * Magnific pattern: images are produced only on Image Generator.
 * If Run is pressed from Text/Assets without one linked, auto-create and wire it.
 *
 * Preferred wiring (matches Magnific Spaces):
 *   Assets → Text.image-in
 *   Text.text-out → Image Generator.text-in
 * (Creations on Text become reference images automatically.)
 */
export function ensureLinkedImageGenerator(
  startId: string,
  nodes: Node[],
  edges: Edge[],
  newId: string,
): EnsureImageGeneratorResult {
  const downstream = getDownstreamImageNodes(startId, nodes, edges);
  if (downstream.length) {
    return { nodes, edges, imageNodeId: downstream[0], created: false };
  }

  const depending = getImageNodesDependingOn(startId, nodes, edges);
  if (depending.length) {
    return { nodes, edges, imageNodeId: depending[0], created: false };
  }

  const start = nodes.find((n) => n.id === startId);
  if (!start) {
    return { nodes, edges, imageNodeId: "", created: false };
  }

  let textNode: Node | null = start.type === "promptNode" ? start : null;
  let creationNode: Node | null = start.type === "creationNode" ? start : null;

  if (start.type === "creationNode") {
    const queue = [startId];
    const seen = new Set<string>();
    while (queue.length && !textNode) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of edges.filter((ed) => ed.source === cur)) {
        const target = nodes.find((n) => n.id === e.target);
        if (target?.type === "promptNode") {
          textNode = target;
          break;
        }
        queue.push(e.target);
      }
    }
  }

  const anchor = textNode || creationNode || start;
  const imageNode: Node = {
    id: newId,
    type: "imageNode",
    position: { x: anchor.position.x + 420, y: anchor.position.y },
        data: {
          imageUrls: [],
          isLoading: false,
          aspectRatio: "16:9",
          imageCount: 1,
          modelName: "nano-banana-pro-preview",
          perspective: "Custom Scene",
        },
  };

  let nextEdges = [...edges];

  if (textNode) {
    const connection = {
      source: textNode.id,
      sourceHandle: "text-out",
      target: newId,
      targetHandle: "text-in",
    };
    nextEdges = replaceInputEdge(nextEdges, {
      id: `e-${textNode.id}-${newId}-text`,
      ...connection,
      ...edgeStyleForConnection(connection),
    });
  } else if (creationNode) {
    const connection = {
      source: creationNode.id,
      sourceHandle: "image-out",
      target: newId,
      targetHandle: "image-in",
    };
    nextEdges = replaceInputEdge(nextEdges, {
      id: `e-${creationNode.id}-${newId}-img`,
      ...connection,
      ...edgeStyleForConnection(connection),
    });
  } else {
    return { nodes, edges, imageNodeId: "", created: false };
  }

  return {
    nodes: [...nodes, imageNode],
    edges: nextEdges,
    imageNodeId: newId,
    created: true,
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
    accepts: ["image"],
    produces: ["text"],
  },
  {
    type: "imageNode",
    label: "Image Generator",
    description: "Where images are produced — connect Text and/or Assets, then Run",
    category: "Image",
    connectTargetHandle: "text-in",
    accepts: ["text", "image"],
    produces: ["image"],
  },
  {
    type: "creationNode",
    label: "Assets",
    description: "Choose an image from your device as a Creation reference",
    category: "Media",
    connectSourceHandle: "image-out",
    accepts: [],
    produces: ["image"],
  },
  {
    type: "creationNode",
    label: "Upload",
    description: "Upload image(s) from your device onto the canvas",
    category: "Media",
    connectSourceHandle: "image-out",
    accepts: [],
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
    // Prefer unique options by label when same type appears twice (Assets/Upload)
    const matched = options.filter((o) => o.accepts.includes(kind));
    const seen = new Set<string>();
    return matched
      .filter((o) => {
        const key = `${o.type}:${o.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((o) => ({
        ...o,
        connectTargetHandle: kind === "text" ? "text-in" : "image-in",
      }));
  }

  const matched = options.filter((o) => o.produces.includes(kind));
  const seen = new Set<string>();
  return matched
    .filter((o) => {
      const key = `${o.type}:${o.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((o) => ({
      ...o,
      connectSourceHandle: kind === "text" ? "text-out" : "image-out",
    }));
}

export function isFileDragEvent(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types || []).includes("Files");
}

export function collectDroppedImageFiles(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null) => {
    if (!file) return;
    const isImage =
      file.type.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
    if (!isImage) return;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };

  if (dt.files?.length) {
    Array.from(dt.files).forEach(push);
  } else {
    for (const item of Array.from(dt.items || [])) {
      if (item.kind === "file") push(item.getAsFile());
    }
  }
  return out;
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
