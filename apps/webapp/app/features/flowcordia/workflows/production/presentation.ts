import type { ProposalState } from "@flowcordia/control-plane";
import {
  presentFlowcordiaRunMetadata,
  type FlowcordiaLiveNodeState,
} from "../preview/presentation";
import {
  isSameFlowcordiaProductionRunIdentity,
  presentFlowcordiaProductionRunIdentity,
} from "./identity";

const TERMINAL_RUN_STATUSES = new Set([
  "COMPLETED_SUCCESSFULLY",
  "COMPLETED_WITH_ERRORS",
  "CANCELED",
  "SYSTEM_FAILURE",
  "CRASHED",
  "INTERRUPTED",
  "EXPIRED",
  "TIMED_OUT",
]);

export interface FlowcordiaProductionProjection {
  state:
    | "NOT_PROMOTED"
    | "UNAVAILABLE"
    | "WAITING_FOR_DEPLOYMENT"
    | "DEPLOYING"
    | "OUT_OF_SYNC"
    | "READY"
    | "FAILED";
  message: string;
  proposal: {
    proposalId: string;
    headSha: string;
    mergeCommitSha: string;
  } | null;
  deployment: {
    shortCode: string;
    version: string;
    status: string;
    commitSha: string;
    createdAt: string;
    deployedAt: string | null;
  } | null;
  latestRun: {
    friendlyId: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    nodes: FlowcordiaLiveNodeState[];
    proof: "PENDING" | "VERIFIED" | "FAILED";
  } | null;
}

export function unavailableFlowcordiaProduction(): FlowcordiaProductionProjection {
  return {
    state: "UNAVAILABLE",
    message: "Production deployment state is temporarily unavailable.",
    proposal: null,
    deployment: null,
    latestRun: null,
  };
}

export function presentFlowcordiaProduction(input: {
  workflowId: string;
  proposal: {
    proposalId: string;
    headSha: string | null;
    mergeCommitSha: string | null;
    state: ProposalState;
  } | null;
  environment: { id: string } | null;
  deployment: {
    shortCode: string;
    version: string;
    status: string;
    commitSHA: string | null;
    createdAt: Date;
    deployedAt: Date | null;
    workerId: string | null;
  } | null;
  run: {
    friendlyId: string;
    status: string;
    metadata: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    lockedToVersionId: string | null;
  } | null;
}): FlowcordiaProductionProjection {
  const proposal =
    input.proposal?.state === "MERGED" && input.proposal.headSha && input.proposal.mergeCommitSha
      ? {
          proposalId: input.proposal.proposalId,
          headSha: input.proposal.headSha,
          mergeCommitSha: input.proposal.mergeCommitSha,
        }
      : null;
  const deployment = input.deployment?.commitSHA
    ? {
        shortCode: input.deployment.shortCode,
        version: input.deployment.version,
        status: input.deployment.status,
        commitSha: input.deployment.commitSHA,
        createdAt: input.deployment.createdAt.toISOString(),
        deployedAt: input.deployment.deployedAt?.toISOString() ?? null,
      }
    : null;
  const authoritativeDeployment = Boolean(
    proposal && deployment && deployment.commitSha === proposal.mergeCommitSha
  );
  const expectedIdentity = proposal
    ? {
        workflowId: input.workflowId,
        proposalId: proposal.proposalId,
        mergeCommitSha: proposal.mergeCommitSha,
      }
    : null;
  const runIdentity = presentFlowcordiaProductionRunIdentity(input.run?.metadata ?? null);
  const trustedRun = Boolean(
    input.run &&
    authoritativeDeployment &&
    input.deployment?.status === "DEPLOYED" &&
    input.deployment.workerId &&
    input.run.lockedToVersionId === input.deployment.workerId &&
    expectedIdentity &&
    isSameFlowcordiaProductionRunIdentity(runIdentity, expectedIdentity)
  );
  const nodes = trustedRun
    ? presentFlowcordiaRunMetadata(input.run?.metadata ?? null, input.workflowId)
    : [];
  const proof: "PENDING" | "VERIFIED" | "FAILED" | null = input.run
    ? input.run.status === "COMPLETED_SUCCESSFULLY" && nodes.length > 0
      ? "VERIFIED"
      : TERMINAL_RUN_STATUSES.has(input.run.status)
        ? "FAILED"
        : "PENDING"
    : null;
  const latestRun =
    input.run && trustedRun && proof
      ? {
          friendlyId: input.run.friendlyId,
          status: input.run.status,
          createdAt: input.run.createdAt.toISOString(),
          startedAt: input.run.startedAt?.toISOString() ?? null,
          completedAt: input.run.completedAt?.toISOString() ?? null,
          nodes,
          proof,
        }
      : null;

  if (!proposal) {
    return {
      state: "NOT_PROMOTED",
      message: "Promote a reviewed proposal before running production proof.",
      proposal: null,
      deployment: null,
      latestRun: null,
    };
  }
  if (!input.environment || !input.deployment || !deployment) {
    return {
      state: "WAITING_FOR_DEPLOYMENT",
      message: "Waiting for a production deployment record for the exact merge commit.",
      proposal,
      deployment: null,
      latestRun: null,
    };
  }
  if (!authoritativeDeployment) {
    return {
      state: "OUT_OF_SYNC",
      message:
        "The latest production deployment does not match the latest promoted workflow commit.",
      proposal,
      deployment,
      latestRun: null,
    };
  }
  if (["FAILED", "CANCELED", "TIMED_OUT"].includes(deployment.status)) {
    return {
      state: "FAILED",
      message: "The exact production deployment did not complete successfully.",
      proposal,
      deployment,
      latestRun: null,
    };
  }
  if (deployment.status !== "DEPLOYED" || !input.deployment.workerId) {
    return {
      state: "DEPLOYING",
      message: "The exact merge commit is still deploying to production.",
      proposal,
      deployment,
      latestRun: null,
    };
  }
  return {
    state: "READY",
    message:
      latestRun?.proof === "VERIFIED"
        ? "Production execution proof is verified for the exact promoted commit."
        : latestRun?.proof === "FAILED"
          ? "The production run finished without successful trusted node evidence."
          : latestRun
            ? "The exact production run is active."
            : "Production is deployed. Run an explicit proof execution when side effects are safe.",
    proposal,
    deployment,
    latestRun,
  };
}
