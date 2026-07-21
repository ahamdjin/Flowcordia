import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../workflows/index/scope.server";
import { presentFlowcordiaOperationsHealth } from "./contract";
import { queryFlowcordiaOperationsMetrics } from "./query.server";

const MAX_REQUEST_BYTES = 1_024;
const OperationsCommand = z.object({ operation: z.literal("check") }).strict();

export async function executeFlowcordiaOperationsHealthCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
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
  if (!OperationsCommand.safeParse(body).success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported operations health command." },
      400
    );
  }

  const project = requireFlowcordiaProjectContext(input.context);
  try {
    const scope = await resolveWorkflowIndexScope(project);
    const checkedAt = new Date();
    const metrics = await queryFlowcordiaOperationsMetrics({ scope, now: checkedAt });
    return json({
      ok: true,
      status: "checked",
      health: presentFlowcordiaOperationsHealth({ metrics, checkedAt }),
    });
  } catch {
    return json(
      {
        ok: false,
        error: "operations_unavailable",
        message: "Flowcordia operations health is temporarily unavailable.",
        retryable: true,
      },
      503
    );
  }
}
