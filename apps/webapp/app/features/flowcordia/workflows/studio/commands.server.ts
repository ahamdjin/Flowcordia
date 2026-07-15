import { randomUUID } from "node:crypto";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { claimRequestedWorkflowIndexSync } from "../index/manual-claim.server";
import {
  getWorkflowIndexSync,
  requestWorkflowIndexSync,
} from "../index/repository.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { processWorkflowIndexClaim, WorkflowIndexSyncError } from "../index/service.server";

const WorkflowStudioCommand = z.object({ operation: z.literal("synchronize") }).strict();

export async function executeWorkflowStudioCommand(input: {
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
  const command = WorkflowStudioCommand.safeParse(body);
  if (!command.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported Studio command." },
      400
    );
  }

  const project = requireFlowcordiaProjectContext(input.context);
  const scope = await resolveWorkflowIndexScope(project);
  const existing = await getWorkflowIndexSync(scope);
  const now = new Date();
  if (
    existing?.status === "RUNNING" &&
    existing.lockExpiresAt &&
    existing.lockExpiresAt.getTime() > now.getTime()
  ) {
    return json(
      {
        ok: false,
        error: "sync_in_progress",
        message: "A workflow synchronization is already running.",
      },
      409
    );
  }

  const correlationId = randomUUID();
  const requested = await requestWorkflowIndexSync({
    scope,
    reason: existing ? "manual" : "initial",
    requestedCommitSha: null,
    actorId: input.userId,
    correlationId,
    now,
  });
  const claim = await claimRequestedWorkflowIndexSync({
    syncId: requested.id,
    scope,
    expectedGeneration: requested.generation,
    workerId: `request:${input.userId.slice(0, 64)}`,
    leaseMs: 120_000,
    now,
  });
  if (!claim) {
    return json(
      {
        ok: false,
        error: "sync_claim_conflict",
        message: "The synchronization was claimed by another worker. Refresh to see its status.",
      },
      409
    );
  }

  try {
    const result = await processWorkflowIndexClaim(claim);
    return json({
      ok: true,
      status: "synchronized",
      commitSha: result.commitSha,
      entryCount: result.entryCount,
      validCount: result.validCount,
      invalidCount: result.invalidCount,
    });
  } catch (error) {
    const normalized =
      error instanceof WorkflowIndexSyncError
        ? error
        : new WorkflowIndexSyncError(
            "workflow_index_failed",
            "Workflow synchronization failed safely.",
            false
          );
    return json(
      {
        ok: false,
        error: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      },
      normalized.retryable ? 503 : 409
    );
  }
}
