import type { ControlPlaneScope } from "@flowcordia/control-plane";
import { prisma } from "~/db.server";
import { BranchTrackingConfigSchema } from "~/v3/github";

export type FlowcordiaProjectContext =
  | { organizationId: string; projectId: string; projectFound: true }
  | { organizationId: undefined; projectId: undefined; projectFound: false };

export class FlowcordiaProposalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowcordiaProposalConfigurationError";
  }
}

/** Resolves route slugs to server-owned IDs once for authorization and proposal scope. */
export async function resolveFlowcordiaProjectContext(input: {
  organizationSlug: string;
  projectParam: string;
}): Promise<FlowcordiaProjectContext> {
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      OR: [{ slug: input.projectParam }, { externalRef: input.projectParam }],
      organization: { slug: input.organizationSlug, deletedAt: null },
    },
    select: { id: true, organizationId: true },
  });
  return project
    ? { organizationId: project.organizationId, projectId: project.id, projectFound: true }
    : { organizationId: undefined, projectId: undefined, projectFound: false };
}

export function requireFlowcordiaProjectContext(context: FlowcordiaProjectContext): {
  organizationId: string;
  projectId: string;
} {
  if (!context.projectFound) {
    throw new Response("Project not found", { status: 404 });
  }
  return { organizationId: context.organizationId, projectId: context.projectId };
}

function safeInstallationId(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected GitHub installation ID cannot be represented safely."
    );
  }
  return number;
}

function repositoryOwner(fullName: string, repositoryName: string): string {
  const separator = fullName.lastIndexOf("/");
  if (separator <= 0 || fullName.slice(separator + 1) !== repositoryName) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected GitHub repository identity is malformed."
    );
  }
  return fullName.slice(0, separator);
}

export async function resolveControlPlaneScope(input: {
  organizationId: string;
  projectId: string;
}): Promise<ControlPlaneScope> {
  const connection = await prisma.connectedGithubRepository.findFirst({
    where: {
      projectId: input.projectId,
      project: { organizationId: input.organizationId, deletedAt: null },
      repository: {
        installation: {
          organizationId: input.organizationId,
          deletedAt: null,
          suspendedAt: null,
        },
      },
    },
    include: { repository: { include: { installation: true } } },
  });
  if (!connection) {
    throw new FlowcordiaProposalConfigurationError(
      "This project does not have an active GitHub repository connection."
    );
  }

  const branchTracking = BranchTrackingConfigSchema.safeParse(connection.branchTracking);
  if (!branchTracking.success) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected repository branch policy is invalid."
    );
  }
  const branch = branchTracking.data.prod.branch ?? connection.repository.defaultBranch;
  if (!branch || branch.length > 255) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected repository does not have a valid production branch."
    );
  }

  return {
    tenantId: input.organizationId,
    projectId: input.projectId,
    installationId: safeInstallationId(connection.repository.installation.appInstallationId),
    repositoryId: connection.repository.id,
    repositoryGithubId: connection.repository.githubId.toString(),
    repository: {
      owner: repositoryOwner(connection.repository.fullName, connection.repository.name),
      name: connection.repository.name,
      branch,
    },
  };
}

function githubProfileId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return String(id);
  if (typeof id === "string" && /^[1-9][0-9]{0,39}$/.test(id)) return id;
  return null;
}

/** Resolves creator identity from the authenticated server-side profile, never request input. */
export async function resolveCreatorReviewerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { authenticationMethod: true, authenticationProfile: true },
  });
  return user?.authenticationMethod === "GITHUB"
    ? githubProfileId(user.authenticationProfile)
    : null;
}
