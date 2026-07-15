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
  runNode: (nodeId: string) => Promise<void>;
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

  const runNode = useCallback(async (nodeId: string) => {
    const runner = runnersRef.current.get(nodeId);
    if (!runner) return;
    await runner();
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
      value={{ registerRunner, runNode, runWorkflow, runDownstream }}
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
