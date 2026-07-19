import { ProposalPersistenceError } from "@flowcordia/control-plane";
import { GitHubTransportError } from "@flowcordia/github-workflows";
import { prisma } from "~/db.server";
import { logger } from "~/services/logger.server";
import { assertCurrentFlowcordiaRepositoryBinding } from "../../github/binding.server";
import {
  FlowcordiaProposalConfigurationError,
  requireFlowcordiaProjectContext,
  type FlowcordiaProjectContext,
} from "../../proposals/scope.server";
import { getWorkflowIndexSync, listWorkflowIndexEntries } from "../index/repository.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import type { WorkflowIndexScope } from "../index/types";
import { inspectFlowcordiaTaskDiscovery } from "./configuration";
import { createFlowcordiaReadinessGitHub } from "./github.server";
import {
  presentFlowcordiaRepositoryReadiness,
  type FlowcordiaRepositoryReadinessCheck,
  type FlowcordiaRepositoryReadinessProjection,
} from "./presentation";

const TRIGGER_CONFIG_PATH = "trigger.config.ts";

function check(
  id: FlowcordiaRepositoryReadinessCheck["id"],
  label: string,
  state: FlowcordiaRepositoryReadinessCheck["state"],
  message: string
): FlowcordiaRepositoryReadinessCheck {
  return { id, label, state, message };
}

function installationChecks(
  installation: Awaited<ReturnType<typeof createFlowcordiaReadinessGitHub>>["installation"]
): FlowcordiaRepositoryReadinessCheck[] {
  return [
    check(
      "github-installation",
      "GitHub App installation",
      installation.installation,
      installation.installation === "PASSED"
        ? "The repository belongs to the active installation-scoped GitHub App."
        : installation.installation === "BLOCKED"
          ? "The GitHub App installation is suspended, missing, or cannot verify this repository."
          : "GitHub returned an invalid or temporarily unavailable installation response."
    ),
    check(
      "contents-permission",
      "Repository contents",
      installation.contents,
      installation.contents === "PASSED"
        ? "Proposal branch and generated artifact publication have contents write access."
        : "The GitHub App requires repository contents write access."
    ),
    check(
      "pull-request-permission",
      "Pull requests",
      installation.pullRequests,
      installation.pullRequests === "PASSED"
        ? "Governed proposal creation and promotion have pull-request write access."
        : "The GitHub App requires pull-request write access."
    ),
    check(
      "checks-permission",
      "Checks",
      installation.checks,
      installation.checks === "PASSED"
        ? "Exact-head policy evaluation has checks read access."
        : "The GitHub App requires checks read access."
    ),
  ];
}

function discoveryFailureChecks(error: {
  code: string;
  message: string;
}): FlowcordiaRepositoryReadinessCheck[] {
  const state =
    error.code === "access_denied" ||
    error.code === "not_found" ||
    error.code === "invalid_input" ||
    error.code === "invalid_response"
      ? "BLOCKED"
      : "UNAVAILABLE";
  return [
    check("production-branch", "Production branch", state, error.message),
    check(
      "workflow-catalog",
      "Workflow source catalog",
      state,
      "Canonical workflow paths could not be discovered."
    ),
    check(
      "workflow-index",
      "Durable workflow index",
      state,
      "The durable index cannot be compared with an unproven repository head."
    ),
    check(
      "trigger-config",
      "Trigger.dev configuration",
      state,
      "trigger.config.ts could not be read from an unproven repository head."
    ),
    check(
      "generated-task-discovery",
      "Generated task discovery",
      state,
      "Generated task discovery could not be verified."
    ),
  ];
}

