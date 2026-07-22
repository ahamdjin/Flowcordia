import { randomBytes } from "node:crypto";
import {
  ProductionWebhookBindingService,
  type ActivatedProductionWebhookBinding,
  workflowSha256,
} from "@flowcordia/control-plane";
import {
  flowcordiaWebhookHmacEnvironmentName,
  parseFlowcordiaWebhookBinding,
} from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import { findLatestMergedFlowcordiaProposal } from "../production/repository.server";
import { flowcordiaProductionWebhookBindingStore } from "./binding-prisma.server";

export type FlowcordiaWebhookActivationErrorCode =
  | "promotion_conflict"
  | "production_not_ready"
  | "workflow_source_mismatch"
  | "webhook_node_invalid"
  | "credential_not_ready"
  | "activation_failed";

export class FlowcordiaWebhookActivationError extends Error {
  constructor(
    readonly code: FlowcordiaWebhookActivationErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaWebhookActivationError";
  }
}

function publicEndpointId(): string {
  return randomBytes(24).toString("base64url");
}

export interface ActivateFlowcordiaProductionWebhookInput {
  scope: WorkflowIndexScope;
  workflowId: string;
  nodeId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  activatedAt?: Date;
}

export interface ActivatedFlowcordiaProductionWebhook extends ActivatedProductionWebhookBinding {
  workflowId: string;
  nodeId: string;
  method: string;
  path: string;
  taskIdentifier: string;
  workerVersion: string;
  mergeCommitSha: string;
}

export async function activateFlowcordiaProductionWebhook(
  input: ActivateFlowcordiaProductionWebhookInput
): Promise<ActivatedFlowcordiaProductionWebhook> {
  const latestMerged = await findLatestMergedFlowcordiaProposal({
    scope: input.scope,
    workflowId: input.workflowId,
  });
  if (
    !latestMerged ||
    latestMerged.proposalId !== input.expectedProposalId ||
    latestMerged.mergeCommitSha !== input.expectedMergeCommitSha
  ) {
    throw new FlowcordiaWebhookActivationError(
      "promotion_conflict",
      "The promoted workflow identity changed before webhook activation.",
      409,
      false
    );
  }

  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      type: "PRODUCTION",
      archivedAt: null,
      project: { deletedAt: null },
      organization: { deletedAt: null },
    },
    select: { id: true },
  });
  if (!environment) {
    throw new FlowcordiaWebhookActivationError(
      "production_not_ready",
      "The production environment is unavailable.",
      409,
      true
    );
  }

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: environment.id,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      shortCode: true,
      version: true,
      status: true,
      workerId: true,
      commitSHA: true,
    },
  });
  if (
    !deployment ||
    deployment.status !== "DEPLOYED" ||
    !deployment.workerId ||
    deployment.commitSHA !== input.expectedMergeCommitSha
  ) {
    throw new FlowcordiaWebhookActivationError(
      "production_not_ready",
      "Webhook activation requires a deployed worker for the exact promoted commit.",
      409,
      true
    );
  }

  const taskIdentifier = `flowcordia-${input.workflowId}`;
  const task = await prisma.backgroundWorkerTask.findFirst({
    where: {
      projectId: input.scope.projectId,
      runtimeEnvironmentId: environment.id,
      workerId: deployment.workerId,
      slug: taskIdentifier,
    },
    select: { id: true },
  });
  if (!task) {
    throw new FlowcordiaWebhookActivationError(
      "production_not_ready",
      "The exact production worker does not contain the generated Flowcordia task.",
      409,
      false
    );
  }

  const { workflowStore } = await createWorkflowIndexGitHubGateway(input.scope);
  const source = await workflowStore.read({
    scope: input.scope,
    workflowId: input.workflowId,
    revision: input.expectedMergeCommitSha,
  });
  if (!source.success) {
    throw new FlowcordiaWebhookActivationError(
      "workflow_source_mismatch",
      "The exact promoted workflow source could not be loaded for activation.",
      409,
      source.error.retryable
    );
  }
  if (
    source.value.workflow.id !== input.workflowId ||
    source.value.source.commitSha !== input.expectedMergeCommitSha
  ) {
    throw new FlowcordiaWebhookActivationError(
      "workflow_source_mismatch",
      "The promoted workflow source identity no longer matches activation input.",
      409,
      false
    );
  }

  const node = source.value.workflow.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node || node.operation !== "trigger.webhook") {
    throw new FlowcordiaWebhookActivationError(
      "webhook_node_invalid",
      "The selected production workflow node is not a webhook trigger.",
      409,
      false
    );
  }
  const parsed = parseFlowcordiaWebhookBinding({
    configuration: node.configuration,
    credentialReferences: node.credentialReferences,
  });
  if (!parsed.success) {
    throw new FlowcordiaWebhookActivationError(
      "webhook_node_invalid",
      "The selected webhook trigger does not have a valid signed-ingress contract.",
      409,
      false
    );
  }

  const credentialEnvironmentName = flowcordiaWebhookHmacEnvironmentName(
    parsed.binding.credentialReference
  );
  const credential = await prisma.environmentVariable.findFirst({
    where: {
      projectId: input.scope.projectId,
      key: credentialEnvironmentName,
    },
    select: {
      values: {
        where: {
          environmentId: environment.id,
          isSecret: true,
        },
        select: { version: true },
        take: 1,
      },
    },
  });
  const credentialVersion = credential?.values[0]?.version;
  if (!credentialVersion) {
    throw new FlowcordiaWebhookActivationError(
      "credential_not_ready",
      "The webhook HMAC credential is not stored as a production secret.",
      409,
      false
    );
  }

  try {
    const activation = await new ProductionWebhookBindingService(
      flowcordiaProductionWebhookBindingStore
    ).activate({
      binding: {
        tenantId: input.scope.tenantId,
        projectId: input.scope.projectId,
        environmentId: environment.id,
        workflowId: input.workflowId,
        nodeId: input.nodeId,
        proposalId: latestMerged.proposalId,
        mergeCommitSha: latestMerged.mergeCommitSha,
        workflowPath: source.value.source.path,
        workflowBlobSha: source.value.source.blobSha,
        workflowCanonicalSha256: workflowSha256(source.value.workflow),
        deploymentId: deployment.id,
        deploymentShortCode: deployment.shortCode,
        workerId: deployment.workerId,
        workerVersion: deployment.version,
        taskIdentifier,
        method: parsed.binding.configuration.method,
        path: parsed.binding.configuration.path,
        maxBodyBytes: parsed.binding.configuration.maxBodyBytes,
        timestampToleranceSeconds: parsed.binding.configuration.timestampToleranceSeconds,
        credentialReference: parsed.binding.credentialReference,
        credentialEnvironmentName,
        credentialVersion: String(credentialVersion),
      },
      proposedPublicId: publicEndpointId(),
      activatedAt: input.activatedAt ?? new Date(),
    });
    return {
      ...activation,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      method: parsed.binding.configuration.method,
      path: parsed.binding.configuration.path,
      taskIdentifier,
      workerVersion: deployment.version,
      mergeCommitSha: latestMerged.mergeCommitSha,
    };
  } catch (error) {
    if (error instanceof FlowcordiaWebhookActivationError) throw error;
    throw new FlowcordiaWebhookActivationError(
      "activation_failed",
      "The immutable production webhook binding could not be activated.",
      503,
      true
    );
  }
}
