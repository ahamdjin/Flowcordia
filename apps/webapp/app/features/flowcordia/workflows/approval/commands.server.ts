import type { RbacAbility } from "@trigger.dev/rbac";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { FlowcordiaApprovalDecisionError, decideFlowcordiaApproval } from "./decision";
import {
  createFlowcordiaApprovalDecisionDependencies,
  resolveFlowcordiaApprovalEnvironment,
} from "./repository.server";

const ApprovalCommand = z
  .object({
    operation: z.literal("decide_approval"),
    waitpointId: z.string().regex(/^waitpoint_[A-Za-z0-9_-]{1,255}$/),
    expectedWorkflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    expectedRunId: z.string().min(1).max(255),
    expectedNodeId: z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/),
    requestId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().max(2_000).optional(),
  })
  .strict();

export async function executeFlowcordiaApprovalCommand(input: {
  context: FlowcordiaProjectContext;
  environmentSlug: string;
  request: Request;
  userId: string;
  ability: RbacAbility;
}) {
  const maxRequestBytes = 16 * 1024;
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
    return json({ ok: false, error: "invalid_request", message: "Invalid approval request." }, 400);
  }
  const parsed = ApprovalCommand.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_request", message: "Invalid approval request." }, 400);
  }
  if (!input.ability.can("write", { type: "waitpoints", id: parsed.data.waitpointId })) {
    return json(
      { ok: false, error: "permission_denied", message: "You cannot decide this approval." },
      403
    );
  }

  const { organizationId, projectId } = requireFlowcordiaProjectContext(input.context);
  const environment = await resolveFlowcordiaApprovalEnvironment({
    organizationId,
    projectId,
    environmentSlug: input.environmentSlug,
  });
  if (!environment) {
    return json(
      { ok: false, error: "environment_not_found", message: "Environment not found." },
      404
    );
  }
  try {
    const result = await decideFlowcordiaApproval(
      {
        waitpointId: parsed.data.waitpointId,
        expectedWorkflowId: parsed.data.expectedWorkflowId,
        expectedRunId: parsed.data.expectedRunId,
        expectedNodeId: parsed.data.expectedNodeId,
        requestId: parsed.data.requestId,
        decision: parsed.data.decision,
        comment: parsed.data.comment,
        userId: input.userId,
      },
      createFlowcordiaApprovalDecisionDependencies({
        organizationId,
        projectId,
        environment,
      })
    );
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FlowcordiaApprovalDecisionError) {
      return json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          retryable: error.retryable,
          observedDecision: error.observedDecision,
        },
        error.status
      );
    }
    return json(
      {
        ok: false,
        error: "approval_completion_failed",
        message: "The approval could not be completed.",
        retryable: true,
      },
      503
    );
  }
}
