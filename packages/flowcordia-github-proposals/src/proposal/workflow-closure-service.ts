import {
  collectFlowcordiaSubflowWorkflowIds,
  serializeWorkflow,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import type {
  GitHubWorkflowAccessScope,
  GitHubWorkflowReadValue,
  GitHubWorkflowStore,
  GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";
import { buildProposalBranch } from "../branch/naming.js";
import type {
  GitHubProposalClient,
  GitHubProposalClientResolver,
  GitHubProposalSnapshot,
} from "../transport/client.js";
import type {
  CreateGitHubProposalInput,
  CreateGitHubProposalValue,
  GitHubProposalError,
  GitHubProposalResult,
  PrepareGitHubProposalValue,
} from "../types.js";
import type { GitHubProposalService } from "./service.js";
import {
  createFlowcordiaProposalClosureManifest,
  flowcordiaProposalClosureManifestEquals,
  MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS,
  resolveFlowcordiaProposalClosure,
  type FlowcordiaProposalClosureManifest,
  type FlowcordiaResolvedProposalClosure,
} from "./workflow-closure.js";
import type {
  GitHubProposalClosureStoreError,
  GitHubProposalWorkflowClosureStore,
} from "./workflow-closure-store.js";

export interface PrepareGitHubProposalWorkflowClosureValue extends PrepareGitHubProposalValue {
  closure: FlowcordiaProposalClosureManifest;
}

export interface CreateGitHubProposalWorkflowClosureValue extends CreateGitHubProposalValue {
  closure: FlowcordiaProposalClosureManifest;
}

export interface GitHubProposalWorkflowClosureServiceOptions {
  proposals: Pick<GitHubProposalService, "prepare" | "create">;
  clientResolver: GitHubProposalClientResolver;
  workflowStore: Pick<
    GitHubWorkflowStore,
    "read" | "save" | "readGeneratedArtifact" | "saveGeneratedArtifact"
  >;
  closureStore: Pick<GitHubProposalWorkflowClosureStore, "read" | "save">;
}

interface DiscoveredClosure {
  closure: FlowcordiaResolvedProposalClosure;
  manifest: FlowcordiaProposalClosureManifest;
  sources: ReadonlyMap<string, GitHubWorkflowReadValue["source"]>;
}

function proposalScope(
  scope: GitHubWorkflowAccessScope,
  branch: string
): GitHubWorkflowAccessScope {
  return { ...scope, repository: { ...scope.repository, branch } };
}

function repositoryFullName(scope: GitHubWorkflowAccessScope): string {
  return `${scope.repository.owner}/${scope.repository.name}`;
}

function invalidInput(issues: readonly string[]): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_input",
      operation: "create",
      phase: "validation",
      message: "Workflow proposal closure is invalid.",
      retryable: false,
      inputIssues: [...issues],
    },
  };
}

function closureConflict(
  input: CreateGitHubProposalInput,
  branch: string,
  message: string,
  pullRequestNumber?: number
): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "conflict",
      operation: "create",
      phase: "workflow",
      message,
      retryable: false,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch: branch,
      ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
    },
  };
}

function workflowError(
  error: GitHubWorkflowStoreError,
  input: CreateGitHubProposalInput,
  branch: string
): GitHubProposalResult<never> {
  const code: GitHubProposalError["code"] =
    error.code === "conflict" || error.code === "identity_conflict"
      ? "conflict"
      : error.code === "access_denied"
        ? "access_denied"
        : error.code === "not_found"
          ? "not_found"
          : error.code === "rate_limited"
            ? "rate_limited"
            : error.code === "ambiguous_write"
              ? "ambiguous_mutation"
              : error.code === "invalid_input" || error.code === "invalid_document"
                ? "invalid_input"
                : "unavailable";
  return {
    success: false,
    error: {
      code,
      operation: "create",
      phase: "workflow",
      message:
        code === "conflict"
          ? "Workflow closure changed while the proposal was being prepared."
          : code === "ambiguous_mutation"
            ? "A workflow closure write may have succeeded, but its exact result could not be proven."
            : "Workflow closure could not be stored safely.",
      retryable: error.retryable,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch: branch,
      requestId: error.requestId,
      retryAfterMs: error.retryAfterMs,
      inputIssues: error.inputIssues,
    },
  };
}

