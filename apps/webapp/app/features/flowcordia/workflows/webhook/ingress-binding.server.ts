import type { FlowcordiaWebhookMethod } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import type { AuthenticatedEnvironment } from "~/services/apiAuth.server";

export interface FlowcordiaPublicWebhookIngressBinding {
  endpointStorageId: string;
  publicId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  workflowId: string;
  nodeId: string;
  revisionStorageId: string;
  revision: number;
  taskIdentifier: string;
  workerVersion: string;
  method: FlowcordiaWebhookMethod;
  path: string;
  maxBodyBytes: number;
  timestampToleranceSeconds: number;
  credentialEnvironmentName: string;
  credentialVersion: string;
  environment: AuthenticatedEnvironment;
}

export type FlowcordiaPublicWebhookBindingResolution =
  | { status: "ready"; binding: FlowcordiaPublicWebhookIngressBinding }
  | { status: "not_found" }
  | { status: "temporarily_unavailable"; reason: "credential_version" | "environment" };

const WEBHOOK_METHODS = new Set<FlowcordiaWebhookMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function resolveFlowcordiaPublicWebhookIngressBinding(
  publicId: string
): Promise<FlowcordiaPublicWebhookBindingResolution> {
  const endpoint = await prisma.flowcordiaWebhookEndpoint.findFirst({
    where: {
      publicId,
      revokedAt: null,
      activeRevisionId: { not: null },
      runtimeEnvironment: {
        type: "PRODUCTION",
        archivedAt: null,
        project: { deletedAt: null },
        organization: { deletedAt: null },
      },
    },
    select: {
      id: true,
      publicId: true,
      organizationId: true,
      projectId: true,
      runtimeEnvironmentId: true,
      workflowId: true,
      nodeId: true,
      activeRevisionId: true,
      activeRevision: {
        select: {
          id: true,
          endpointId: true,
          nodeId: true,
          revision: true,
          taskIdentifier: true,
          workerVersion: true,
          method: true,
          path: true,
          maxBodyBytes: true,
          timestampToleranceSeconds: true,
          credentialEnvironmentName: true,
          credentialVersion: true,
        },
      },
    },
  });
  if (!endpoint?.activeRevision || !endpoint.activeRevisionId) return { status: "not_found" };
  const revision = endpoint.activeRevision;
  if (
    revision.id !== endpoint.activeRevisionId ||
    revision.endpointId !== endpoint.id ||
    revision.nodeId !== endpoint.nodeId ||
    !WEBHOOK_METHODS.has(revision.method as FlowcordiaWebhookMethod)
  ) {
    return { status: "not_found" };
  }

  const credential = await prisma.environmentVariable.findFirst({
    where: {
      projectId: endpoint.projectId,
      key: revision.credentialEnvironmentName,
    },
    select: {
      values: {
        where: {
          environmentId: endpoint.runtimeEnvironmentId,
          isSecret: true,
        },
        select: { version: true },
        take: 1,
      },
    },
  });
  const currentCredentialVersion = credential?.values[0]?.version;
  if (
    currentCredentialVersion === undefined ||
    String(currentCredentialVersion) !== revision.credentialVersion
  ) {
    return { status: "temporarily_unavailable", reason: "credential_version" };
  }

  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      id: endpoint.runtimeEnvironmentId,
      organizationId: endpoint.organizationId,
      projectId: endpoint.projectId,
      type: "PRODUCTION",
      archivedAt: null,
      project: { deletedAt: null },
      organization: { deletedAt: null },
    },
    include: authIncludeBase,
  });
  if (!environment) {
    return { status: "temporarily_unavailable", reason: "environment" };
  }

  return {
    status: "ready",
    binding: {
      endpointStorageId: endpoint.id,
      publicId: endpoint.publicId,
      tenantId: endpoint.organizationId,
      projectId: endpoint.projectId,
      environmentId: endpoint.runtimeEnvironmentId,
      workflowId: endpoint.workflowId,
      nodeId: endpoint.nodeId,
      revisionStorageId: revision.id,
      revision: revision.revision,
      taskIdentifier: revision.taskIdentifier,
      workerVersion: revision.workerVersion,
      method: revision.method as FlowcordiaWebhookMethod,
      path: revision.path,
      maxBodyBytes: revision.maxBodyBytes,
      timestampToleranceSeconds: revision.timestampToleranceSeconds,
      credentialEnvironmentName: revision.credentialEnvironmentName,
      credentialVersion: revision.credentialVersion,
      environment: toAuthenticated(environment),
    },
  };
}
