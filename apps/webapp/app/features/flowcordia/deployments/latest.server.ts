import type { RuntimeEnvironmentType, WorkerDeploymentStatus } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { getFlowcordiaGitHubApp } from "../setup/githubAppConfiguration.server";
import { BranchTrackingConfigSchema, getTrackedBranchForEnvironment } from "~/v3/github";

const ACTIVE_DEPLOYMENT_STATUSES: WorkerDeploymentStatus[] = [
  "PENDING",
  "INSTALLING",
  "BUILDING",
  "DEPLOYING",
];

export type FlowcordiaLatestDeploymentState =
  | "NOT_CONNECTED"
  | "UNAVAILABLE"
  | "NOT_DEPLOYED"
  | "OUTDATED"
  | "DEPLOYING"
  | "FAILED"
  | "READY"
  | "CURRENT";

export type FlowcordiaLatestDeploymentProjection = {
  state: FlowcordiaLatestDeploymentState;
  repository: { fullName: string; htmlUrl: string } | null;
  branch: string | null;
  commitSha: string | null;
  deployedCommitSha: string | null;
  deploymentVersion: string | null;
  deploymentStatus: WorkerDeploymentStatus | null;
  message: string;
};

type DeploymentObservation = {
  commitSHA: string | null;
  version: string;
  status: WorkerDeploymentStatus;
};

export function deriveFlowcordiaLatestDeploymentProjection(input: {
  repository: { fullName: string; htmlUrl: string };
  branch: string;
  commitSha: string;
  exactDeployment: DeploymentObservation | null;
  currentDeployment: DeploymentObservation | null;
  environmentType: RuntimeEnvironmentType;
}): FlowcordiaLatestDeploymentProjection {
  const base = {
    repository: input.repository,
    branch: input.branch,
    commitSha: input.commitSha,
    deployedCommitSha: input.currentDeployment?.commitSHA ?? null,
  };

  if (input.exactDeployment && ACTIVE_DEPLOYMENT_STATUSES.includes(input.exactDeployment.status)) {
    return {
      ...base,
      state: "DEPLOYING",
      deploymentVersion: input.exactDeployment.version,
      deploymentStatus: input.exactDeployment.status,
      message: "The latest repository commit is being deployed.",
    };
  }

  if (
    input.currentDeployment?.commitSHA === input.commitSha &&
    input.currentDeployment.status === "DEPLOYED"
  ) {
    return {
      ...base,
      state: "CURRENT",
      deploymentVersion: input.currentDeployment.version,
      deploymentStatus: input.currentDeployment.status,
      message: "The latest repository commit is current.",
    };
  }

  if (input.exactDeployment?.status === "DEPLOYED") {
    return {
      ...base,
      state: input.environmentType === "PREVIEW" ? "CURRENT" : "READY",
      deploymentVersion: input.exactDeployment.version,
      deploymentStatus: input.exactDeployment.status,
      message:
        input.environmentType === "PREVIEW"
          ? "The latest preview commit is deployed."
          : "The latest repository commit is deployed and available to promote.",
    };
  }

  if (
    input.exactDeployment &&
    ["FAILED", "CANCELED", "TIMED_OUT"].includes(input.exactDeployment.status)
  ) {
    return {
      ...base,
      state: "FAILED",
      deploymentVersion: input.exactDeployment.version,
      deploymentStatus: input.exactDeployment.status,
      message: "The latest repository commit did not deploy successfully.",
    };
  }

  if (input.currentDeployment) {
    return {
      ...base,
      state: "OUTDATED",
      deploymentVersion: input.currentDeployment.version,
      deploymentStatus: input.currentDeployment.status,
      message: "A newer repository commit is available to deploy.",
    };
  }

  return {
    ...base,
    state: "NOT_DEPLOYED",
    deploymentVersion: null,
    deploymentStatus: null,
    message: "The connected repository has not been deployed to this environment yet.",
  };
}

