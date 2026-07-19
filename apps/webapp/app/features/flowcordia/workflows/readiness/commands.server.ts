import { json } from "@remix-run/node";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { parseFlowcordiaRepositoryReadinessCommand } from "./protocol";
import { queryFlowcordiaRepositoryReadiness } from "./query.server";

export async function executeFlowcordiaRepositoryReadinessCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
}) {
  let raw: string;
  try {
    raw = await input.request.text();
  } catch {
    return json(
      { ok: false as const, message: "The readiness request body could not be read." },
      { status: 400 }
    );
  }

  const command = parseFlowcordiaRepositoryReadinessCommand(raw);
  if (!command.success) {
    return json({ ok: false as const, message: command.message }, { status: 400 });
  }

  return json({
    ok: true as const,
    readiness: await queryFlowcordiaRepositoryReadiness({ context: input.context }),
  });
}