async function previewDeploymentCheck(
  scope: WorkflowIndexScope
): Promise<FlowcordiaRepositoryReadinessCheck> {
  const connection = await prisma.connectedGithubRepository.findFirst({
    where: {
      projectId: scope.projectId,
      repositoryId: scope.repositoryId,
      project: { organizationId: scope.tenantId, deletedAt: null },
      repository: {
        githubId: BigInt(scope.repositoryGithubId),
        installation: {
          organizationId: scope.tenantId,
          appInstallationId: BigInt(scope.installationId),
          deletedAt: null,
          suspendedAt: null,
        },
      },
    },
    select: { previewDeploymentsEnabled: true },
  });
  if (!connection) {
    return check(
      "preview-deployments",
      "Preview deployments",
      "BLOCKED",
      "The connected repository changed before preview readiness was checked."
    );
  }
  return connection.previewDeploymentsEnabled
    ? check(
        "preview-deployments",
        "Preview deployments",
        "PASSED",
        "GitHub preview deployments are enabled for this project."
      )
    : check(
        "preview-deployments",
        "Preview deployments",
        "BLOCKED",
        "Enable GitHub preview deployments before running the connected rollout."
      );
}

function unavailableProjection(
  checkedAt: Date,
  state: "BLOCKED" | "UNAVAILABLE",
  message: string
): FlowcordiaRepositoryReadinessProjection {
  const notQueried =
    state === "BLOCKED"
      ? "This check is blocked until the repository binding is corrected."
      : "This check was not queried because repository readiness is unavailable.";
  return presentFlowcordiaRepositoryReadiness({
    checkedAt,
    repository: null,
    checks: [
      check("repository-binding", "Repository binding", state, message),
      check("github-installation", "GitHub App installation", state, notQueried),
      check("contents-permission", "Repository contents", state, notQueried),
      check("pull-request-permission", "Pull requests", state, notQueried),
      check("checks-permission", "Checks", state, notQueried),
      check("production-branch", "Production branch", state, notQueried),
      check("workflow-catalog", "Workflow source catalog", state, notQueried),
      check("workflow-index", "Durable workflow index", state, notQueried),
      check("trigger-config", "Trigger.dev configuration", state, notQueried),
      check("generated-task-discovery", "Generated task discovery", state, notQueried),
      check("preview-deployments", "Preview deployments", state, notQueried),
    ],
  });
}

