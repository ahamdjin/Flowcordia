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
import { workflowSourceProposalId } from "./source-proposal-identity";
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

const MAX_STANDARD_REQUEST_BYTES = 256 * 1024;
const MAX_SOURCE_EDIT_REQUEST_BYTES = 640 * 1024;
const EntityId = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const WorkflowId = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const PositiveVersion = z.string().regex(/^[1-9][0-9]*$/);
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

const ExpectedSource = z
  .object({
    publicId: z.string().uuid(),
    version: PositiveVersion,
    sourceSha256: Sha256,
  })
  .strict();

const DraftCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("start"), workflowId: WorkflowId }).strict(),
  z
    .object({
      operation: z.literal("edit"),
      draftId: z.string().uuid(),
      expectedVersion: PositiveVersion,
      command: EditCommand,
    })
    .strict(),
  z
    .object({
      operation: z.literal("discard"),
      draftId: z.string().uuid(),
      expectedVersion: PositiveVersion,
    })
    .strict(),
  z
    .object({
      operation: z.literal("test"),
      draftId: z.string().uuid(),
      expectedVersion: PositiveVersion,
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
      expectedVersion: PositiveVersion,
      sourceText: z.string(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reset_source"),
      sourceId: z.string().uuid(),
      expectedVersion: PositiveVersion,
    })
    .strict(),
  z
    .object({
      operation: z.literal("publish"),
      draftId: z.string().uuid(),
      expectedVersion: PositiveVersion,
      expectedSources: z.array(ExpectedSource).max(50).default([]),
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

function requestTooLarge() {
  return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
}

async function readCommand(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_EDIT_REQUEST_BYTES) {
    return { response: requestTooLarge() } as const;
  }

  let body: unknown;
  let requestBytes = 0;
  try {
    const bytes = await request.arrayBuffer();
    requestBytes = bytes.byteLength;
    if (requestBytes > MAX_SOURCE_EDIT_REQUEST_BYTES) {
      return { response: requestTooLarge() } as const;
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return {
      response: json(
        { ok: false, error: "invalid_request", message: "Invalid JSON request." },
        400,
      ),
    } as const;
  }

  const parsed = DraftCommand.safeParse(body);
  if (!parsed.success) {
    return {
      response: json(
        {
          ok: false,
          error: "invalid_request",
          message: "Unsupported workflow draft command.",
        },
        400,
      ),
    } as const;
  }
  if (parsed.data.operation !== "edit_source" && requestBytes > MAX_STANDARD_REQUEST_BYTES) {
    return { response: requestTooLarge() } as const;
  }
  return { command: parsed.data } as const;
}

export async function executeWorkflowDraftCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  userId: string;
}) {
  const parsed = await readCommand(input.request);
  if ("response" in parsed) return parsed.response;

  const project = requireFlowcordiaProjectContext(input.context);
  const scope = await resolveWorkflowIndexScope(project);
  const command = parsed.command;

  try {
    if (command.operation === "start") {
      const result = await startWorkflowDraft({
        scope,
        workflowId: command.workflowId,
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

    if (command.operation === "edit") {
      const draft = await editWorkflowDraft({
        scope,
        publicId: command.draftId,
        expectedVersion: BigInt(command.expectedVersion),
        command: command.command as WorkflowDraftEditCommand,
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

    if (command.operation === "test") {
      const result = await previewWorkflowDraft({
        scope,
        publicId: command.draftId,
        expectedVersion: BigInt(command.expectedVersion),
        payload: command.payload as import("@flowcordia/workflow").JsonValue,
        fixture: command.fixture,
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

    if (command.operation === "start_source") {
      const result = await startWorkflowDraftSource({
        scope,
        draftPublicId: command.draftId,
        nodeId: command.nodeId,
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: result.created ? "source_started" : "source_resumed",
        source: presentSource(result.source),
      });
    }

    if (command.operation === "edit_source") {
      const source = await editWorkflowDraftSource({
        scope,
        sourcePublicId: command.sourceId,
        expectedVersion: BigInt(command.expectedVersion),
        sourceText: command.sourceText,
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: "source_saved",
        source: presentSource(source),
      });
    }

    if (command.operation === "reset_source") {
      const source = await resetWorkflowDraftSource({
        scope,
        sourcePublicId: command.sourceId,
        expectedVersion: BigInt(command.expectedVersion),
        actorId: input.userId,
      });
      return json({
        ok: true,
        status: "source_reset",
        source: presentSource(source),
      });
    }

    if (command.operation === "publish") {
      const source = await getPublishableWorkflowDraftSourcePatches({
        scope,
        draftPublicId: command.draftId,
        expectedSources: command.expectedSources.map((expected) => ({
          publicId: expected.publicId,
          version: BigInt(expected.version),
          sourceSha256: expected.sourceSha256,
        })),
      });
      const draft = await getPublishableWorkflowDraftWithSourceChanges({
        scope,
        draftPublicId: command.draftId,
        expectedVersion: BigInt(command.expectedVersion),
        sourcePatchCount: source.patches.length,
      });
      const proposalId =
        source.patches.length > 0
          ? workflowSourceProposalId({
              draftPublicId: draft.publicId,
              draftVersion: draft.version,
              workflowSha256: draft.documentSha256,
              sourceDigest: source.digest,
            })
          : `studio-${draft.publicId.replaceAll("-", "")}-v${draft.version}`;
      const preview = await prepareFlowcordiaPreviewEnvironment({
        scope,
        workflowId: draft.workflowId,
        proposalId,
      });
      const proposalCommand = {
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
          ? await (
              await createSourceAwareProposalCommandService(scope)
            ).create({
              ...proposalCommand,
              sourcePatches: source.patches,
              sourceDigest: source.digest,
            })
          : await (await createProposalCommandService(scope)).create(proposalCommand);
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
          sourceDigest: source.digest,
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
      publicId: command.draftId,
      expectedVersion: BigInt(command.expectedVersion),
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
            false,
          );
    return json(
      {
        ok: false,
        error: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      },
      errorStatus(normalized),
    );
  }
}