function unavailable(
  message: string,
  partial: Partial<FlowcordiaLatestDeploymentProjection> = {}
): FlowcordiaLatestDeploymentProjection {
  return {
    state: "UNAVAILABLE",
    repository: null,
    branch: null,
    commitSha: null,
    deployedCommitSha: null,
    deploymentVersion: null,
    deploymentStatus: null,
    message,
    ...partial,
  };
}

export async function queryFlowcordiaLatestDeployment(input: {
  userId: string;
  organizationSlug: string;
  projectSlug: string;
  environmentSlug: string;
}): Promise<FlowcordiaLatestDeploymentProjection> {
  const project = await prisma.project.findFirst({
    where: {
      slug: input.projectSlug,
      organization: {
        slug: input.organizationSlug,
        members: { some: { userId: input.userId } },
      },
    },
    select: {
      id: true,
      connectedGithubRepository: {
        select: {
          branchTracking: true,
          previewDeploymentsEnabled: true,
          repository: {
            select: {
              fullName: true,
              htmlUrl: true,
              installation: {
                select: {
                  appInstallationId: true,
                  deletedAt: true,
                  suspendedAt: true,
                },
              },
            },
          },
        },
      },
      environments: {
        where: { slug: input.environmentSlug },
        select: { id: true, type: true, branchName: true },
        take: 1,
      },
    },
  });

  if (!project || project.environments.length !== 1) {
    return unavailable("The project environment could not be resolved.");
  }

  const connected = project.connectedGithubRepository;
  if (
    !connected ||
    connected.repository.installation.deletedAt ||
    connected.repository.installation.suspendedAt
  ) {
    return {
      ...unavailable("Connect a GitHub repository before deploying."),
      state: "NOT_CONNECTED",
    };
  }

  const branchTracking = BranchTrackingConfigSchema.safeParse(connected.branchTracking);
  const environment = project.environments[0]!;
  const branch = branchTracking.success
    ? getTrackedBranchForEnvironment(branchTracking.data, connected.previewDeploymentsEnabled, {
        type: environment.type,
        branchName: environment.branchName ?? undefined,
      })
    : undefined;
  const repository = {
    fullName: connected.repository.fullName,
    htmlUrl: connected.repository.htmlUrl,
  };

  if (!branch) {
    return unavailable("No tracked GitHub branch is configured for this environment.", {
      repository,
    });
  }

  const [owner, repo] = connected.repository.fullName.split("/");
  if (!owner || !repo) {
    return unavailable("The connected GitHub repository identity is invalid.", {
      repository,
      branch,
    });
  }

  try {
    const githubApp = await getFlowcordiaGitHubApp();
    if (!githubApp) {
      return unavailable("The GitHub App is not configured.", { repository, branch });
    }
    const octokit = await githubApp.getInstallationOctokit(
      Number(connected.repository.installation.appInstallationId)
    );
    const branchResponse = await octokit.rest.repos.getBranch({ owner, repo, branch });
    const commitSha = branchResponse.data.commit.sha;

    const [exactDeployment, currentPromotion] = await Promise.all([
      prisma.workerDeployment.findFirst({
        where: {
          projectId: project.id,
          environmentId: environment.id,
          commitSHA: commitSha,
        },
        orderBy: { createdAt: "desc" },
        select: { commitSHA: true, version: true, status: true },
      }),
      prisma.workerDeploymentPromotion.findFirst({
        where: { environmentId: environment.id, label: "current" },
        select: {
          deployment: {
            select: { commitSHA: true, version: true, status: true },
          },
        },
      }),
    ]);

    return deriveFlowcordiaLatestDeploymentProjection({
      repository,
      branch,
      commitSha,
      exactDeployment,
      currentDeployment: currentPromotion?.deployment ?? null,
      environmentType: environment.type,
    });
  } catch {
    return unavailable("The latest GitHub commit could not be checked right now.", {
      repository,
      branch,
    });
  }
}

export function canRequestFlowcordiaDeployLatest(
  status: FlowcordiaLatestDeploymentProjection
): boolean {
  return ["NOT_DEPLOYED", "OUTDATED", "FAILED"].includes(status.state);
}