export async function queryFlowcordiaRepositoryReadiness(input: {
  context: FlowcordiaProjectContext;
  now?: () => Date;
}): Promise<FlowcordiaRepositoryReadinessProjection> {
  const checkedAt = input.now?.() ?? new Date();
  const project = requireFlowcordiaProjectContext(input.context);

  let scope: WorkflowIndexScope;
  try {
    scope = await resolveWorkflowIndexScope(project);
  } catch (error) {
    if (
      error instanceof FlowcordiaProposalConfigurationError ||
      error instanceof ProposalPersistenceError
    ) {
      return unavailableProjection(checkedAt, "BLOCKED", error.message);
    }
    logger.error("Flowcordia repository readiness scope resolution failed", { error });
    return unavailableProjection(
      checkedAt,
      "UNAVAILABLE",
      "Repository readiness is temporarily unavailable."
    );
  }

  const checks: FlowcordiaRepositoryReadinessCheck[] = [
    check(
      "repository-binding",
      "Repository binding",
      "PASSED",
      "Project, installation, repository, and production branch resolve to one server-owned scope."
    ),
  ];
  let commitSha: string | null = null;

  try {
    const github = await createFlowcordiaReadinessGitHub(scope);
    checks.push(...installationChecks(github.installation));

    const [discovery, sync, entries, previewCheck] = await Promise.all([
      github.catalog.discover({ scope, revision: scope.repository.branch }),
      getWorkflowIndexSync(scope),
      listWorkflowIndexEntries(scope),
      previewDeploymentCheck(scope),
    ]);
    checks.push(previewCheck);

    if (!discovery.success) {
      checks.push(...discoveryFailureChecks(discovery.error));
    } else {
      commitSha = discovery.value.commitSha;
      checks.push(
        check(
          "production-branch",
          "Production branch",
          "PASSED",
          "The GitHub App resolved the configured production branch to an immutable commit."
        )
      );
      checks.push(
        discovery.value.entries.length > 0
          ? check(
              "workflow-catalog",
              "Workflow source catalog",
              "PASSED",
              `${discovery.value.entries.length} canonical workflow source path${
                discovery.value.entries.length === 1 ? "" : "s"
              } discovered at the exact branch head.`
            )
          : check(
              "workflow-catalog",
              "Workflow source catalog",
              "BLOCKED",
              "Add at least one .flowcordia/workflows/<workflow-id>.json document."
            )
      );

      const currentEntries = entries.filter(
        (entry) => entry.sourceCommitSha === discovery.value.commitSha
      );
      const validEntries = currentEntries.filter((entry) => entry.status === "VALID");
      const indexReady =
        sync?.status === "IDLE" &&
        sync.observedCommitSha === discovery.value.commitSha &&
        currentEntries.length === discovery.value.entries.length &&
        validEntries.length > 0 &&
        validEntries.length === currentEntries.length;
      checks.push(
        indexReady
          ? check(
              "workflow-index",
              "Durable workflow index",
              "PASSED",
              `${validEntries.length} validated workflow${
                validEntries.length === 1 ? "" : "s"
              } are indexed from the exact production head.`
            )
          : check(
              "workflow-index",
              "Durable workflow index",
              "BLOCKED",
              "Synchronize the repository and resolve every invalid or stale workflow before rollout."
            )
      );

      try {
        const config = await github.readTextFile(TRIGGER_CONFIG_PATH, discovery.value.commitSha);
        if (config.state === "MISSING") {
          checks.push(
            check(
              "trigger-config",
              "Trigger.dev configuration",
              "BLOCKED",
              "Add trigger.config.ts to the connected production branch."
            ),
            check(
              "generated-task-discovery",
              "Generated task discovery",
              "BLOCKED",
              "Generated task discovery cannot be verified without trigger.config.ts."
            )
          );
        } else if (config.state === "INVALID") {
          checks.push(
            check("trigger-config", "Trigger.dev configuration", "BLOCKED", config.message),
            check(
              "generated-task-discovery",
              "Generated task discovery",
              "BLOCKED",
              "Generated task discovery cannot be verified from an invalid trigger.config.ts."
            )
          );
        } else {
          checks.push(
            check(
              "trigger-config",
              "Trigger.dev configuration",
              "PASSED",
              "trigger.config.ts is bounded UTF-8 at the exact production head."
            )
          );
          const taskDiscovery = inspectFlowcordiaTaskDiscovery(config.text);
          checks.push(
            check(
              "generated-task-discovery",
              "Generated task discovery",
              taskDiscovery.state,
              taskDiscovery.message
            )
          );
        }
      } catch (error) {
        const state =
          error instanceof GitHubTransportError &&
          (error.status === 401 || error.status === 403 || error.status === 404)
            ? "BLOCKED"
            : "UNAVAILABLE";
        checks.push(
          check(
            "trigger-config",
            "Trigger.dev configuration",
            state,
            "trigger.config.ts could not be read through the installation-scoped GitHub App."
          ),
          check(
            "generated-task-discovery",
            "Generated task discovery",
            state,
            "Generated task discovery could not be verified."
          )
        );
      }
    }

    await assertCurrentFlowcordiaRepositoryBinding(scope);
    return presentFlowcordiaRepositoryReadiness({
      checkedAt,
      repository: {
        owner: scope.repository.owner,
        name: scope.repository.name,
        branch: scope.repository.branch,
        commitSha,
      },
      checks,
    });
  } catch (error) {
    logger.error("Flowcordia repository readiness probe failed", { error });
    return unavailableProjection(
      checkedAt,
      "UNAVAILABLE",
      "The connected repository readiness probe is temporarily unavailable."
    );
  }
}
