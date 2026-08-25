"use client";

import React, { createContext, useCallback, useContext, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  getDownstreamImageNodes,
  getImageNodeExecutionOrder,
} from "@/lib/workspace/graphUtils";

type Runner = () => Promise<void>;

type WorkspaceEditorContextValue = {
  registerRunner: (nodeId: string, runner: Runner) => () => void;
  hasRunner: (nodeId: string) => boolean;
  waitForRunner: (nodeId: string, timeoutMs?: number) => Promise<boolean>;
  runNode: (nodeId: string) => Promise<boolean>;
  runWorkflow: (nodes: Node[], edges: Edge[]) => Promise<void>;
  runDownstream: (startNodeId: string, nodes: Node[], edges: Edge[]) => Promise<void>;
};

const WorkspaceEditorContext = createContext<WorkspaceEditorContextValue | null>(null);

export function WorkspaceEditorProvider({ children }: { children: React.ReactNode }) {
  const runnersRef = useRef<Map<string, Runner>>(new Map());

  const registerRunner = useCallback((nodeId: string, runner: Runner) => {
    runnersRef.current.set(nodeId, runner);
    return () => runnersRef.current.delete(nodeId);
  }, []);

  const hasRunner = useCallback((nodeId: string) => runnersRef.current.has(nodeId), []);

  const waitForRunner = useCallback(async (nodeId: string, timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (runnersRef.current.has(nodeId)) return true;
      await new Promise((r) => setTimeout(r, 40));
    }
    return runnersRef.current.has(nodeId);
  }, []);

  const runNode = useCallback(async (nodeId: string) => {
    const runner = runnersRef.current.get(nodeId);
    if (!runner) return false;
    await runner();
    return true;
  }, []);

  const runWorkflow = useCallback(async (nodes: Node[], edges: Edge[]) => {
    const order = getImageNodeExecutionOrder(nodes, edges);
    for (const id of order) {
      await runNode(id);
    }
  }, [runNode]);

  const runDownstream = useCallback(
    async (startNodeId: string, nodes: Node[], edges: Edge[]) => {
      const order = getDownstreamImageNodes(startNodeId, nodes, edges);
      for (const id of order) {
        await runNode(id);
      }
    },
    [runNode],
  );

  return (
    <WorkspaceEditorContext.Provider
      value={{ registerRunner, hasRunner, waitForRunner, runNode, runWorkflow, runDownstream }}
    >
      {children}
    </WorkspaceEditorContext.Provider>
  );
}

export function useWorkspaceEditor() {
  const ctx = useContext(WorkspaceEditorContext);
  if (!ctx) throw new Error("useWorkspaceEditor must be used within WorkspaceEditorProvider");
  return ctx;
}
