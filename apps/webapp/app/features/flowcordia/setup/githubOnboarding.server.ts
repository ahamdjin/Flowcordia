import { BranchTrackingConfigSchema } from "~/v3/github";
import { prisma } from "~/db.server";
import {
  createFlowcordiaGitHubApp,
  getFlowcordiaGitHubAppConfiguration,
} from "./githubAppConfiguration.server";
import { queryFlowcordiaRepositoryReadiness } from "~/features/flowcordia/workflows/readiness/query.server";
import type {
  FlowcordiaRepositoryReadinessCheck,
  FlowcordiaRepositoryReadinessProjection,
} from "~/features/flowcordia/workflows/readiness/presentation";
import { getWorkflowIndexSync } from "~/features/flowcordia/workflows/index/repository.server";
import { resolveWorkflowIndexScope } from "~/features/flowcordia/workflows/index/scope.server";
import { logger } from "~/services/logger.server";

export type GitHubCredentialReadinessState = "missing" | "ready" | "invalid" | "unreachable";

export type GitHubOnboardingState =
  | "github_app_missing"
  | "github_app_invalid"
  | "github_unreachable"
  | "installation_missing"
  | "installation_suspended"
  | "installation_deleted"
  | "repository_access_missing"
  | "repository_selection_required"
  | "repository_permission_lost"
  | "production_branch_missing"
  | "repository_content_required"
  | "synchronization_required"
  | "synchronization_running"
  | "synchronization_failed"
  | "ready";

export type GitHubOnboardingAction =
  | "configure_app"
  | "install_app"
  | "manage_installation"
  | "select_repository"
  | "update_branch"
  | "create_workflow"
  | "synchronize"
  | "refresh"
  | "open_studio";

