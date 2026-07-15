import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";
import { authFormPost, fetchJobStatus, fetchProxyBlob, apiGetMe, setStoredUser } from "@/lib/mysql/client";
import { resolveImageNodeInputs } from "./graphUtils";

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
  referenceImageB64?: string,
  referenceImageUrl?: string,
): Promise<File | null> {
  if (referenceImageB64) {
    const blob = dataURLtoBlob(referenceImageB64);
    return new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });
  }
  if (!referenceImageUrl) return null;

  if (referenceImageUrl.startsWith("data:")) {
    const blob = dataURLtoBlob(referenceImageUrl);
    return new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });
  }

  try {
    const blob = await fetchProxyBlob(referenceImageUrl);
    return new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });
  } catch {
    const res = await fetch(referenceImageUrl);
    if (!res.ok) throw new Error("Could not load upstream image");
    const blob = await res.blob();
    return new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });
  }
}

export type ImageGenerationSettings = {
  modelName: string;
  aspectRatio: string;
  imageCount: number;
  promptOverride?: string;
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
  const promptText = override
    ? `${resolved.promptText} ${override}`.trim()
    : resolved.promptText;

  if (!promptText && !resolved.referenceImageB64 && !resolved.referenceImageUrl) {
    throw new Error("Connect a Text node and/or an image input");
  }

  updateNodeData(nodeId, { isLoading: true, imageUrls: [] });

  const formData = new FormData();
  formData.append("perspective", resolved.perspective);
  formData.append("custom_prompt", promptText);
  formData.append("model_name", settings.modelName);
  formData.append("aspect_ratio", settings.aspectRatio);
  formData.append("image_count", String(settings.imageCount));
  formData.append("denoise", "0.75");

  const refFile = await referenceToFile(resolved.referenceImageB64, resolved.referenceImageUrl);
  if (refFile) formData.append("file", refFile);

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
  const incomingEdge = getEdges().find((e) => e.target === nodeId);

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
          modelName: settings.modelName,
          aspectRatio: settings.aspectRatio,
          imageCount: 1,
        },
      });
      if (incomingEdge) {
        newEdges.push({
          id: `e-${incomingEdge.source}-${newNodeId}`,
          source: incomingEdge.source,
          sourceHandle: incomingEdge.sourceHandle,
          target: newNodeId,
          targetHandle: incomingEdge.targetHandle || "text-in",
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
