import { json } from "@remix-run/node";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createProposalCommandService } from "../../proposals/service.server";
import { createSourceAwareProposalCommandService } from "../../proposals/source-command.server";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import {
  requireFlowcordiaProjectContext,
  resolveCreatorReviewerId,
} from "../../proposals/scope.server";
import { presentFlowcordiaProposalCommandError } from "../../proposals/workspace/presentation";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { prepareFlowcordiaPreviewEnvironment } from "../preview/environment.server";
import { WorkflowDraftError } from "./errors";
import {
  discardActiveWorkflowDraft,
  editWorkflowDraft,
  previewWorkflowDraft,
  startWorkflowDraft,
} from "./service.server";
import {
  editWorkflowDraftSource,
  getPublishableWorkflowDraftSourcePatches,
  getPublishableWorkflowDraftWithSourceChanges,
  resetWorkflowDraftSource,
  startWorkflowDraftSource,
} from "./source-service.server";
import type { WorkflowDraftSourceFileRecord } from "./source-types";
import { isWorkflowDraftSourceChanged } from "./source-types";
import type { WorkflowDraftEditCommand } from "./types";

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
  z
    .object({
      type: z.literal("add_function_node"),
      functionId: EntityId,
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
  z
    .object({
      type: z.literal("set_node_configuration"),
      nodeId: EntityId,
      configuration: z.record(z.unknown()),
    })
    .strict(),
  z.object({ type: z.literal("remove_node"), nodeId: EntityId }).strict(),
  z
    .object({
      type: z.literal("connect_nodes"),
      source: EntityId,
      target: EntityId,
      condition: z.enum(["true", "false"]).optional(),
    })
    .strict(),
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
  z
    .object({
      operation: z.literal("test"),
      draftId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
      payload: z.unknown(),
      fixture: z.object({ nodeId: EntityId, fixtureId: EntityId }).strict().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("start_source"),
      draftId: z.string().uuid(),
      nodeId: EntityId,
    })
    .strict(),
  z
    .object({
      operation: z.literal("edit_source"),
      sourceId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
      sourceText: z.string(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reset_source"),
      sourceId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal("publish"),
      draftId: z.string().uuid(),
      expectedVersion: z.string().regex(/^[1-9][0-9]*$/),
    })
    .strict(),
]);

function presentSource(source: WorkflowDraftSourceFileRecord) {
  return {
    publicId: source.publicId,
    functionId: source.functionId,
    sourcePath: source.sourcePath,
    exportName: source.exportName,
    sourceText: source.sourceText,
    sourceSha256: source.sourceSha256,
    baseSourceSha256: source.baseSourceSha256,
    version: source.version.toString(),
    changed: isWorkflowDraftSourceChanged(source),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function errorStatus(error: WorkflowDraftError): number {
  switch (error.code) {
    case "invalid_input":
    case "unsupported_edit":
    case "no_changes":
    case "compilation_failed":
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
  const maxRequestBytes = 256 * 1024;
  const declaredLength = Number(input.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
    return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
  }
  let body: unknown;
  try {
    const bytes = await input.request.arrayBuffer();
    if (bytes.byteLength > maxRequestBytes) {
      return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
        command: parsed.data.command as WorkflowDraftEditCommand,
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
    if (parsed.data.operation === "test") {
      const result = await previewWorkflowDraft({
        scope,
        publicId: parsed.data.draftId,
        expectedVersion: BigInt(parsed.data.expectedVersion),
        payload: parsed.data.payload as import("@flowcordia/workflow").JsonValue,
        fixture: parsed.data.fixture,
      });
      return json({
        ok: true,
        status: "tested",
        test: {
          success: result.success,
          output: result.output,
          traces: result.traces.map(({ nodeId, operation, status, message }) => ({
            nodeId,
            operation,
            status,
            message,
          })),
        },
      });
    }
    if (parsed.data.operation === "start_source") {
      const result = await startWorkflowDraftSource({
        scope,
        draftPublicId: parsed.data.draftId,
        nodeId: parsed.data.nodeId,
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: result.created ? "source_started" : "source_resumed",
        source: presentSource(result.source),
      });
    }
    if (parsed.data.operation === "edit_source") {
      const source = await editWorkflowDraftSource({
        scope,
        sourcePublicId: parsed.data.sourceId,
        expectedVersion: BigInt(parsed.data.expectedVersion),
        sourceText: parsed.data.sourceText,
        actorId: input.userId,
      });
      return json({ ok: true, status: "source_saved", source: presentSource(source) });
    }
    if (parsed.data.operation === "reset_source") {
      const source = await resetWorkflowDraftSource({
        scope,
        sourcePublicId: parsed.data.sourceId,
        expectedVersion: BigInt(parsed.data.expectedVersion),
        actorId: input.userId,
      });
      return json({ ok: true, status: "source_reset", source: presentSource(source) });
    }
    if (parsed.data.operation === "publish") {
      const source = await getPublishableWorkflowDraftSourcePatches({
        scope,
        draftPublicId: parsed.data.draftId,
      });
      const draft = await getPublishableWorkflowDraftWithSourceChanges({
        scope,
        draftPublicId: parsed.data.draftId,
        expectedVersion: BigInt(parsed.data.expectedVersion),
        sourcePatchCount: source.patches.length,
      });
      const baseProposalId = `studio-${draft.publicId.replaceAll("-", "")}-v${draft.version}`;
      const proposalId =
        source.patches.length > 0
          ? `${baseProposalId}-s${source.digest.slice(0, 16)}`
          : baseProposalId;
      const preview = await prepareFlowcordiaPreviewEnvironment({
        scope,
        workflowId: draft.workflowId,
        proposalId,
      });
      const command = {
        scope,
        proposalId,
        creatorReviewerId: await resolveCreatorReviewerId(input.userId),
        workflow: draft.document,
        expectedBaseCommitSha: draft.baseCommitSha,
        expectedBaseBlobSha: draft.baseBlobSha,
        actorId: input.userId,
        correlationId: `studio:${randomUUID()}`,
      };
      const result =
        source.patches.length > 0
          ? await (await createSourceAwareProposalCommandService(scope)).create({
              ...command,
              sourcePatches: source.patches,
              sourceDigest: source.digest,
            })
          : await (await createProposalCommandService(scope)).create(command);
      if (!result.success) {
        const presented = presentFlowcordiaProposalCommandError(result.error);
        return json({ ok: false, ...presented.error }, result.error.retryable ? 503 : 409);
      }
      return json({
        ok: true,
        status: "published",
        proposal: {
          proposalId: result.value.proposal.proposalId,
          state: result.value.proposal.state,
          pullRequestNumber: result.value.proposal.pullRequestNumber,
          headSha: result.value.proposal.headSha,
          sourcePatchCount: source.patches.length,
          preview: {
            state: preview.state,
            ...(preview.state === "READY" ? { branchName: preview.branchName } : {}),
            ...(preview.state !== "READY" ? { message: preview.message } : {}),
          },
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