function closureStoreError(
  error: GitHubProposalClosureStoreError,
  input: CreateGitHubProposalInput,
  branch: string
): GitHubProposalResult<never> {
  const code: GitHubProposalError["code"] =
    error.code === "conflict"
      ? "proposal_collision"
      : error.code === "access_denied"
        ? "access_denied"
        : error.code === "not_found"
          ? "not_found"
          : error.code === "rate_limited"
            ? "rate_limited"
            : error.code === "ambiguous_write"
              ? "ambiguous_mutation"
              : error.code === "invalid_input" || error.code === "invalid_document"
                ? "invalid_input"
                : "unavailable";
  return {
    success: false,
    error: {
      code,
      operation: "create",
      phase: "workflow",
      message: error.message,
      retryable: error.retryable,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch: branch,
      requestId: error.requestId,
      retryAfterMs: error.retryAfterMs,
    },
  };
}

function workflowMatches(workflow: WorkflowDefinition, read: GitHubWorkflowReadValue): boolean {
  return serializeWorkflow(workflow) === serializeWorkflow(read.workflow);
}

function snapshotIdentityMatches(
  snapshot: GitHubProposalSnapshot,
  input: CreateGitHubProposalInput,
  branch: string
): boolean {
  return (
    snapshot.pullRequest.baseBranch === input.scope.repository.branch &&
    snapshot.pullRequest.headBranch === branch &&
    snapshot.pullRequest.state === "open" &&
    !snapshot.pullRequest.merged
  );
}

async function readSnapshot(
  client: GitHubProposalClient,
  input: CreateGitHubProposalInput,
  pullRequestNumber: number
): Promise<GitHubProposalSnapshot | null> {
  try {
    return await client.getProposalSnapshot({
      repository: input.scope.repository,
      pullRequestNumber,
    });
  } catch {
    return null;
  }
}

export class GitHubProposalWorkflowClosureService {
  readonly #proposals: Pick<GitHubProposalService, "prepare" | "create">;
  readonly #clientResolver: GitHubProposalClientResolver;
  readonly #workflowStore: GitHubProposalWorkflowClosureServiceOptions["workflowStore"];
  readonly #closureStore: GitHubProposalWorkflowClosureServiceOptions["closureStore"];

  constructor(options: GitHubProposalWorkflowClosureServiceOptions) {
    if (
      !options?.proposals ||
      typeof options.proposals.prepare !== "function" ||
      typeof options.proposals.create !== "function"
    ) {
      throw new TypeError("Workflow closure service requires the canonical proposal service.");
    }
    if (!options.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("Workflow closure service requires a proposal client resolver.");
    }
    if (
      !options.workflowStore ||
      typeof options.workflowStore.read !== "function" ||
      typeof options.workflowStore.save !== "function" ||
      typeof options.workflowStore.readGeneratedArtifact !== "function" ||
      typeof options.workflowStore.saveGeneratedArtifact !== "function"
    ) {
      throw new TypeError("Workflow closure service requires a workflow store.");
    }
    if (
      !options.closureStore ||
      typeof options.closureStore.read !== "function" ||
      typeof options.closureStore.save !== "function"
    ) {
      throw new TypeError("Workflow closure service requires a closure manifest store.");
    }
    this.#proposals = options.proposals;
    this.#clientResolver = options.clientResolver;
    this.#workflowStore = options.workflowStore;
    this.#closureStore = options.closureStore;
  }

