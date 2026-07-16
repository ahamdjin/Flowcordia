import type { ProposalState } from "@flowcordia/control-plane";
import { prisma } from "~/db.server";
import { flowcordiaProposalStore } from "../prisma.server";
import {
  requireFlowcordiaProjectContext,
  resolveControlPlaneScope,
  type FlowcordiaProjectContext,
} from "../scope.server";
import {
  presentFlowcordiaProposal,
  presentFlowcordiaProposalWorkspaceCursor,
} from "./presentation";

const PAGE_SIZE = 50;

async function resolveInternalCursor(input: {
  tenantId: string;
  projectId: string;
  repositoryId: string;
  cursor?: { updatedAt: Date; proposalId: string };
}) {
  if (!input.cursor) return undefined;
  const anchor = await prisma.flowcordiaWorkflowProposal.findFirst({
    where: {
      organizationId: input.tenantId,
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      proposalId: input.cursor.proposalId,
    },
    select: { id: true },
  });
  if (!anchor) throw new Response("Proposal cursor is invalid.", { status: 400 });
  return { updatedAt: input.cursor.updatedAt, storageId: anchor.id };
}

export async function queryFlowcordiaProposalWorkspace(input: {
  context: FlowcordiaProjectContext;
  state?: ProposalState;
  cursor?: { updatedAt: Date; proposalId: string };
}) {
  const scope = await resolveControlPlaneScope(requireFlowcordiaProjectContext(input.context));
  const cursor = await resolveInternalCursor({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    repositoryId: scope.repositoryId,
    cursor: input.cursor,
  });
  const aggregates = await flowcordiaProposalStore.listProposals({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    repositoryId: scope.repositoryId,
    states: input.state ? [input.state] : undefined,
    // Read one look-ahead row so an exact 50-row final page does not expose a
    // dead “next” link. The store contract allows up to 100 rows.
    limit: PAGE_SIZE + 1,
    cursor,
  });
  const proposals = aggregates.slice(0, PAGE_SIZE);
  const last = proposals.at(-1);

  return {
    proposals: proposals.map(presentFlowcordiaProposal),
    repository: { ...scope.repository },
    nextCursor:
      aggregates.length > PAGE_SIZE && last ? presentFlowcordiaProposalWorkspaceCursor(last) : null,
  };
}
