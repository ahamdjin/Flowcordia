import type { JsonObject, WorkflowDefinition, WorkflowEditCommand } from "@flowcordia/workflow";
import type { WorkflowIndexScope } from "../index/types";

export type WorkflowDraftStatus = "ACTIVE" | "DISCARDED";
export type WorkflowDraftScope = WorkflowIndexScope;

export type WorkflowDraftAddFunctionNodeCommand = {
  type: "add_function_node";
  functionId: string;
  position: { x: number; y: number } & JsonObject;
  name?: string;
} & JsonObject;

export type WorkflowDraftEditCommand = WorkflowEditCommand | WorkflowDraftAddFunctionNodeCommand;

export interface WorkflowDraftRecord {
  id: string;
  publicId: string;
  workflowId: string;
  workflowPath: string;
  status: WorkflowDraftStatus;
  baseCommitSha: string;
  baseBlobSha: string;
  baseCanonicalSha256: string;
  document: WorkflowDefinition;
  documentSha256: string;
  version: bigint;
  historyMin: bigint;
  historyCursor: bigint;
  historyMax: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  discardedByActorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  discardedAt: Date | null;
}

export interface WorkflowDraftAuditInput {
  eventType:
    | "workflow_draft.started"
    | "workflow_draft.resumed"
    | "workflow_draft.edited"
    | "workflow_draft.undone"
    | "workflow_draft.redone"
    | "workflow_draft.discarded";
  actorId: string;
  correlationId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface WorkflowDraftSourceIdentity {
  workflowId: string;
  workflowPath: string;
  baseCommitSha: string;
  baseBlobSha: string;
  baseCanonicalSha256: string;
}

export function summarizeWorkflowEdit(command: WorkflowDraftEditCommand): Record<string, unknown> {
  switch (command.type) {
    case "set_workflow_details":
      return {
        command: command.type,
        fields: [
          command.name !== undefined ? "name" : null,
          command.description !== undefined ? "description" : null,
          command.labels !== undefined ? "labels" : null,
        ].filter(Boolean),
      };
    case "add_node":
      return { command: command.type, templateId: command.templateId };
    case "add_connected_node":
      return {
        command: command.type,
        templateId: command.templateId,
        source: command.source,
        condition: command.condition ?? null,
      };
    case "insert_node_on_edge":
      return {
        command: command.type,
        templateId: command.templateId,
        edgeId: command.edgeId,
      };
    case "add_function_node":
      return { command: command.type, functionId: command.functionId };
    case "move_node":
      return { command: command.type, nodeId: command.nodeId };
    case "move_nodes":
      return {
        command: command.type,
        nodeIds: command.moves.map((move) => move.nodeId),
      };
    case "duplicate_subgraph":
      return {
        command: command.type,
        nodeIds: command.nodeIds,
        offset: command.offset,
      };
    case "remove_nodes":
      return {
        command: command.type,
        nodeIds: command.nodeIds,
        nodeCount: command.nodeIds.length,
      };
    case "rename_node":
      return { command: command.type, nodeId: command.nodeId };
    case "set_node_configuration":
      return {
        command: command.type,
        nodeId: command.nodeId,
        configurationKeys: Object.keys(command.configuration).sort(),
      };
    case "set_node_runtime":
      return {
        command: command.type,
        nodeId: command.nodeId,
        runtimeFields: command.runtime ? Object.keys(command.runtime).sort() : [],
        retryFields:
          command.runtime?.retry &&
          typeof command.runtime.retry === "object" &&
          !Array.isArray(command.runtime.retry)
            ? Object.keys(command.runtime.retry).sort()
            : [],
      };
    case "set_node_credential_references":
      return {
        command: command.type,
        nodeId: command.nodeId,
        credentialReferenceCount: command.credentialReferences.length,
      };
    case "remove_node":
      return { command: command.type, nodeId: command.nodeId };
    case "connect_nodes":
      return {
        command: command.type,
        source: command.source,
        target: command.target,
        condition: command.condition ?? null,
      };
    case "replace_edge":
      return {
        command: command.type,
        edgeId: command.edgeId,
        target: command.target,
        condition: command.condition ?? null,
      };
    case "remove_edge":
      return { command: command.type, edgeId: command.edgeId };
  }
}
