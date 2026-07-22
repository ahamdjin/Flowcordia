import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import {
  requireFlowcordiaProjectContext,
  resolveCreatorReviewerId,
} from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { FLOWCORDIA_BOOTSTRAP_CONFIRMATION } from "./command-contract";
import { FLOWCORDIA_STARTER_TEMPLATE_IDS } from "./contract";
import { FlowcordiaBootstrapError } from "./errors";
import { bootstrapFlowcordiaRepository } from "./service.server";

const MAX_REQUEST_BYTES = 16 * 1024;
const BootstrapCommand = z
  .object({
    operation: z.literal("bootstrap"),
    confirmation: z.literal(FLOWCORDIA_BOOTSTRAP_CONFIRMATION),
    templateId: z.enum(FLOWCORDIA_STARTER_TEMPLATE_IDS),
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000),
  })
  .strict();

export async function executeFlowcordiaBootstrapCommand(input: {
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
  const parsed = BootstrapCommand.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "invalid_request", message: "Unsupported repository bootstrap command." },
      400
    );
  }

  try {
    const project = requireFlowcordiaProjectContext(input.context);
    const scope = await resolveWorkflowIndexScope(project);
    const result = await bootstrapFlowcordiaRepository({
      scope,
      templateId: parsed.data.templateId,
      workflowId: parsed.data.workflowId,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      actorId: input.userId,
      creatorReviewerId: await resolveCreatorReviewerId(input.userId),
    });
    return json({
      ok: true,
      status: "proposal_created",
      workflow: {
        workflowId: result.workflow.id,
        name: result.workflow.name,
      },
      proposal: {
        proposalId: result.proposalId,
        state: result.proposalState,
        headSha: result.headSha,
        pullRequestNumber: result.pullRequestNumber,
        baseCommitSha: result.baseCommitSha,
        generatedPath: result.generatedPath,
        preview: {
          state: result.preview.state,
          ...(result.preview.state === "READY" ? { branchName: result.preview.branchName } : {}),
          ...(result.preview.state !== "READY" ? { message: result.preview.message } : {}),
        },
      },
    });
  } catch (error) {
    const normalized =
      error instanceof FlowcordiaBootstrapError
        ? error
        : new FlowcordiaBootstrapError(
            "repository_unavailable",
            "Repository bootstrap failed safely.",
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
