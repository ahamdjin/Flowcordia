import { validateWorkflow, type WorkflowDefinition, type WorkflowNode } from "@flowcordia/workflow";
import {
  connectionData,
  nodeInput,
  nodeOutput,
  type EditorCodeNodeDefinition,
  type EditorNodeInstance,
  type EditorVisualNode,
} from "@flyde/core";

export type StudioV2FlydeProjection =
  | { success: true; node: EditorVisualNode; workflow: WorkflowDefinition }
  | { success: false; message: string };

function nodeColor(node: WorkflowNode): string {
  switch (node.kind) {
    case "trigger":
      return "#059669";
    case "action":
      return "#2563eb";
    case "control":
      return "#d97706";
    case "code":
      return "#7c3aed";
    case "subflow":
      return "#0891b2";
    case "approval":
      return "#ea580c";
    case "output":
      return "#db2777";
  }
}

function nodeIcon(node: WorkflowNode): string {
  if (node.operation === "action.http") return "globe";
  if (node.operation === "control.condition") return "code-branch";
  if (node.operation === "control.loop") return "rotate";
  if (node.operation === "control.wait") return "clock";
  if (node.kind === "trigger") return "play";
  if (node.kind === "output") return "right-from-bracket";
  if (node.kind === "code") return "code";
  return "cube";
}

function pinIds(
  workflow: WorkflowDefinition,
  node: WorkflowNode
): { inputs: string[]; outputs: string[] } {
  const inputs = new Set<string>();
  const outputs = new Set<string>();

  for (const edge of workflow.edges) {
    if (edge.target === node.id) inputs.add(edge.targetHandle ?? "input");
    if (edge.source === node.id) {
      outputs.add(edge.sourceHandle ?? edge.condition ?? "output");
    }
  }

  if (node.kind !== "trigger" && node.kind !== "output" && inputs.size === 0) inputs.add("input");
  if (node.kind !== "output" && outputs.size === 0) outputs.add("output");
  if (node.operation === "control.condition") {
    outputs.add("true");
    outputs.add("false");
  }

  return { inputs: [...inputs], outputs: [...outputs] };
}

function editorNodeDefinition(
  workflow: WorkflowDefinition,
  node: WorkflowNode
): EditorCodeNodeDefinition {
  const pins = pinIds(workflow, node);
  return {
    id: `flowcordia.${node.operation}`,
    displayName: node.name ?? node.operation,
    menuDisplayName: node.name ?? node.operation,
    description: node.operation,
    inputs: Object.fromEntries(pins.inputs.map((pin) => [pin, nodeInput("optional")])),
    outputs: Object.fromEntries(pins.outputs.map((pin) => [pin, nodeOutput()])),
    icon: nodeIcon(node),
    defaultStyle: { color: nodeColor(node) },
    editorConfig: { type: "structured", fields: [] },
    isTrigger: node.kind === "trigger",
  };
}

export function projectStudioV2WorkflowToFlyde(document: unknown): StudioV2FlydeProjection {
  const validated = validateWorkflow(document);
  if (!validated.success) {
    return {
      success: false,
      message: validated.issues[0]?.message ?? "The workflow graph is invalid.",
    };
  }

  const workflow = validated.workflow;
  const instances: EditorNodeInstance[] = workflow.nodes.map((node) => {
    const definition = editorNodeDefinition(workflow, node);
    return {
      id: node.id,
      nodeId: definition.id,
      type: "code",
      source: {
        type: "custom",
        data: { flowcordia: "studio-v2", nodeId: node.id },
      },
      config: {},
      inputConfig: {},
      displayName: node.name ?? node.operation,
      pos: { ...node.position },
      node: definition,
    };
  });

  return {
    success: true,
    workflow,
    node: {
      id: workflow.id,
      displayName: workflow.name,
      description: workflow.description,
      inputs: {},
      outputs: {},
      inputsPosition: {},
      outputsPosition: {},
      instances,
      connections: workflow.edges.map((edge) =>
        connectionData(
          `${edge.source}.${edge.sourceHandle ?? edge.condition ?? "output"}`,
          `${edge.target}.${edge.targetHandle ?? "input"}`
        )
      ),
    },
  };
}