export type GitHubOnboardingRepository = {
  id: string;
  installationId: string;
  appInstallationId: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export type GitHubOnboardingInstallation = {
  id: string;
  appInstallationId: string;
  accountHandle: string;
  repositories: GitHubOnboardingRepository[];
};

export type GitHubOnboardingProjection = {
  state: GitHubOnboardingState;
  title: string;
  summary: string;
  recovery: string | null;
  action: GitHubOnboardingAction;
  actionLabel: string;
  checkedAt: string;
  credentialState: GitHubCredentialReadinessState;
  installations: GitHubOnboardingInstallation[];
  connectedRepository: {
    id: string;
    fullName: string;
    productionBranch: string | null;
    installationId: string;
    appInstallationId: string;
  } | null;
  synchronization: {
    status: string;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  } | null;
  readiness: FlowcordiaRepositoryReadinessProjection | null;
};

type ProjectionInput = {
  checkedAt: Date;
  credentialState: GitHubCredentialReadinessState;
  installations: GitHubOnboardingInstallation[];
  latestInactiveInstallation: "suspended" | "deleted" | null;
  connectedRepository: GitHubOnboardingProjection["connectedRepository"];
  synchronization: GitHubOnboardingProjection["synchronization"];
  readiness: FlowcordiaRepositoryReadinessProjection | null;
};

function projection(
  input: ProjectionInput,
  value: Pick<
    GitHubOnboardingProjection,
    "state" | "title" | "summary" | "recovery" | "action" | "actionLabel"
  >
): GitHubOnboardingProjection {
  return {
    ...value,
    checkedAt: input.checkedAt.toISOString(),
    credentialState: input.credentialState,
    installations: input.installations,
    connectedRepository: input.connectedRepository,
    synchronization: input.synchronization,
    readiness: input.readiness,
  };
}

function checkById(
  readiness: FlowcordiaRepositoryReadinessProjection | null,
  id: FlowcordiaRepositoryReadinessCheck["id"]
): FlowcordiaRepositoryReadinessCheck | undefined {
  return readiness?.checks.find((check) => check.id === id);
}

function blockedOrUnavailable(check: FlowcordiaRepositoryReadinessCheck | undefined): boolean {
  return check?.state === "BLOCKED" || check?.state === "UNAVAILABLE";
}

export function deriveGitHubOnboardingProjection(
  input: ProjectionInput
): GitHubOnboardingProjection {
  if (input.credentialState === "missing") {
    return projection(input, {
      state: "github_app_missing",
      title: "Configure the GitHub App",
      summary: "Flowcordia does not have GitHub App credentials for this installation.",
      recovery: "Add and verify the App ID, slug, private key, and webhook secret.",
      action: "configure_app",
      actionLabel: "Configure GitHub App",
    });
  }

  if (input.credentialState === "invalid") {
    return projection(input, {
      state: "github_app_invalid",
      title: "Repair GitHub App credentials",
      summary: "GitHub rejected the configured App identity or private key.",
      recovery:
        "Replace the stored credentials with the current GitHub App values and verify again.",
      action: "configure_app",
      actionLabel: "Repair GitHub App",
    });
  }

  if (input.credentialState === "unreachable") {
    return projection(input, {
      state: "github_unreachable",
      title: "GitHub is temporarily unavailable",
      summary: "Flowcordia could not verify the configured GitHub App.",
      recovery: "Check outbound network access and GitHub availability, then run the check again.",
      action: "configure_app",
      actionLabel: "Check GitHub setup",
    });
  }

  if (!input.connectedRepository && input.installations.length === 0) {
    if (input.latestInactiveInstallation === "suspended") {
      return projection(input, {
        state: "installation_suspended",
        title: "Resume the GitHub App installation",
        summary: "The most recent GitHub App installation for this organization is suspended.",
        recovery: "Resume or reinstall the App in GitHub, then return here.",
        action: "install_app",
        actionLabel: "Open GitHub installation",
      });
    }

    if (input.latestInactiveInstallation === "deleted") {
      return projection(input, {
        state: "installation_deleted",
        title: "Reinstall the GitHub App",
        summary: "The previous GitHub App installation was removed.",
        recovery: "Install the App again and grant this organization repository access.",
        action: "install_app",
        actionLabel: "Reinstall GitHub App",
      });
    }

    return projection(input, {
      state: "installation_missing",
      title: "Install the GitHub App",
      summary: "The App is configured but has not been installed for this organization.",
      recovery: "Install the App and grant access to the repository Flowcordia should manage.",
      action: "install_app",
      actionLabel: "Install GitHub App",
    });
  }

  if (
    !input.connectedRepository &&
    input.installations.every((item) => item.repositories.length === 0)
  ) {
    return projection(input, {
      state: "repository_access_missing",
      title: "Grant repository access",
      summary: "The GitHub App installation does not expose any repositories to Flowcordia.",
      recovery: "Update the installation and grant access to at least one repository.",
      action: "manage_installation",
      actionLabel: "Manage repository access",
    });
  }

  if (!input.connectedRepository) {
    return projection(input, {
      state: "repository_selection_required",
      title: "Choose the first repository",
      summary: "Select the repository and production branch that will own Flowcordia workflows.",
      recovery: null,
      action: "select_repository",
      actionLabel: "Connect repository",
    });
  }

  const repositoryBinding = checkById(input.readiness, "repository-binding");
  if (repositoryBinding?.state === "UNAVAILABLE") {
    return projection(input, {
      state: "synchronization_failed",
      title: "Repository readiness is unavailable",
      summary: repositoryBinding.message,
      recovery: "Check the database and repository binding, then run the readiness check again.",
      action: "synchronize",
      actionLabel: "Retry repository check",
    });
  }

  const installationCheck = checkById(input.readiness, "github-installation");
  if (blockedOrUnavailable(installationCheck)) {
    return projection(input, {
      state:
        installationCheck?.state === "UNAVAILABLE" ? "github_unreachable" : "installation_missing",
      title:
        installationCheck?.state === "UNAVAILABLE"
          ? "GitHub installation check failed"
          : "Reconnect the GitHub App",
      summary:
        installationCheck?.message ??
        "The connected repository installation could not be verified.",
      recovery:
        installationCheck?.state === "UNAVAILABLE"
          ? "Check GitHub availability and retry."
          : "Reinstall or update the App so it can access the connected repository.",
      action: "install_app",
      actionLabel: "Open GitHub installation",
    });
  }

  const permissionChecks = [
    checkById(input.readiness, "contents-permission"),
    checkById(input.readiness, "pull-request-permission"),
    checkById(input.readiness, "checks-permission"),
  ];
  const permissionFailure = permissionChecks.find(blockedOrUnavailable);
  if (permissionFailure) {
    return projection(input, {
      state: "repository_permission_lost",
      title: "Restore repository permissions",
      summary: permissionFailure.message,
      recovery: "Update the GitHub App installation permissions and repository access, then retry.",
      action: "manage_installation",
      actionLabel: "Manage GitHub permissions",
    });
  }

  const productionBranch = checkById(input.readiness, "production-branch");
  if (blockedOrUnavailable(productionBranch) || !input.connectedRepository.productionBranch) {
    return projection(input, {
      state: "production_branch_missing",
      title: "Choose a valid production branch",
      summary:
        productionBranch?.message ??
        "The connected repository does not have a valid production branch.",
      recovery: "Enter a branch that exists and is visible to the GitHub App.",
      action: "update_branch",
      actionLabel: "Update production branch",
    });
  }

  const contentChecks = [
    checkById(input.readiness, "workflow-catalog"),
    checkById(input.readiness, "trigger-config"),
    checkById(input.readiness, "generated-task-discovery"),
  ];
  const contentFailure = contentChecks.find(blockedOrUnavailable);
  if (contentFailure) {
    return projection(input, {
      state: "repository_content_required",
      title: "Create or import the first workflow",
      summary: contentFailure.message,
      recovery:
        "Create the governed starter workflow or add the required Flowcordia files to the production branch.",
      action: "create_workflow",
      actionLabel: "Create starter workflow",
    });
  }

  const workflowIndex = checkById(input.readiness, "workflow-index");
  if (workflowIndex?.state === "UNAVAILABLE") {
    return projection(input, {
      state: "synchronization_failed",
      title: "Repository synchronization is unavailable",
      summary: workflowIndex.message,
      recovery: "Check GitHub and database availability, then run synchronization again.",
      action: "synchronize",
      actionLabel: "Retry synchronization",
    });
  }

  if (workflowIndex?.state === "BLOCKED") {
    if (
      input.synchronization?.status === "RUNNING" ||
      input.synchronization?.status === "PENDING"
    ) {
      return projection(input, {
        state: "synchronization_running",
        title: "Repository synchronization is running",
        summary: "Flowcordia is indexing the exact production branch head.",
        recovery: "Wait for the current synchronization to finish, then check again.",
        action: "refresh",
        actionLabel: "Check synchronization",
      });
    }

    if (input.synchronization?.status === "FAILED") {
      return projection(input, {
        state: "synchronization_failed",
        title: "Repository synchronization failed",
        summary:
          input.synchronization.lastErrorMessage ??
          "The repository could not be synchronized safely.",
        recovery: "Resolve the reported repository problem, then retry synchronization.",
        action: "synchronize",
        actionLabel: "Retry synchronization",
      });
    }

    return projection(input, {
      state: "synchronization_required",
      title: "Synchronize the repository",
      summary: workflowIndex.message,
      recovery: "Index the exact production branch before Flowcordia advances setup.",
      action: "synchronize",
      actionLabel: "Synchronize repository",
    });
  }

  const essentialChecks = input.readiness?.checks.filter(
    (check) => check.id !== "preview-deployments"
  );
  if (!essentialChecks || essentialChecks.some((check) => check.state !== "PASSED")) {
    return projection(input, {
      state: "synchronization_required",
      title: "Finish repository readiness",
      summary: "One or more required repository checks have not passed yet.",
      recovery: "Run synchronization again after resolving the remaining repository checks.",
      action: "synchronize",
      actionLabel: "Check repository again",
    });
  }

  return projection(input, {
    state: "ready",
    title: "GitHub repository is ready",
    summary: "The App, installation, repository, production branch, and workflow index are ready.",
    recovery: null,
    action: "open_studio",
    actionLabel: "Open Flowcordia Studio",
  });
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = Reflect.get(error, "status");
  return typeof status === "number" ? status : undefined;
}

export async function getGitHubCredentialReadiness(): Promise<GitHubCredentialReadinessState> {
  const configuration = await getFlowcordiaGitHubAppConfiguration();
  if (!configuration) return "missing";

  try {
    const app = createFlowcordiaGitHubApp(configuration);
    const response = await app.octokit.rest.apps.getAuthenticated();
    const identity = response.data;
    if (!identity || identity.id !== configuration.appId || identity.slug !== configuration.slug) {
      return "invalid";
    }
    return "ready";
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401 || status === 403 || status === 404) return "invalid";
    if (error instanceof Error && /private key|PEM|decoder|unsupported/i.test(error.message)) {
      return "invalid";
    }
    logger.warn("Flowcordia GitHub App readiness check failed", {
      errorName: error instanceof Error ? error.name : "UnknownGitHubReadinessError",
      status,
    });
    return "unreachable";
  }
}

