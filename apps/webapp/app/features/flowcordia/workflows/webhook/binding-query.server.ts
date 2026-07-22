import { prisma } from "~/db.server";

export interface FlowcordiaProductionWebhookBindingProjection {
  nodeId: string;
  publicId: string;
  state: "ACTIVE" | "INACTIVE" | "REVOKED";
  activeRevision: {
    revision: number;
    fingerprint: string;
    mergeCommitSha: string;
    workerVersion: string;
    taskIdentifier: string;
    method: string;
    path: string;
    createdAt: string;
  } | null;
}

export async function queryFlowcordiaProductionWebhookBindings(input: {
  organizationId: string;
  projectId: string;
  workflowId: string | null;
}): Promise<FlowcordiaProductionWebhookBindingProjection[]> {
  if (!input.workflowId) return [];
  const endpoints = await prisma.flowcordiaWebhookEndpoint.findMany({
    where: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      workflowId: input.workflowId,
      runtimeEnvironment: {
        type: "PRODUCTION",
        archivedAt: null,
        project: { deletedAt: null },
        organization: { deletedAt: null },
      },
    },
    orderBy: [{ nodeId: "asc" }, { id: "asc" }],
    select: {
      nodeId: true,
      publicId: true,
      activeRevisionId: true,
      revokedAt: true,
      activeRevision: {
        select: {
          revision: true,
          fingerprint: true,
          mergeCommitSha: true,
          workerVersion: true,
          taskIdentifier: true,
          method: true,
          path: true,
          createdAt: true,
          nodeId: true,
        },
      },
    },
  });
  return endpoints.map((endpoint) => {
    const activeRevision =
      endpoint.activeRevision && endpoint.activeRevision.nodeId === endpoint.nodeId
        ? {
            revision: endpoint.activeRevision.revision,
            fingerprint: endpoint.activeRevision.fingerprint,
            mergeCommitSha: endpoint.activeRevision.mergeCommitSha,
            workerVersion: endpoint.activeRevision.workerVersion,
            taskIdentifier: endpoint.activeRevision.taskIdentifier,
            method: endpoint.activeRevision.method,
            path: endpoint.activeRevision.path,
            createdAt: endpoint.activeRevision.createdAt.toISOString(),
          }
        : null;
    return {
      nodeId: endpoint.nodeId,
      publicId: endpoint.publicId,
      state: endpoint.revokedAt
        ? "REVOKED"
        : endpoint.activeRevisionId && activeRevision
          ? "ACTIVE"
          : "INACTIVE",
      activeRevision,
    };
  });
}
