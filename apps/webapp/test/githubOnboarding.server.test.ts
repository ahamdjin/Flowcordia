import { describe, expect, it } from "vitest";
import {
  deriveGitHubOnboardingProjection,
  type GitHubOnboardingProjection,
} from "../app/features/flowcordia/setup/githubOnboarding.server";

const checkedAt = new Date("2026-07-29T00:00:00.000Z");

function readyChecks(): NonNullable<GitHubOnboardingProjection["readiness"]> {
  return {
    state: "READY",
    checkedAt: checkedAt.toISOString(),
    repository: {
      owner: "flowcordia",
      name: "reference",
      branch: "main",
      commitSha: "a".repeat(40),
    },
    checks: [
      ["repository-binding", "Repository binding"],
      ["github-installation", "GitHub App installation"],
      ["contents-permission", "Repository contents"],
      ["pull-request-permission", "Pull requests"],
      ["checks-permission", "Checks"],
      ["production-branch", "Production branch"],
      ["workflow-catalog", "Workflow source catalog"],
      ["workflow-index", "Durable workflow index"],
      ["trigger-config", "Trigger.dev configuration"],
      ["generated-task-discovery", "Generated task discovery"],
      ["preview-deployments", "Preview deployments"],
    ].map(([id, label]) => ({
      id: id as NonNullable<
        GitHubOnboardingProjection["readiness"]
      >["checks"][number]["id"],
      label,
      state: "PASSED" as const,
      message: `${label} passed.`,
    })),
  };
}

function input(
  overrides: Partial<Parameters<typeof deriveGitHubOnboardingProjection>[0]> = {}
): Parameters<typeof deriveGitHubOnboardingProjection>[0] {
  return {
    checkedAt,
    credentialState: "ready",
    installations: [
      {
        id: "installation",
        appInstallationId: "123",
        accountHandle: "flowcordia",
        repositories: [
          {
            id: "repository",
            installationId: "installation",
            appInstallationId: "123",
            fullName: "flowcordia/reference",
            defaultBranch: "main",
            private: false,
          },
        ],
      },
    ],
    latestInactiveInstallation: null,
    connectedRepository: {
      id: "repository",
      fullName: "flowcordia/reference",
      productionBranch: "main",
      installationId: "installation",
      appInstallationId: "123",
    },
    synchronization: {
      status: "IDLE",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    readiness: readyChecks(),
    ...overrides,
  };
}

function block(
  projection: NonNullable<GitHubOnboardingProjection["readiness"]>,
  id: NonNullable<GitHubOnboardingProjection["readiness"]>["checks"][number]["id"],
  message: string,
  state: "BLOCKED" | "UNAVAILABLE" = "BLOCKED"
) {
  return {
    ...projection,
    state: state === "UNAVAILABLE" ? ("UNAVAILABLE" as const) : ("BLOCKED" as const),
    checks: projection.checks.map((check) =>
      check.id === id ? { ...check, state, message } : check
    ),
  };
}

describe("self-host GitHub onboarding projection", () => {
  it("requires GitHub App credentials before installation", () => {
    const result = deriveGitHubOnboardingProjection(
      input({
        credentialState: "missing",
        installations: [],
        connectedRepository: null,
        readiness: null,
        synchronization: null,
      })
    );

    expect(result.state).toBe("github_app_missing");
    expect(result.action).toBe("configure_app");
  });

  it("distinguishes suspended and deleted installations", () => {
    const suspended = deriveGitHubOnboardingProjection(
      input({
        installations: [],
        latestInactiveInstallation: "suspended",
        connectedRepository: null,
        readiness: null,
        synchronization: null,
      })
    );
    const deleted = deriveGitHubOnboardingProjection(
      input({
        installations: [],
        latestInactiveInstallation: "deleted",
        connectedRepository: null,
        readiness: null,
        synchronization: null,
      })
    );

    expect(suspended.state).toBe("installation_suspended");
    expect(deleted.state).toBe("installation_deleted");
  });

  it("requires repository access before repository selection", () => {
    const result = deriveGitHubOnboardingProjection(
      input({
        installations: [
          {
            id: "installation",
            appInstallationId: "123",
            accountHandle: "flowcordia",
            repositories: [],
          },
        ],
        connectedRepository: null,
        readiness: null,
        synchronization: null,
      })
    );

    expect(result.state).toBe("repository_access_missing");
    expect(result.action).toBe("manage_installation");
  });

  it("offers repository selection when accessible repositories exist", () => {
    const result = deriveGitHubOnboardingProjection(
      input({ connectedRepository: null, readiness: null, synchronization: null })
    );

    expect(result.state).toBe("repository_selection_required");
    expect(result.action).toBe("select_repository");
  });

  it("separates repository permission loss from branch problems", () => {
    const permission = deriveGitHubOnboardingProjection(
      input({
        readiness: block(readyChecks(), "contents-permission", "Contents write access is missing."),
      })
    );
    const branch = deriveGitHubOnboardingProjection(
      input({
        readiness: block(readyChecks(), "production-branch", "The branch was not found."),
      })
    );

    expect(permission.state).toBe("repository_permission_lost");
    expect(permission.action).toBe("manage_installation");
    expect(branch.state).toBe("production_branch_missing");
    expect(branch.action).toBe("update_branch");
  });

  it("distinguishes required, running, and failed synchronization", () => {
    const blockedReadiness = block(
      readyChecks(),
      "workflow-index",
      "The durable workflow index is stale."
    );
    const required = deriveGitHubOnboardingProjection(
      input({ readiness: blockedReadiness, synchronization: null })
    );
    const running = deriveGitHubOnboardingProjection(
      input({
        readiness: blockedReadiness,
        synchronization: { status: "RUNNING", lastErrorCode: null, lastErrorMessage: null },
      })
    );
    const failed = deriveGitHubOnboardingProjection(
      input({
        readiness: blockedReadiness,
        synchronization: {
          status: "FAILED",
          lastErrorCode: "github_unavailable",
          lastErrorMessage: "GitHub rejected the synchronization request.",
        },
      })
    );

    expect(required.state).toBe("synchronization_required");
    expect(running.state).toBe("synchronization_running");
    expect(failed.state).toBe("synchronization_failed");
    expect(failed.summary).toContain("rejected");
  });

  it("requires repository content before reporting readiness", () => {
    const result = deriveGitHubOnboardingProjection(
      input({
        readiness: block(
          readyChecks(),
          "workflow-catalog",
          "Add at least one .flowcordia workflow document."
        ),
      })
    );

    expect(result.state).toBe("repository_content_required");
    expect(result.action).toBe("create_workflow");
  });

  it("ignores optional preview deployment readiness for first-run completion", () => {
    const result = deriveGitHubOnboardingProjection(
      input({
        readiness: block(
          readyChecks(),
          "preview-deployments",
          "Preview deployments are disabled."
        ),
      })
    );

    expect(result.state).toBe("ready");
    expect(result.action).toBe("open_studio");
  });
});
