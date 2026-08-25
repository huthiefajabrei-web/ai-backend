import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";
import { authFormPost, fetchJobStatus, fetchProxyBlob, apiGetMe, setStoredUser } from "@/lib/mysql/client";
import {
  buildReferenceAwarePrompt,
  pickPerspective,
  resolveImageNodeInputs,
  type WorkspaceReference,
} from "./graphUtils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

async function referenceToFile(
  ref: WorkspaceReference,
  filename: string,
): Promise<File | null> {
  if (ref.b64) {
    const blob = dataURLtoBlob(ref.b64);
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  }

  const url = ref.url || ref.thumb;
  if (!url) return null;

  if (url.startsWith("data:")) {
    const blob = dataURLtoBlob(url);
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  }

  try {
    const blob = await fetchProxyBlob(url);
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${ref.name}`);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  }
}

export type ImageGenerationSettings = {
  modelName: string;
  aspectRatio: string;
  imageCount: number;
  promptOverride?: string;
  /** Local Style / Perspective on the Image Generator (overrides Text when set) */
  perspective?: string;
};

export type GenerationCallbacks = {
  getNode: (id: string) => Node | undefined;
  getEdges: () => Edge[];
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  isCancelled: () => boolean;
  onJobIds?: (jobIds: string[]) => void;
};

async function pollUntilComplete(jobId: string, isCancelled: () => boolean): Promise<string> {
  while (true) {
    if (isCancelled()) throw new Error("Cancelled by user");
    await new Promise((r) => setTimeout(r, 2000));
    if (isCancelled()) throw new Error("Cancelled by user");

    const statusRes = await fetchJobStatus(jobId);
    const statusData = await statusRes.json();

    if (statusData.status === "COMPLETED") {
      const url = statusData.file_url || statusData.image_data_url;
      if (!url) throw new Error("Job completed without image URL");
      return String(url);
    }
    if (statusData.status === "FAILED" || statusData.status === "TIMEOUT") {
      throw new Error(statusData.error || `Job ${jobId} failed`);
    }
  }
}

export async function runImageNodeGeneration(
  nodeId: string,
  settings: ImageGenerationSettings,
  callbacks: GenerationCallbacks,
): Promise<void> {
  const { getNode, getEdges, updateNodeData, setNodes, setEdges, isCancelled } = callbacks;

  const resolved = resolveImageNodeInputs(nodeId, getNode, getEdges);
  const override = settings.promptOverride?.trim() || "";
  const rawPrompt = override
    ? `${resolved.promptText} ${override}`.trim()
    : resolved.promptText;

  const promptText = buildReferenceAwarePrompt(rawPrompt, resolved.references);
  // Text Style must win over Image Generator default "Custom Scene"
  const perspective = pickPerspective(settings.perspective, resolved.perspective);
  const modelName = resolved.modelName || settings.modelName;
  const aspectRatio = resolved.aspectRatio || settings.aspectRatio;
  const imageCount = resolved.imageCount || settings.imageCount;

  if (!promptText && !resolved.references.length && perspective === "Custom Scene") {
    throw new Error("Connect a Text node, pick a Style/Perspective, and/or add reference images");
  }

  updateNodeData(nodeId, {
    isLoading: true,
    imageUrls: [],
    perspective,
    modelName,
    aspectRatio,
    imageCount,
  });

  const formData = new FormData();
  formData.append("perspective", perspective);
  formData.append(
    "custom_prompt",
    promptText ||
      (resolved.references.length
        ? "Apply the selected style to the attached reference image(s)."
        : "Generate an architectural image."),
  );
  formData.append("model_name", modelName);
  formData.append("aspect_ratio", aspectRatio);
  formData.append("image_count", String(imageCount));
  formData.append("denoise", "0.75");

  // All references go as numbered `refs` (backend labels them Image 1…N)
  for (const ref of resolved.references) {
    const file = await referenceToFile(ref, `image-${ref.index}.jpg`);
    if (file) formData.append("refs", file);
  }

  const response = await authFormPost(`${API_BASE}/generate`, formData);
  const responseData = await response.json();

  if (responseData.error === "insufficient_credits") {
    throw new Error("Insufficient credits — upgrade your plan or buy more credits.");
  }
  if (!responseData.ok || !responseData.job_ids?.length) {
    throw new Error(responseData.error || "Failed to queue generation job");
  }

  const jobIds: string[] = responseData.job_ids;
  callbacks.onJobIds?.(jobIds);
  updateNodeData(nodeId, { activeJobIds: jobIds });
  const currentNode = getNode(nodeId);
  const spawnedIds: string[] = [];
  const incomingEdge = getEdges().find((e) => e.target === nodeId && e.targetHandle === "text-in");

  // Multi-generation: keep first result on this node; spawn siblings for extras
  if (currentNode && jobIds.length > 1) {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    for (let i = 1; i < jobIds.length; i++) {
      const newNodeId = `img_${Date.now()}_${i}`;
      spawnedIds.push(newNodeId);
      newNodes.push({
        id: newNodeId,
        type: "imageNode",
        position: {
          x: currentNode.position.x + 420,
          y: currentNode.position.y + (i - 1) * 300,
        },
        data: {
          isLoading: true,
          imageUrls: [],
          modelName,
          aspectRatio,
          imageCount: 1,
          perspective,
        },
      });
      if (incomingEdge) {
        newEdges.push({
          id: `e-${incomingEdge.source}-${newNodeId}`,
          source: incomingEdge.source,
          sourceHandle: incomingEdge.sourceHandle,
          target: newNodeId,
          targetHandle: "text-in",
          animated: true,
          style: incomingEdge.style,
        });
      }
    }
    if (newNodes.length) {
      setNodes((nds) => [...nds, ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    }
  }

  const targets = [nodeId, ...spawnedIds];
  await Promise.all(
    jobIds.map(async (jobId, index) => {
      const targetId = targets[index];
      if (!targetId) return;
      try {
        const finalUrl = await pollUntilComplete(jobId, isCancelled);
        // Result appears on the Image Generator card (Magnific-style)
        updateNodeData(targetId, { imageUrls: [finalUrl], isLoading: false });
      } catch (err) {
        updateNodeData(targetId, { isLoading: false });
        throw err;
      }
    }),
  );

  const me = await apiGetMe();
  if (me && typeof me === "object" && "credits" in me) {
    setStoredUser(me);
    window.dispatchEvent(new CustomEvent("workspace-credits-updated", { detail: me }));
  }

  window.dispatchEvent(new Event("trigger-workspace-save"));
}
