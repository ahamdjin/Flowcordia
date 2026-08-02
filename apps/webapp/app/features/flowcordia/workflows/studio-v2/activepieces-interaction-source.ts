import { createHash } from "node:crypto";
import {
  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  parseFlowcordiaActivepiecesPieceConfiguration,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import type { StudioV2DeploymentSource } from "./deployment-context.server";

const PIECE_NAME_PATTERN = /^@activepieces\/piece-[a-z0-9][a-z0-9-]{0,180}$/;

export interface StudioV2ActivepiecesInteractionCoordinates {
  pieceName: string;
  pieceVersion: string;
}

export interface StudioV2ActivepiecesInteractionArtifact extends StudioV2DeploymentSource {
  taskId: string;
  exportName: string;
  sourceSha256: string;
  deploymentIdentity: string;
}

function coordinatesDigest(input: StudioV2ActivepiecesInteractionCoordinates): string {
  return createHash("sha256")
    .update(`${input.pieceName}@${input.pieceVersion}`)
    .digest("hex")
    .slice(0, 24);
}

function validatedNode(input: StudioV2ActivepiecesInteractionCoordinates): WorkflowNode {
  if (!PIECE_NAME_PATTERN.test(input.pieceName)) {
    throw new Error("Studio interaction pieceName must be an official Activepieces piece package.");
  }
  const node: WorkflowNode = {
    id: "interaction_piece",
    name: "Activepieces interaction",
    kind: "action",
    operation: FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
    position: { x: 0, y: 0 },
    configuration: {
      activepieces: {
        stepType: "action",
        settings: {
          pieceName: input.pieceName,
          pieceVersion: input.pieceVersion,
          actionName: "flowcordia_interaction",
          input: {},
          propertySettings: {},
        },
      },
    },
  };
  const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
  if (!parsed.success) throw new Error(parsed.message);
  return node;
}

function interactionWorkflow(
  input: StudioV2ActivepiecesInteractionCoordinates,
  digest: string
): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: `ap_interaction_${digest}`,
    name: `Activepieces interaction ${input.pieceName}`,
    nodes: [validatedNode(input)],
    edges: [],
  };
}

function generatedSource(input: {
  coordinates: StudioV2ActivepiecesInteractionCoordinates;
  taskId: string;
  exportName: string;
}): string {
  const pieceName = JSON.stringify(input.coordinates.pieceName);
  return [
    `import { createHash } from "node:crypto";`,
    `import { task } from "@trigger.dev/sdk";`,
    `import { formulaEvaluator } from "@activepieces/core-formula";`,
    `import * as activepiecesPieceModule from ${pieceName};`,
    `import { executeFlowcordiaActivepiecesAction, executeFlowcordiaActivepiecesProperty, validateFlowcordiaActivepiecesConnection } from "@flowcordia/runtime";`,
    `import type { FlowcordiaActivepiecesAuthValidationInput, FlowcordiaActivepiecesPropertyInput } from "@flowcordia/runtime";`,
    `import type { JsonValue, WorkflowNode } from "@flowcordia/workflow";`,
    ``,
    `type InteractionPayload =`,
    `  | { operation: "options"; projectId: string; projectExternalId: string; request: FlowcordiaActivepiecesPropertyInput }`,
    `  | { operation: "revalidate"; projectId: string; projectExternalId: string; request: FlowcordiaActivepiecesAuthValidationInput }`,
    `  | { operation: "test_action"; projectId: string; projectExternalId: string; node: WorkflowNode; workflowInput: JsonValue; outputs: Record<string, JsonValue> };`,
    ``,
    `const PIECE_NAME = ${pieceName};`,
    `const connectionEnvironmentName = (externalId: string) =>`,
    `  "FLOWCORDIA_AP_CONNECTION_" + createHash("sha256").update(externalId).digest("hex").slice(0, 40).toUpperCase();`,
    ``,
    `const loadPiece = async (packageName: string) => {`,
    `  if (packageName !== PIECE_NAME) throw new Error(\`Interaction package mismatch: \${packageName}\`);`,
    `  return activepiecesPieceModule as unknown as Record<string, unknown>;`,
    `};`,
    ``,
    `const resolveConnection = async (externalId: string) => {`,
    `  const environmentName = connectionEnvironmentName(externalId);`,
    `  const raw = process.env[environmentName];`,
    `  if (!raw) throw new Error(\`Activepieces connection "\${externalId}" is unavailable.\`);`,
    `  return JSON.parse(raw) as unknown;`,
    `};`,
    ``,
    `const services = (payload: InteractionPayload, runId: string) => ({`,
    `  loadPiece,`,
    `  resolveConnection,`,
    `  formulaEvaluator,`,
    `  projectId: payload.projectId,`,
    `  projectExternalId: payload.projectExternalId,`,
    `  runId,`,
    `});`,
    ``,
    `export const ${input.exportName} = task({`,
    `  id: ${JSON.stringify(input.taskId)},`,
    `  maxDuration: 60,`,
    `  retry: { maxAttempts: 1 },`,
    `  run: async (payload: InteractionPayload, { ctx }) => {`,
    `    const runtime = services(payload, ctx.run.id);`,
    `    switch (payload.operation) {`,
    `      case "options":`,
    `        return executeFlowcordiaActivepiecesProperty({ request: payload.request, services: runtime });`,
    `      case "revalidate":`,
    `        return validateFlowcordiaActivepiecesConnection({ request: payload.request, services: runtime });`,
    `      case "test_action":`,
    `        return executeFlowcordiaActivepiecesAction({`,
    `          node: payload.node,`,
    `          workflowInput: payload.workflowInput,`,
    `          outputs: payload.outputs,`,
    `          services: runtime,`,
    `        });`,
    `    }`,
    `  },`,
    `});`,
    ``,
  ].join("\n");
}

export function createStudioV2ActivepiecesInteractionArtifact(
  coordinates: StudioV2ActivepiecesInteractionCoordinates
): StudioV2ActivepiecesInteractionArtifact {
  const digest = coordinatesDigest(coordinates);
  const taskId = `flowcordia-ap-interaction-${digest}`;
  const exportName = `flowcordiaActivepiecesInteraction_${digest}`;
  const source = generatedSource({ coordinates, taskId, exportName });
  return {
    taskId,
    exportName,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    deploymentIdentity: `flowcordia_ap_interaction_${digest}`,
    document: interactionWorkflow(coordinates, digest),
    generatedSource: source,
  };
}
