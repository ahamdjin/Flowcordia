import type { RbacAbility } from "@trigger.dev/rbac";
import { findInlineSecretPath, type JsonValue } from "@flowcordia/workflow";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import {
  FlowcordiaProductionRunError,
  triggerFlowcordiaProductionRun,
} from "./trigger.server";

export const FLOWCORDIA_PRODUCTION_CONFIRMATION = "RUN_FLOWCORDIA_PRODUCTION_PROOF" as const;

const ProductionCommand = z
  .object({
    operation: z.literal("run_production"),
    confirmation: z.literal(FLOWCORDIA_PRODUCTION_CONFIRMATION),
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    expectedProposalId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    expectedMergeCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
    requestId: z.string().uuid(),
    payload: z.unknown().refine((value) => value !== undefined, "Payload is required."),
  })
  .strict();

export async function executeFlowcordiaProductionCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  ability: RbacAbility;
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
  const parsed = ProductionCommand.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported production proof command." },
      400
    );
  }

  const payload = parsed.data.payload as JsonValue;
  if (findInlineSecretPath(payload)) {
    return json(
      {
        ok: false,
        error: "inline_secret_rejected",
        message: "Production proof payloads cannot contain inline secret-like values.",
      },
      400
    );
  }

  const taskIdentifier = `flowcordia-${parsed.data.workflowId}`;
  if (!input.ability.can("trigger", { type: "tasks", id: taskIdentifier })) {
    return json(
      { ok: false, error: "permission_denied", message: "You cannot trigger this workflow." },
      403
    );
  }

  try {
    const project = requireFlowcordiaProjectContext(input.context);
    const scope = await resolveWorkflowIndexScope(project);
    const result = await triggerFlowcordiaProductionRun({
      scope,
      workflowId: parsed.data.workflowId,
      expectedProposalId: parsed.data.expectedProposalId,
      expectedMergeCommitSha: parsed.data.expectedMergeCommitSha,
      requestId: parsed.data.requestId,
      payload,
    });
    return json({ ok: true, status: "started", run: result });
  } catch (error) {
    if (error instanceof FlowcordiaProductionRunError) {
      return json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          retryable: error.retryable,
        },
        error.status
      );
    }
    return json(
      {
        ok: false,
        error: "trigger_failed",
        message: "The production proof run could not be started.",
        retryable: true,
      },
      503
    );
  }
}
