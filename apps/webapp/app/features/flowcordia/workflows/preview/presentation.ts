import type { ProposalState } from "@flowcordia/control-plane";
import type { FlowcordiaPreviewClosureProof } from "./closure-installation";
import {
  isSameFlowcordiaPreviewRunIdentity,
  presentFlowcordiaPreviewRunIdentity,
} from "./identity";

const NODE_ID = /^[a-z][a-z0-9_-]{1,127}$/;
const NODE_STATUS = new Set(["SUCCEEDED", "SKIPPED", "FAILED"]);
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

export interface FlowcordiaLiveNodeState {
  nodeId: string;
  operation: string;
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  message: string | null;
}

export interface FlowcordiaPreviewProjection {
  state:
    | "NOT_REQUESTED"
    | "UNAVAILABLE"
    | "DISABLED"
    | "WAITING_FOR_DEPLOYMENT"
    | "WAITING_FOR_CLOSURE"
    | "DEPLOYING"
    | "READY"
    | "FAILED"
    | "CLOSED";
  message: string;
  proposal: {
    proposalId: string;
    branch: string;
    pullRequestNumber: number | null;
    headSha: string | null;
  } | null;
  closure: FlowcordiaPreviewClosureProof | null;
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

export function unavailableFlowcordiaPreview(): FlowcordiaPreviewProjection {
  return {
    state: "UNAVAILABLE",
    message: "Preview deployment state is temporarily unavailable.",
    proposal: null,
    closure: null,
    deployment: null,
    latestRun: null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function presentFlowcordiaRunMetadata(
  value: string | null,
  workflowId: string
): FlowcordiaLiveNodeState[] {
  if (!value || value.length > 256 * 1024) return [];
  try {
    const root = record(JSON.parse(value));
    const flowcordia = record(root?.flowcordia);
    const nodes = record(flowcordia?.nodes);
    if (flowcordia?.schemaVersion !== "0.1" || flowcordia.workflowId !== workflowId || !nodes) {
      return [];
    }
    const entries = Object.entries(nodes);
    if (entries.length > 100) return [];
    const result: FlowcordiaLiveNodeState[] = [];
    for (const [nodeId, raw] of entries) {
      const node = record(raw);
      if (
        !NODE_ID.test(nodeId) ||
        typeof node?.operation !== "string" ||
        node.operation.length === 0 ||
        node.operation.length > 200 ||
        typeof node.status !== "string" ||
        !NODE_STATUS.has(node.status)
      ) {
        return [];
      }
      result.push({
        nodeId,
        operation: node.operation,
        status: node.status as FlowcordiaLiveNodeState["status"],
        // Runtime errors remain in the inherited logs. Arbitrary task metadata is
        // not trusted to carry a browser-safe diagnostic message.
        message: null,
      });
    }
    return result;
  } catch {
    return [];
  }
}

export function presentFlowcordiaPreview(input: {
  workflowId: string;
  previewDeploymentsEnabled: boolean;
  proposal: {
    proposalId: string;
    proposalBranch: string;
    pullRequestNumber: number | null;
    headSha: string | null;
    state: ProposalState;
  } | null;
  environment: { branchName: string | null } | null;
  deployment: {
    shortCode: string;
    version: string;
    status: string;
    commitSHA: string | null;
    createdAt: Date;
    deployedAt: Date | null;
    workerId: string | null;
  } | null;
  closure: FlowcordiaPreviewClosureProof | null;
  run: {
    friendlyId: string;
    status: string;
    metadata: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    lockedToVersionId: string | null;
  } | null;
}): FlowcordiaPreviewProjection {
  const proposal = input.proposal
    ? {
        proposalId: input.proposal.proposalId,
        branch: input.proposal.proposalBranch,
        pullRequestNumber: input.proposal.pullRequestNumber,
        headSha: input.proposal.headSha,
      }
    : null;
  const deployment =
    input.deployment?.commitSHA && input.proposal?.headSha === input.deployment.commitSHA
      ? {
          shortCode: input.deployment.shortCode,
          version: input.deployment.version,
          status: input.deployment.status,
          commitSha: input.deployment.commitSHA,
          createdAt: input.deployment.createdAt.toISOString(),
          deployedAt: input.deployment.deployedAt?.toISOString() ?? null,
        }
      : null;
  const expectedRunIdentity =
    input.proposal?.headSha && input.proposal.proposalId
      ? {
          workflowId: input.workflowId,
          proposalId: input.proposal.proposalId,
          headSha: input.proposal.headSha,
        }
      : null;
  const runIdentity = presentFlowcordiaPreviewRunIdentity(input.run?.metadata ?? null);
  const trustedRun = Boolean(
    input.run &&
    input.closure?.state === "READY" &&
    deployment &&
    input.deployment?.workerId &&
    input.run.lockedToVersionId === input.deployment.workerId &&
    expectedRunIdentity &&
    isSameFlowcordiaPreviewRunIdentity(runIdentity, expectedRunIdentity)
  );
  const runNodes = trustedRun
    ? presentFlowcordiaRunMetadata(input.run?.metadata ?? null, input.workflowId)
    : [];
  const runProof: "PENDING" | "VERIFIED" | "FAILED" | null = input.run
    ? input.run.status === "COMPLETED_SUCCESSFULLY" && runNodes.length > 0
      ? "VERIFIED"
      : TERMINAL_RUN_STATUSES.has(input.run.status)
        ? "FAILED"
        : "PENDING"
    : null;
  const latestRun =
    input.run && trustedRun && runProof
      ? {
          friendlyId: input.run.friendlyId,
          status: input.run.status,
          createdAt: input.run.createdAt.toISOString(),
          startedAt: input.run.startedAt?.toISOString() ?? null,
          completedAt: input.run.completedAt?.toISOString() ?? null,
          nodes: runNodes,
          proof: runProof,
        }
      : null;

  if (!input.proposal) {
    return {
      state: "NOT_REQUESTED",
      message: "Publish a proposal to create a preview deployment.",
      proposal,
      closure: null,
      deployment: null,
      latestRun: null,
    };
  }
  if (["MERGED", "CLOSED"].includes(input.proposal.state)) {
    return {
      state: "CLOSED",
      message: "This proposal no longer owns an active preview.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun,
    };
  }
  if (input.proposal.state === "FAILED") {
    return {
      state: "FAILED",
      message: "The proposal failed before its preview could become ready.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun,
    };
  }
  if (!input.previewDeploymentsEnabled) {
    return {
      state: "DISABLED",
      message: "GitHub preview deployments are disabled for this project.",
      proposal,
      closure: input.closure,
      deployment: null,
      latestRun: null,
    };
  }
  if (!input.environment || input.environment.branchName !== input.proposal.proposalBranch) {
    return {
      state: "WAITING_FOR_DEPLOYMENT",
      message: "The proposal preview environment is being prepared.",
      proposal,
      closure: input.closure,
      deployment: null,
      latestRun: null,
    };
  }
  if (!deployment) {
    return {
      state: "WAITING_FOR_DEPLOYMENT",
      message: "Waiting for the GitHub deployment of this exact proposal head.",
      proposal,
      closure: input.closure,
      deployment: null,
      latestRun: null,
    };
  }
  if (["FAILED", "CANCELED", "TIMED_OUT"].includes(deployment.status)) {
    return {
      state: "FAILED",
      message: "The preview deployment did not complete successfully.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun,
    };
  }
  if (deployment.status !== "DEPLOYED") {
    return {
      state: "DEPLOYING",
      message: "The exact proposal head is building in the preview environment.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun,
    };
  }
  if (!input.closure || input.closure.state === "NOT_RECORDED") {
    return {
      state: "FAILED",
      message: "Republish this proposal to record its immutable workflow closure.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun: null,
    };
  }
  if (input.closure.state === "INVALID") {
    return {
      state: "FAILED",
      message: "The stored proposal closure or worker task inventory is invalid.",
      proposal,
      closure: input.closure,
      deployment,
      latestRun: null,
    };
  }
  if (input.closure.state === "WAITING") {
    const missing = input.closure.missingWorkflowIds.length;
    return {
      state: "WAITING_FOR_CLOSURE",
      message: `Waiting for ${missing} workflow task${missing === 1 ? "" : "s"} on the exact preview worker.`,
      proposal,
      closure: input.closure,
      deployment,
      latestRun: null,
    };
  }
  return {
    state: "READY",
    message:
      latestRun?.proof === "VERIFIED"
        ? "Connected rollout proof verified for this exact proposal head."
        : latestRun?.proof === "FAILED"
          ? "The exact-head run finished without successful trusted node evidence."
          : latestRun
            ? "The exact-head live run is active."
            : "The complete proposal closure is installed. Run the generated root task to prove its live path.",
    proposal,
    closure: input.closure,
    deployment,
    latestRun,
  };
}
