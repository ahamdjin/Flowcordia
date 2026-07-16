import type { RbacAbility } from "@trigger.dev/rbac";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { FlowcordiaPreviewRunError, triggerFlowcordiaPreviewRun } from "./trigger.server";

const PreviewCommand = z
  .object({
    operation: z.literal("run"),
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    expectedHeadSha: z.string().regex(/^[0-9a-f]{40}$/),
    requestId: z.string().uuid(),
    payload: z.unknown().refine((value) => value !== undefined, "Payload is required."),
  })
  .strict();

export async function executeFlowcordiaPreviewCommand(input: {
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
  const parsed = PreviewCommand.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported preview command." },
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
    const result = await triggerFlowcordiaPreviewRun({
      scope,
      workflowId: parsed.data.workflowId,
      expectedHeadSha: parsed.data.expectedHeadSha,
      requestId: parsed.data.requestId,
      payload: parsed.data.payload as import("@flowcordia/workflow").JsonValue,
    });
    return json({ ok: true, status: "started", run: result });
  } catch (error) {
    if (error instanceof FlowcordiaPreviewRunError) {
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
        message: "The live preview run could not be started.",
        retryable: true,
      },
      503
    );
  }
}
