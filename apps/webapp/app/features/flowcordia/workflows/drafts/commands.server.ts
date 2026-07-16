import type { WorkflowEditCommand } from "@flowcordia/workflow";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { WorkflowDraftError } from "./errors";
import {
  discardActiveWorkflowDraft,
  editWorkflowDraft,
  startWorkflowDraft,
} from "./service.server";

const EntityId = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const WorkflowId = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const Position = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict();

const EditCommand = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("set_workflow_details"),
      name: z.string().min(1).max(160).optional(),
      description: z.string().max(2000).nullable().optional(),
      labels: z.array(z.string().min(1).max(64)).max(50).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("add_node"),
      templateId: z.enum([
        "manual_trigger",
        "schedule_trigger",
        "webhook_trigger",
        "http_action",
        "condition",
        "wait",
        "code_task",
        "output",
      ]),
      position: Position,
      name: z.string().min(1).max(160).optional(),
    })
    .strict(),
  z.object({ type: z.literal("move_node"), nodeId: EntityId, position: Position }).strict(),
  z
    .object({
      type: z.literal("rename_node"),
      nodeId: EntityId,
      name: z.string().min(1).max(160).nullable(),
    })
    .strict(),
  z.object({ type: z.literal("remove_node"), nodeId: EntityId }).strict(),
  z.object({ type: z.literal("connect_nodes"), source: EntityId, target: EntityId }).strict(),
  z.object({ type: z.literal("remove_edge"), edgeId: EntityId }).strict(),
]);

const DraftCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("start"), workflowId: WorkflowId }).strict(),
  z
    .object({
      operation: z.literal("edit"),
      draftId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
      command: EditCommand,
    })
    .strict(),
  z
    .object({
      operation: z.literal("discard"),
      draftId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
    })
    .strict(),
]);

function errorStatus(error: WorkflowDraftError): number {
  switch (error.code) {
    case "invalid_input":
    case "unsupported_edit":
      return 400;
    case "draft_not_found":
      return 404;
    case "draft_conflict":
    case "stale_source":
      return 409;
    case "draft_unavailable":
      return 503;
    case "corrupt_draft":
      return 500;
  }
}

export async function executeWorkflowDraftCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  userId: string;
}) {
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return json({ ok: false, error: "invalid_request", message: "Invalid JSON request." }, 400);
  }
  const parsed = DraftCommand.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported workflow draft command." },
      400
    );
  }

  const project = requireFlowcordiaProjectContext(input.context);
  const scope = await resolveWorkflowIndexScope(project);
  try {
    if (parsed.data.operation === "start") {
      const result = await startWorkflowDraft({
        scope,
        workflowId: parsed.data.workflowId,
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: result.created ? "started" : "resumed",
        draft: {
          publicId: result.draft.publicId,
          version: result.draft.version.toString(),
          documentSha256: result.draft.documentSha256,
          stale: result.stale,
        },
      });
    }
    if (parsed.data.operation === "edit") {
      const draft = await editWorkflowDraft({
        scope,
        publicId: parsed.data.draftId,
        expectedVersion: BigInt(parsed.data.expectedVersion),
        command: parsed.data.command as WorkflowEditCommand,
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: "saved",
        draft: {
          publicId: draft.publicId,
          version: draft.version.toString(),
          documentSha256: draft.documentSha256,
          stale: false,
        },
      });
    }
    const draft = await discardActiveWorkflowDraft({
      scope,
      publicId: parsed.data.draftId,
      expectedVersion: BigInt(parsed.data.expectedVersion),
      actorId: input.userId,
    });
    return json({
      ok: true,
      status: "discarded",
      draft: {
        publicId: draft.publicId,
        version: draft.version.toString(),
        documentSha256: draft.documentSha256,
        stale: false,
      },
    });
  } catch (error) {
    const normalized =
      error instanceof WorkflowDraftError
        ? error
        : new WorkflowDraftError(
            "draft_unavailable",
            "The workflow draft operation failed safely.",
            false
          );
    return json(
      {
        ok: false,
        error: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      },
      errorStatus(normalized)
    );
  }
}
