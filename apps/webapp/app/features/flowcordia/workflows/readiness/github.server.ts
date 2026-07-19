import { Buffer } from "node:buffer";
import { ProposalPersistenceError } from "@flowcordia/control-plane";
import {
  GitHubWorkflowCatalog,
  OctokitGitHubRepositoryClient,
  OctokitGitHubWorkflowDiscoveryClient,
  type FlowcordiaWorkflowDiscoveryOctokitLike,
  type GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import {
  assertCurrentFlowcordiaRepositoryBinding,
  getFlowcordiaInstallationOctokit,
  sameFlowcordiaRepositoryScope,
} from "../../github/binding.server";
import type { WorkflowIndexScope } from "../index/types";

const MAX_TEXT_FILE_BYTES = 256 * 1024;

type UnknownRecord = Record<string, unknown>;

interface FlowcordiaReadinessOctokit extends FlowcordiaWorkflowDiscoveryOctokitLike {
  rest: FlowcordiaWorkflowDiscoveryOctokitLike["rest"] & {
    apps: {
      getRepoInstallation(input: { owner: string; repo: string }): Promise<{ data: unknown }>;
    };
  };
}

export type FlowcordiaReadinessEvidenceState = "PASSED" | "BLOCKED" | "UNAVAILABLE";

export interface FlowcordiaInstallationReadiness {
  installation: FlowcordiaReadinessEvidenceState;
  contents: FlowcordiaReadinessEvidenceState;
  pullRequests: FlowcordiaReadinessEvidenceState;
  checks: FlowcordiaReadinessEvidenceState;
}

export type FlowcordiaReadinessTextFile =
  | { state: "FOUND"; text: string }
  | { state: "MISSING" }
  | { state: "INVALID"; message: string };

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function statusFromError(error: unknown): number | undefined {
  const value = record(error);
  if (typeof value?.status === "number") return value.status;
  const response = record(value?.response);
  return typeof response?.status === "number" ? response.status : undefined;
}

function permissionRank(value: unknown): number {
  switch (value) {
    case "read":
      return 1;
    case "write":
      return 2;
    case "admin":
      return 3;
    default:
      return 0;
  }
}

function permissionState(
  permissions: UnknownRecord,
  permission: string,
  minimum: "read" | "write"
): FlowcordiaReadinessEvidenceState {
  return permissionRank(permissions[permission]) >= permissionRank(minimum) ? "PASSED" : "BLOCKED";
}

async function inspectInstallation(
  octokit: FlowcordiaReadinessOctokit,
  scope: WorkflowIndexScope
): Promise<FlowcordiaInstallationReadiness> {
  try {
    const response = await octokit.rest.apps.getRepoInstallation({
      owner: scope.repository.owner,
      repo: scope.repository.name,
    });
    const installation = record(response.data);
    const permissions = record(installation?.permissions);
    if (
      !installation ||
      typeof installation.id !== "number" ||
      !Number.isSafeInteger(installation.id) ||
      installation.id !== scope.installationId ||
      !permissions
    ) {
      return {
        installation: "UNAVAILABLE",
        contents: "UNAVAILABLE",
        pullRequests: "UNAVAILABLE",
        checks: "UNAVAILABLE",
      };
    }

    return {
      installation:
        installation.suspended_at === null || installation.suspended_at === undefined
          ? "PASSED"
          : "BLOCKED",
      contents: permissionState(permissions, "contents", "write"),
      pullRequests: permissionState(permissions, "pull_requests", "write"),
      checks: permissionState(permissions, "checks", "read"),
    };
  } catch (error) {
    const status = statusFromError(error);
    const state = status === 401 || status === 403 || status === 404 ? "BLOCKED" : "UNAVAILABLE";
    return {
      installation: state,
      contents: state,
      pullRequests: state,
      checks: state,
    };
  }
}

export async function createFlowcordiaReadinessGitHub(scope: WorkflowIndexScope) {
  const octokit = (await getFlowcordiaInstallationOctokit(
    scope
  )) as unknown as FlowcordiaReadinessOctokit;
  const repositoryClient = new OctokitGitHubRepositoryClient(octokit);
  const discoveryClient = new OctokitGitHubWorkflowDiscoveryClient(octokit);
  const catalog = new GitHubWorkflowCatalog({
    clientResolver: {
      resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
        if (!sameFlowcordiaRepositoryScope(scope, requestedScope)) {
          throw new ProposalPersistenceError(
            "Repository readiness scope changed during GitHub resolution."
          );
        }
        await assertCurrentFlowcordiaRepositoryBinding(scope);
        return discoveryClient;
      },
    },
    maxEntries: 500,
  });

  return {
    catalog,
    installation: await inspectInstallation(octokit, scope),
    async readTextFile(path: string, commitSha: string): Promise<FlowcordiaReadinessTextFile> {
      await assertCurrentFlowcordiaRepositoryBinding(scope);
      const result = await repositoryClient.getFile({
        repository: scope.repository,
        path,
        commitSha,
      });
      if (!result.found) return { state: "MISSING" };
      if (result.size > MAX_TEXT_FILE_BYTES || (result.size > 0 && result.contentBase64 === "")) {
        return { state: "INVALID", message: `${path} is too large to inspect safely.` };
      }

      try {
        const bytes = Buffer.from(result.contentBase64.replace(/\s/g, ""), "base64");
        if (bytes.length !== result.size) {
          return { state: "INVALID", message: `${path} has inconsistent GitHub content.` };
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (text.includes("\0")) {
          return { state: "INVALID", message: `${path} is not supported UTF-8 text.` };
        }
        return { state: "FOUND", text };
      } catch {
        return { state: "INVALID", message: `${path} is not valid UTF-8 text.` };
      }
    },
  };
}