  async #discover(
    input: CreateGitHubProposalInput
  ): Promise<GitHubProposalResult<DiscoveredClosure>> {
    const descendants = new Map<string, GitHubWorkflowReadValue>();
    const pending = [...collectFlowcordiaSubflowWorkflowIds(input.workflow)].sort();
    const observed = new Set<string>();
    while (pending.length > 0) {
      const workflowId = pending.shift()!;
      if (workflowId === input.workflow.id) {
        return invalidInput([
          "Workflow proposal closure cannot contain a recursive root reference.",
        ]);
      }
      if (observed.has(workflowId)) continue;
      observed.add(workflowId);
      if (observed.size + 1 > MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS) {
        return invalidInput([
          `Workflow proposal closure cannot exceed ${MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS} workflows.`,
        ]);
      }
      const read = await this.#workflowStore.read({
        scope: input.scope,
        workflowId,
        revision: input.expectedBaseCommitSha,
      });
      if (!read.success) {
        return invalidInput([
          read.error.code === "not_found"
            ? `Reachable child workflow "${workflowId}" is missing from the exact base revision.`
            : `Reachable child workflow "${workflowId}" could not be read safely.`,
        ]);
      }
      if (read.value.source.commitSha !== input.expectedBaseCommitSha) {
        return invalidInput([
          `Reachable child workflow "${workflowId}" was resolved from a mixed repository revision.`,
        ]);
      }
      descendants.set(workflowId, read.value);
      for (const childId of collectFlowcordiaSubflowWorkflowIds(read.value.workflow)) {
        if (!observed.has(childId)) pending.push(childId);
      }
      pending.sort();
    }

    const resolved = resolveFlowcordiaProposalClosure({
      rootWorkflow: input.workflow,
      descendants: [...descendants.values()].map((read) => ({
        workflow: read.workflow,
        baseBlobSha: read.source.blobSha,
      })),
      repositoryFullName: repositoryFullName(input.scope),
    });
    if (!resolved.success) return invalidInput(resolved.issues);
    const manifest = createFlowcordiaProposalClosureManifest({
      proposalId: input.proposalId,
      baseCommitSha: input.expectedBaseCommitSha,
      closure: resolved.closure,
      rootBaseBlobSha: input.expectedBaseBlobSha,
    });
    return {
      success: true,
      value: {
        closure: resolved.closure,
        manifest,
        sources: new Map(
          [...descendants].map(([workflowId, read]) => [workflowId, read.source] as const)
        ),
      },
    };
  }

  async #assertExistingManifest(
    input: CreateGitHubProposalInput,
    branch: string,
    manifest: FlowcordiaProposalClosureManifest
  ): Promise<GitHubProposalResult<void>> {
    const existing = await this.#closureStore.read({
      scope: proposalScope(input.scope, branch),
      proposalId: input.proposalId,
    });
    if (existing.success) {
      return flowcordiaProposalClosureManifestEquals(existing.value.manifest, manifest)
        ? { success: true, value: undefined }
        : closureConflict(
            input,
            branch,
            "Proposal branch is already locked to a different workflow closure."
          );
    }
    return existing.error.code === "not_found"
      ? { success: true, value: undefined }
      : closureStoreError(existing.error, input, branch);
  }

  async #lockManifest(
    input: CreateGitHubProposalInput,
    branch: string,
    manifest: FlowcordiaProposalClosureManifest
  ): Promise<GitHubProposalResult<void>> {
    const scope = proposalScope(input.scope, branch);
    const existing = await this.#closureStore.read({ scope, proposalId: input.proposalId });
    if (existing.success) {
      return flowcordiaProposalClosureManifestEquals(existing.value.manifest, manifest)
        ? { success: true, value: undefined }
        : closureConflict(
            input,
            branch,
            "Proposal branch is already locked to a different workflow closure."
          );
    }
    if (existing.error.code !== "not_found") {
      return closureStoreError(existing.error, input, branch);
    }
    const saved = await this.#closureStore.save({
      scope,
      proposalId: input.proposalId,
      manifest,
      mutation: input.mutation,
    });
    if (saved.success) return { success: true, value: undefined };
    if (saved.error.code === "ambiguous_write") {
      const reconciled = await this.#closureStore.read({ scope, proposalId: input.proposalId });
      if (
        reconciled.success &&
        flowcordiaProposalClosureManifestEquals(reconciled.value.manifest, manifest)
      ) {
        return { success: true, value: undefined };
      }
    }
    return closureStoreError(saved.error, input, branch);
  }

  async #stageDescendants(
    input: CreateGitHubProposalInput,
    branch: string,
    discovered: DiscoveredClosure
  ): Promise<GitHubProposalResult<void>> {
    const scope = proposalScope(input.scope, branch);
    for (const member of discovered.closure.members) {
      if (member.workflow.id === discovered.closure.rootWorkflowId) continue;
      const source = discovered.sources.get(member.workflow.id);
      if (!source) {
        return invalidInput([
          `Workflow closure source for "${member.workflow.id}" is unavailable.`,
        ]);
      }
      const current = await this.#workflowStore.read({ scope, workflowId: member.workflow.id });
      if (current.success && workflowMatches(member.workflow, current.value)) {
        const currentArtifact = await this.#workflowStore.readGeneratedArtifact({
          scope,
          workflowId: member.workflow.id,
        });
        if (
          currentArtifact.success &&
          currentArtifact.value.sourceText === member.generatedSource
        ) {
          continue;
        }
      } else if (
        current.success &&
        current.value.source.commitSha !== input.expectedBaseCommitSha
      ) {
        return closureConflict(
          input,
          branch,
          `Proposal branch contains a different definition for child workflow "${member.workflow.id}".`
        );
      } else if (!current.success && current.error.code !== "not_found") {
        return workflowError(current.error, input, branch);
      }

      const saved = await this.#workflowStore.save({
        scope,
        workflow: member.workflow,
        expectedBlobSha: source.blobSha,
        mutation: input.mutation,
      });
      if (!saved.success) {
        if (saved.error.code === "ambiguous_write") {
          const reconciled = await this.#workflowStore.read({
            scope,
            workflowId: member.workflow.id,
          });
          if (!reconciled.success || !workflowMatches(member.workflow, reconciled.value)) {
            return workflowError(saved.error, input, branch);
          }
        } else {
          return workflowError(saved.error, input, branch);
        }
      }

      const artifact = await this.#workflowStore.saveGeneratedArtifact({
        scope,
        workflowId: member.workflow.id,
        sourceText: member.generatedSource,
        mutation: input.mutation,
      });
      if (!artifact.success) {
        if (artifact.error.code === "ambiguous_write") {
          const reconciled = await this.#workflowStore.readGeneratedArtifact({
            scope,
            workflowId: member.workflow.id,
          });
          if (!reconciled.success || reconciled.value.sourceText !== member.generatedSource) {
            return workflowError(artifact.error, input, branch);
          }
        } else {
          return workflowError(artifact.error, input, branch);
        }
      }
    }
    return { success: true, value: undefined };
  }

  async prepare(
    input: CreateGitHubProposalInput
  ): Promise<GitHubProposalResult<PrepareGitHubProposalWorkflowClosureValue>> {
    const discovered = await this.#discover(input);
    if (!discovered.success) return discovered;
    let proposalBranch: string;
    try {
      proposalBranch = buildProposalBranch(input.workflow.id, input.proposalId);
    } catch (error) {
      return invalidInput([
        error instanceof Error ? error.message : "Proposal identity is invalid.",
      ]);
    }
    const existing = await this.#assertExistingManifest(
      input,
      proposalBranch,
      discovered.value.manifest
    );
    if (!existing.success) return existing;
    const prepared = await this.#proposals.prepare(input);
    if (!prepared.success) return prepared;
    if (prepared.value.proposalBranch !== proposalBranch) {
      return closureConflict(
        input,
        proposalBranch,
        "Canonical proposal preparation resolved a different branch identity."
      );
    }
    const locked = await this.#lockManifest(input, proposalBranch, discovered.value.manifest);
    if (!locked.success) return locked;
    const staged = await this.#stageDescendants(input, proposalBranch, discovered.value);
    if (!staged.success) return staged;
    return {
      success: true,
      value: { ...prepared.value, closure: discovered.value.manifest },
    };
  }

  async create(
    input: CreateGitHubProposalInput
  ): Promise<GitHubProposalResult<CreateGitHubProposalWorkflowClosureValue>> {
    const prepared = await this.prepare(input);
    if (!prepared.success) return prepared;
    const created = await this.#proposals.create(input);
    if (!created.success) return created;
    if (created.value.proposal.branch !== prepared.value.proposalBranch) {
      return closureConflict(
        input,
        prepared.value.proposalBranch,
        "Canonical proposal branch changed after workflow closure preparation.",
        created.value.proposal.pullRequestNumber
      );
    }

    let client: GitHubProposalClient;
    try {
      client = await this.#clientResolver.resolve(input.scope);
    } catch {
      return {
        success: false,
        error: {
          code: "unavailable",
          operation: "create",
          phase: "pull_request",
          message: "Final proposal closure snapshot is unavailable.",
          retryable: true,
        },
      };
    }
    const pullRequestNumber = created.value.proposal.pullRequestNumber;
    const snapshot = await readSnapshot(client, input, pullRequestNumber);
    if (!snapshot || !snapshotIdentityMatches(snapshot, input, prepared.value.proposalBranch)) {
      return closureConflict(
        input,
        prepared.value.proposalBranch,
        "Pull request identity changed while workflow closure was being verified.",
        pullRequestNumber
      );
    }
    const headSha = snapshot.pullRequest.headSha;
    const scope = proposalScope(input.scope, prepared.value.proposalBranch);
    const manifest = await this.#closureStore.read({
      scope,
      proposalId: input.proposalId,
      revision: headSha,
    });
    if (!manifest.success) {
      return closureStoreError(manifest.error, input, prepared.value.proposalBranch);
    }
    if (!flowcordiaProposalClosureManifestEquals(manifest.value.manifest, prepared.value.closure)) {
      return closureConflict(
        input,
        prepared.value.proposalBranch,
        "Final proposal head contains a different workflow closure manifest.",
        pullRequestNumber
      );
    }

    const discovered = await this.#discover(input);
    if (!discovered.success) return discovered;
    for (const member of discovered.value.closure.members) {
      const workflow = await this.#workflowStore.read({
        scope,
        workflowId: member.workflow.id,
        revision: headSha,
      });
      if (!workflow.success || !workflowMatches(member.workflow, workflow.value)) {
        return closureConflict(
          input,
          prepared.value.proposalBranch,
          `Final proposal head does not contain exact workflow "${member.workflow.id}".`,
          pullRequestNumber
        );
      }
      const artifact = await this.#workflowStore.readGeneratedArtifact({
        scope,
        workflowId: member.workflow.id,
        revision: headSha,
      });
      if (!artifact.success || artifact.value.sourceText !== member.generatedSource) {
        return closureConflict(
          input,
          prepared.value.proposalBranch,
          `Final proposal head does not contain the exact generated artifact for "${member.workflow.id}".`,
          pullRequestNumber
        );
      }
    }

    const stableSnapshot = await readSnapshot(client, input, pullRequestNumber);
    if (
      !stableSnapshot ||
      !snapshotIdentityMatches(stableSnapshot, input, prepared.value.proposalBranch) ||
      stableSnapshot.pullRequest.headSha !== headSha
    ) {
      return {
        success: false,
        error: {
          code: "conflict",
          operation: "create",
          phase: "pull_request",
          message:
            "Proposal branch changed while workflow closure was being verified. Resume creation.",
          retryable: true,
          repository: input.scope.repository,
          proposalId: input.proposalId,
          proposalBranch: prepared.value.proposalBranch,
          pullRequestNumber,
          expectedHeadSha: headSha,
          actualHeadSha: stableSnapshot?.pullRequest.headSha,
        },
      };
    }

    return {
      success: true,
      value: {
        ...created.value,
        proposal: { ...created.value.proposal, headSha },
        audit: { ...created.value.audit, headSha },
        resumed: prepared.value.resumed || created.value.resumed,
        closure: prepared.value.closure,
      },
    };
  }
}
