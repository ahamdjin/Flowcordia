import { randomUUID } from "node:crypto";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../scope.server";
import { requireFlowcordiaProjectContext } from "../scope.server";
import { resolveWorkflowIndexScope } from "../../workflows/index/scope.server";
import { presentFlowcordiaProposalGovernancePolicy } from "./presentation";
import { updateFlowcordiaProposalGovernance } from "./service.server";
import { FlowcordiaProposalGovernanceError } from "./types";

const MAX_BODY_BYTES = 64 * 1024;
const Command = z
  .object({
    operation: z.literal("update"),
    expectedVersion: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    profile: z.unknown(),
  })
  .strict();

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body is too large", { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body is too large", { status: 413 });
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Response("Request body must be valid UTF-8 JSON", { status: 400 });
  }
}

function status(error: FlowcordiaProposalGovernanceError): 400 | 403 | 409 | 503 {
  switch (error.code) {
    case "invalid_policy":
      return 400;
    case "policy_weakening":
      return 403;
    case "policy_conflict":
    case "policy_corrupt":
      return 409;
    case "policy_unavailable":
      return 503;
  }
}

export async function executeFlowcordiaProposalGovernanceCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  userId: string;
}) {
  const parsed = Command.safeParse(await readBody(input.request));
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "invalid_policy",
        message: "Proposal governance command is invalid.",
        retryable: false,
      },
      400
    );
  }

  try {
    const scope = await resolveWorkflowIndexScope(requireFlowcordiaProjectContext(input.context));
    const governance = await updateFlowcordiaProposalGovernance({
      scope,
      profile: parsed.data.profile,
      expectedVersion:
        parsed.data.expectedVersion === null ? null : BigInt(parsed.data.expectedVersion),
      actorId: input.userId,
      correlationId: `proposal-governance:${randomUUID()}`,
    });
    return json({
      ok: true,
      status: "updated",
      governancePolicy: presentFlowcordiaProposalGovernancePolicy(governance),
    });
  } catch (error) {
    if (error instanceof FlowcordiaProposalGovernanceError) {
      return json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          retryable: error.retryable,
        },
        status(error)
      );
    }
    return json(
      {
        ok: false,
        error: "policy_unavailable",
        message: "Proposal governance could not be updated safely.",
        retryable: true,
      },
      503
    );
  }
}