export async function getGitHubOnboardingProjection(input: {
  organizationId: string;
  projectId: string;
  now?: () => Date;
}): Promise<GitHubOnboardingProjection> {
  const checkedAt = input.now?.() ?? new Date();
  const [credentialState, installations, connection] = await Promise.all([
    getGitHubCredentialReadiness(),
    prisma.githubAppInstallation.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        appInstallationId: true,
        accountHandle: true,
        deletedAt: true,
        suspendedAt: true,
        repositories: {
          orderBy: { fullName: "asc" },
          take: 200,
          select: {
            id: true,
            fullName: true,
            defaultBranch: true,
            private: true,
          },
        },
      },
    }),
    prisma.connectedGithubRepository.findUnique({
      where: { projectId: input.projectId },
      select: {
        repositoryId: true,
        branchTracking: true,
        repository: {
          select: {
            fullName: true,
            defaultBranch: true,
            installation: {
              select: {
                id: true,
                appInstallationId: true,
                deletedAt: true,
                suspendedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const activeInstallations: GitHubOnboardingInstallation[] = installations
    .filter((installation) => !installation.deletedAt && !installation.suspendedAt)
    .map((installation) => ({
      id: installation.id,
      appInstallationId: installation.appInstallationId.toString(),
      accountHandle: installation.accountHandle,
      repositories: installation.repositories.map((repository) => ({
        id: repository.id,
        installationId: installation.id,
        appInstallationId: installation.appInstallationId.toString(),
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        private: repository.private,
      })),
    }));

  const latestInactive = installations.find(
    (installation) => installation.suspendedAt || installation.deletedAt
  );
  const latestInactiveInstallation = latestInactive?.suspendedAt
    ? "suspended"
    : latestInactive?.deletedAt
      ? "deleted"
      : null;

  const parsedBranchTracking = connection
    ? BranchTrackingConfigSchema.safeParse(connection.branchTracking)
    : null;
  const productionBranch = connection
    ? parsedBranchTracking?.success
      ? (parsedBranchTracking.data.prod.branch ?? connection.repository.defaultBranch)
      : null
    : null;
  const connectedRepository = connection
    ? {
        id: connection.repositoryId,
        fullName: connection.repository.fullName,
        productionBranch,
        installationId: connection.repository.installation.id,
        appInstallationId: connection.repository.installation.appInstallationId.toString(),
      }
    : null;

  if (connection?.repository.installation.suspendedAt) {
    return deriveGitHubOnboardingProjection({
      checkedAt,
      credentialState,
      installations: [],
      latestInactiveInstallation: "suspended",
      connectedRepository: null,
      synchronization: null,
      readiness: null,
    });
  }
  if (connection?.repository.installation.deletedAt) {
    return deriveGitHubOnboardingProjection({
      checkedAt,
      credentialState,
      installations: [],
      latestInactiveInstallation: "deleted",
      connectedRepository: null,
      synchronization: null,
      readiness: null,
    });
  }

  let readiness: FlowcordiaRepositoryReadinessProjection | null = null;
  let synchronization: GitHubOnboardingProjection["synchronization"] = null;
  if (connectedRepository?.productionBranch) {
    try {
      const context = {
        organizationId: input.organizationId,
        projectId: input.projectId,
        projectFound: true as const,
      };
      const scope = await resolveWorkflowIndexScope({
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      const [repositoryReadiness, sync] = await Promise.all([
        queryFlowcordiaRepositoryReadiness({ context, now: () => checkedAt }),
        getWorkflowIndexSync(scope),
      ]);
      readiness = repositoryReadiness;
      synchronization = sync
        ? {
            status: sync.status,
            lastErrorCode: sync.lastErrorCode,
            lastErrorMessage: sync.lastErrorMessage,
          }
        : null;
    } catch (error) {
      logger.error("Flowcordia GitHub onboarding readiness query failed", { error });
      readiness = {
        state: "UNAVAILABLE",
        checkedAt: checkedAt.toISOString(),
        repository: {
          owner: connectedRepository.fullName.split("/")[0] ?? "unknown",
          name: connectedRepository.fullName.split("/")[1] ?? connectedRepository.fullName,
          branch: connectedRepository.productionBranch ?? "unknown",
          commitSha: null,
        },
        checks: [
          {
            id: "repository-binding",
            label: "Repository binding",
            state: "UNAVAILABLE",
            message: "Repository onboarding readiness is temporarily unavailable.",
          },
        ],
      };
    }
  }

  return deriveGitHubOnboardingProjection({
    checkedAt,
    credentialState,
    installations: activeInstallations,
    latestInactiveInstallation,
    connectedRepository,
    synchronization,
    readiness,
  });
}

export async function getSelectableGitHubRepository(input: {
  organizationId: string;
  repositoryId: string;
}) {
  return prisma.githubRepository.findFirst({
    where: {
      id: input.repositoryId,
      installation: {
        organizationId: input.organizationId,
        deletedAt: null,
        suspendedAt: null,
      },
    },
    select: {
      id: true,
      fullName: true,
      defaultBranch: true,
      installation: { select: { id: true, appInstallationId: true } },
    },
  });
}
