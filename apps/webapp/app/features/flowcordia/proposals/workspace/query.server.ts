import type { ProposalState } from "@flowcordia/control-plane";
import { evaluateProposalPolicy } from "@flowcordia/github-proposals";
import { prisma } from "~/db.server";
import {
  presentFlowcordiaProposalGovernanceEvidence,
  presentFlowcordiaProposalGovernancePolicy,
} from "../governance/presentation";
import { resolveFlowcordiaProposalGovernance } from "../governance/service.server";
import { createGitHubProposalSnapshotReader } from "../github.server";
import { flowcordiaProposalStore } from "../prisma.server";
import {
  requireFlowcordiaProjectContext,
  type FlowcordiaProjectContext,
} from "../scope.server";
import { resolveWorkflowIndexScope } from "../../workflows/index/scope.server";
import { queryFlowcordiaFunctionValidation } from "../../workflows/validation/query.server";
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
  selectedProposalId?: string;
  cursor?: { updatedAt: Date; proposalId: string };
}) {
  const scope = await resolveWorkflowIndexScope(
    requireFlowcordiaProjectContext(input.context)
  );
  const cursor = await resolveInternalCursor({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    repositoryId: scope.repositoryId,
    cursor: input.cursor,
  });
  const [aggregates, governance] = await Promise.all([
    flowcordiaProposalStore.listProposals({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      repositoryId: scope.repositoryId,
      states: input.state ? [input.state] : undefined,
      // Read one look-ahead row so an exact 50-row final page does not expose a
      // dead “next” link. The store contract allows up to 100 rows.
      limit: PAGE_SIZE + 1,
      cursor,
    }),
    resolveFlowcordiaProposalGovernance(scope),
  ]);
  const proposals = aggregates.slice(0, PAGE_SIZE);
  const last = proposals.at(-1);
  const selected = input.selectedProposalId
    ? proposals.find((proposal) => proposal.proposalId === input.selectedProposalId) ?? null
    : proposals[0] ?? null;

  let selectedGovernance = presentFlowcordiaProposalGovernanceEvidence({
    governance,
    snapshot: null,
    evaluation: null,
    expectedHeadSha: selected?.headSha ?? null,
    functionValidation: {
      state: selected ? "NOT_REQUESTED" : "NOT_REQUIRED",
      message: selected
        ? "Repository function validation has not been evaluated for this proposal."
        : "No proposal is selected.",
    },
  });
  if (selected?.pullRequestNumber && selected.headSha) {
    try {
      const [snapshot, functionValidation] = await Promise.all([
        (await createGitHubProposalSnapshotReader(scope)).read(selected.pullRequestNumber),
        queryFlowcordiaFunctionValidation({
          scope,
          workflowId: selected.workflowId,
          expectedProposalId: selected.proposalId,
          expectedHeadSha: selected.headSha,
        }),
      ]);
      const evaluation = evaluateProposalPolicy({
        snapshot,
        policy: governance.effectivePolicy,
        expectedHeadSha: selected.headSha,
        expectedBaseBranch: scope.repository.branch,
        expectedProposalBranch: selected.proposalBranch,
        proposalCreatorReviewerId: selected.creatorReviewerId,
      });
      selectedGovernance = presentFlowcordiaProposalGovernanceEvidence({
        governance,
        snapshot,
        evaluation,
        expectedHeadSha: selected.headSha,
        functionValidation,
      });
    } catch {
      selectedGovernance = presentFlowcordiaProposalGovernanceEvidence({
        governance,
        snapshot: null,
        evaluation: null,
        expectedHeadSha: selected.headSha,
        functionValidation: {
          state: "UNAVAILABLE",
          message: "Repository function validation is temporarily unavailable.",
        },
        unavailableMessage: "Exact GitHub governance evidence is temporarily unavailable.",
      });
    }
  }

  return {
    proposals: proposals.map(presentFlowcordiaProposal),
    repository: { ...scope.repository },
    governancePolicy: presentFlowcordiaProposalGovernancePolicy(governance),
    selectedGovernance,
    nextCursor:
      aggregates.length > PAGE_SIZE && last ? presentFlowcordiaProposalWorkspaceCursor(last) : null,
  };
}
