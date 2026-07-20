import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import {
  requireFlowcordiaProjectContext,
  resolveCreatorReviewerId,
} from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { FLOWCORDIA_ROLLBACK_CONFIRMATION } from "./command-contract";
import { FlowcordiaRollbackError } from "./errors";
import { createFlowcordiaRollbackProposal } from "./service.server";

const MAX_REQUEST_BYTES = 16 * 1024;
const WorkflowId = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const ProposalId = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78}[A-Za-z0-9])$/);
const CommitSha = z.string().regex(/^[0-9a-f]{40}$/);
const Reason = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    "Rollback reason contains unsupported control characters."
  );

const RollbackCommand = z
  .object({
    operation: z.literal("create_rollback"),
    confirmation: z.literal(FLOWCORDIA_ROLLBACK_CONFIRMATION),
    workflowId: WorkflowId,
    targetProposalId: ProposalId,
    expectedTargetHeadSha: CommitSha,
    expectedTargetMergeCommitSha: CommitSha,
    expectedCurrentProposalId: ProposalId,
    expectedCurrentHeadSha: CommitSha,
    expectedCurrentMergeCommitSha: CommitSha,
    expectedBaseCommitSha: CommitSha,
    expectedBaseBlobSha: CommitSha,
    reason: Reason,
  })
  .strict();

export async function executeFlowcordiaRollbackCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  userId: string;
}) {
  const declaredLength = Number(input.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
  }
  let body: unknown;
  try {
    const bytes = await input.request.arrayBuffer();
    if (bytes.byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return json({ ok: false, error: "invalid_request", message: "Invalid JSON request." }, 400);
  }
  const parsed = RollbackCommand.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported rollback command." },
      400
    );
  }

  try {
    const project = requireFlowcordiaProjectContext(input.context);
    const scope = await resolveWorkflowIndexScope(project);
    const result = await createFlowcordiaRollbackProposal({
      scope,
      workflowId: parsed.data.workflowId,
      targetProposalId: parsed.data.targetProposalId,
      expectedTargetHeadSha: parsed.data.expectedTargetHeadSha,
      expectedTargetMergeCommitSha: parsed.data.expectedTargetMergeCommitSha,
      expectedCurrentProposalId: parsed.data.expectedCurrentProposalId,
      expectedCurrentHeadSha: parsed.data.expectedCurrentHeadSha,
      expectedCurrentMergeCommitSha: parsed.data.expectedCurrentMergeCommitSha,
      expectedBaseCommitSha: parsed.data.expectedBaseCommitSha,
      expectedBaseBlobSha: parsed.data.expectedBaseBlobSha,
      reason: parsed.data.reason,
      actorId: input.userId,
      creatorReviewerId: await resolveCreatorReviewerId(input.userId),
    });
    return json({
      ok: true,
      status: "rollback_proposed",
      proposal: {
        proposalId: result.proposalId,
        state: result.state,
        headSha: result.headSha,
        pullRequestNumber: result.pullRequestNumber,
        sourcePatchCount: result.sourcePatchCount,
        targetProposalId: result.targetProposalId,
        targetMergeCommitSha: result.targetMergeCommitSha,
        currentProposalId: result.currentProposalId,
        currentMergeCommitSha: result.currentMergeCommitSha,
        preview: {
          state: result.preview.state,
          ...(result.preview.state === "READY" ? { branchName: result.preview.branchName } : {}),
          ...(result.preview.state !== "READY" ? { message: result.preview.message } : {}),
        },
      },
    });
  } catch (error) {
    const normalized =
      error instanceof FlowcordiaRollbackError
        ? error
        : new FlowcordiaRollbackError(
            "proposal_failed",
            "The rollback proposal could not be created safely.",
            503,
            true
          );
    return json(
      {
        ok: false,
        error: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      },
      normalized.status
    );
  }
}
