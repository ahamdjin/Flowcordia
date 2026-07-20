import { validateWorkflow, serializeWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import {
  GitHubTransportError,
  validateAccessScope,
  validateMutationContext,
  type GitHubWorkflowAccessScope,
  type GitHubWorkflowReadValue,
} from "@flowcordia/github-workflows";

import { buildProposalBranch, isValidObjectId, isValidProposalId } from "../branch/naming.js";
import {
  evaluateProposalPolicy,
  isValidReviewerId,
  validateProposalPolicy,
} from "../policy/evaluate.js";
import type { GitHubProposalPolicyBlocker } from "../policy/types.js";
import type {
  GitHubBranchResult,
  GitHubProposalClient,
  GitHubProposalSnapshot,
  GitHubPullRequest,
} from "../transport/client.js";
import type {
  CreateGitHubProposalInput,
  CreateGitHubProposalValue,
  GitHubProposalError,
  GitHubProposalIdentity,
  GitHubProposalResult,
  GitHubProposalServiceOptions,
  PrepareGitHubProposalValue,
  PromoteGitHubProposalInput,
  PromoteGitHubProposalValue,
  SubmitGitHubProposalInput,
  SubmitGitHubProposalValue,
} from "../types.js";
import { bodyHasProposalMarker, buildProposalBody, buildProposalTitle } from "./body.js";
import {
  invalidProposalInput,
  proposalCollision,
  proposalConflict,
  transportProposalError,
  workflowProposalError,
} from "./errors.js";
import { proposalAudit, proposalReference } from "./receipts.js";

function proposalScope(
  scope: GitHubWorkflowAccessScope,
  proposalBranch: string
): GitHubWorkflowAccessScope {
  return {
    ...scope,
    repository: { ...scope.repository, branch: proposalBranch },
  };
}

function validateIdentity(identity: Partial<GitHubProposalIdentity>): string[] {
  const issues: string[] = [];
  if (typeof identity.proposalId !== "string" || !isValidProposalId(identity.proposalId)) {
    issues.push("Proposal ID has an invalid format.");
  }
  if (
    typeof identity.workflowId !== "string" ||
    !/^[a-z][a-z0-9_-]{2,127}$/.test(identity.workflowId)
  ) {
    issues.push("Workflow ID has an invalid format.");
  }
  if (typeof identity.baseCommitSha !== "string" || !isValidObjectId(identity.baseCommitSha)) {
    issues.push("Base commit SHA must be a hexadecimal Git object ID.");
  }
  if (
    identity.creatorReviewerId !== null &&
    (typeof identity.creatorReviewerId !== "string" ||
      !isValidReviewerId(identity.creatorReviewerId))
  ) {
    issues.push("Creator reviewer ID must be null or a valid GitHub reviewer identity.");
  }
  return issues;
}

function validatePullRequestNumber(value: unknown): string[] {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? []
    : ["Pull request number must be a positive safe integer."];
}

function definitiveConflict(error: unknown): boolean {
  return (
    error instanceof GitHubTransportError &&
    !error.mutationMayHaveSucceeded &&
    (error.status === 409 || error.status === 422)
  );
}

function ambiguousMutation(error: unknown): boolean {
  return (
    !(error instanceof GitHubTransportError) ||
    error.mutationMayHaveSucceeded ||
    error.status === 408 ||
    (error.status !== undefined && error.status >= 500)
  );
}

function workflowMatches(workflow: WorkflowDefinition, read: GitHubWorkflowReadValue): boolean {
  return serializeWorkflow(workflow) === serializeWorkflow(read.workflow);
}

function artifactMatches(source: string, read: { sourceText: string }): boolean {
  return source === read.sourceText;
}

function foreignCodeReference(
  workflow: WorkflowDefinition,
  scope: GitHubWorkflowAccessScope
): string | undefined {
  const expected = `${scope.repository.owner}/${scope.repository.name}`.toLowerCase();
  return workflow.nodes.find(
    (node) =>
      node.codeReference?.repository && node.codeReference.repository.toLowerCase() !== expected
  )?.id;
}

function identityContext(input: {
  scope: GitHubWorkflowAccessScope;
  identity: GitHubProposalIdentity;
  proposalBranch: string;
  pullRequestNumber?: number;
  operation: "create" | "submit" | "promote";
  phase: "branch" | "workflow" | "pull_request" | "submission" | "policy" | "promotion";
}) {
  return {
    operation: input.operation,
    phase: input.phase,
    repository: input.scope.repository,
    proposalId: input.identity.proposalId,
    proposalBranch: input.proposalBranch,
    pullRequestNumber: input.pullRequestNumber,
  };
}

function pullRequestIdentityError(input: {
  scope: GitHubWorkflowAccessScope;
  identity: GitHubProposalIdentity;
  proposalBranch: string;
  pullRequest: GitHubPullRequest;
  operation: "create" | "submit" | "promote";
  phase: "pull_request" | "submission" | "promotion";
}): GitHubProposalError | undefined {
  const context = identityContext({ ...input, pullRequestNumber: input.pullRequest.number });
  if (!bodyHasProposalMarker(input.pullRequest.body, input.identity)) {
    return proposalCollision(
      context,
      "Pull request does not contain the expected proposal marker."
    );
  }
  if (
    input.pullRequest.baseBranch !== input.scope.repository.branch ||
    input.pullRequest.headBranch !== input.proposalBranch
  ) {
    return proposalCollision(context, "Pull request branches do not match the proposal identity.");
  }
  return undefined;
}

function closedProposalError(input: {
  scope: GitHubWorkflowAccessScope;
  identity: GitHubProposalIdentity;
  proposalBranch: string;
  pullRequest: GitHubPullRequest;
}): GitHubProposalError | undefined {
  if (input.pullRequest.state === "open" && !input.pullRequest.merged) return undefined;
  return proposalCollision(
    identityContext({
      ...input,
      pullRequestNumber: input.pullRequest.number,
      operation: "create",
      phase: "pull_request",
    }),
    "Proposal branch is already associated with a closed pull request. Use a new proposal ID."
  );
}

function policyBlockedError(input: {
  operation: "promote";
  scope: GitHubWorkflowAccessScope;
  identity: GitHubProposalIdentity;
  proposalBranch: string;
  pullRequestNumber: number;
  phase: "policy" | "promotion";
  blockers: GitHubProposalPolicyBlocker[];
  message?: string;
}): GitHubProposalError {
  return {
    ...identityContext(input),
    code: "policy_blocked",
    message: input.message ?? "Proposal does not satisfy the promotion policy.",
    retryable: false,
    policyBlockers: input.blockers,
  };
}

export class GitHubProposalService {
  readonly #clientResolver: GitHubProposalServiceOptions["clientResolver"];
  readonly #workflowStore: GitHubProposalServiceOptions["workflowStore"];

  constructor(options: GitHubProposalServiceOptions) {
    if (!options?.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("GitHub proposal service requires an installation client resolver.");
    }
    if (
      !options.workflowStore ||
      typeof options.workflowStore.read !== "function" ||
      typeof options.workflowStore.save !== "function" ||
      typeof options.workflowStore.readGeneratedArtifact !== "function" ||
      typeof options.workflowStore.saveGeneratedArtifact !== "function"
    ) {
      throw new TypeError("GitHub proposal service requires a GitHub workflow store.");
    }
    this.#clientResolver = options.clientResolver;
    this.#workflowStore = options.workflowStore;
  }

  async #resolveClient(
    scope: GitHubWorkflowAccessScope,
    context: ReturnType<typeof identityContext>
  ): Promise<GitHubProposalResult<GitHubProposalClient>> {
    try {
      return { success: true, value: await this.#clientResolver.resolve(scope) };
    } catch (error) {
      return { success: false, error: transportProposalError(error, context, false) };
    }
  }

  async #getBranch(
    client: GitHubProposalClient,
    scope: GitHubWorkflowAccessScope,
    branch: string,
    context: ReturnType<typeof identityContext>
  ): Promise<GitHubProposalResult<GitHubBranchResult>> {
    try {
      return {
        success: true,
        value: await client.getBranch({ repository: scope.repository, branch }),
      };
    } catch (error) {
      return { success: false, error: transportProposalError(error, context, false) };
    }
  }

  async #findValidatedPullRequests(input: {
    client: GitHubProposalClient;
    scope: GitHubWorkflowAccessScope;
    identity: GitHubProposalIdentity;
    proposalBranch: string;
    expectedHeadSha: string;
  }): Promise<GitHubProposalResult<GitHubPullRequest[]>> {
    const context = identityContext({
      scope: input.scope,
      identity: input.identity,
      proposalBranch: input.proposalBranch,
      operation: "create",
      phase: "pull_request",
    });
    let pullRequests: GitHubPullRequest[];
    try {
      pullRequests = await input.client.findPullRequests({
        repository: input.scope.repository,
        baseBranch: input.scope.repository.branch,
        headBranch: input.proposalBranch,
      });
    } catch (error) {
      return { success: false, error: transportProposalError(error, context, false) };
    }
    if (pullRequests.length > 1) {
      return {
        success: false,
        error: proposalCollision(
          context,
          "Multiple pull requests are associated with the proposal branch."
        ),
      };
    }
    const existing = pullRequests[0];
    if (existing) {
      const identityError = pullRequestIdentityError({
        scope: input.scope,
        identity: input.identity,
        proposalBranch: input.proposalBranch,
        pullRequest: existing,
        operation: "create",
        phase: "pull_request",
      });
      if (identityError) return { success: false, error: identityError };
      const closedError = closedProposalError({
        scope: input.scope,
        identity: input.identity,
        proposalBranch: input.proposalBranch,
        pullRequest: existing,
      });
      if (closedError) return { success: false, error: closedError };
      if (existing.headSha !== input.expectedHeadSha) {
        return {
          success: false,
          error: proposalConflict(
            { ...context, pullRequestNumber: existing.number },
            "Pull request head does not match the proposal branch head.",
            input.expectedHeadSha,
            existing.headSha
          ),
        };
      }
    }
    return { success: true, value: pullRequests };
  }

  async prepare(
    input: CreateGitHubProposalInput
  ): Promise<GitHubProposalResult<PrepareGitHubProposalValue>> {
    return this.createInternal(input, "prepare");
  }

  async create(
    input: CreateGitHubProposalInput
  ): Promise<GitHubProposalResult<CreateGitHubProposalValue>> {
    return this.createInternal(input, "complete");
  }

  private createInternal(
    input: CreateGitHubProposalInput,
    mode: "prepare"
  ): Promise<GitHubProposalResult<PrepareGitHubProposalValue>>;
  private createInternal(
    input: CreateGitHubProposalInput,
    mode: "complete"
  ): Promise<GitHubProposalResult<CreateGitHubProposalValue>>;
  private async createInternal(
    input: CreateGitHubProposalInput,
    mode: "prepare" | "complete"
  ): Promise<GitHubProposalResult<PrepareGitHubProposalValue | CreateGitHubProposalValue>> {
    const operation = "create" as const;
    const workflowId =
      input?.workflow && typeof input.workflow.id === "string" ? input.workflow.id : "";
    const identity = {
      proposalId: input?.proposalId,
      workflowId,
      baseCommitSha: input?.expectedBaseCommitSha,
      creatorReviewerId: input?.creatorReviewerId,
    } as GitHubProposalIdentity;
    const inputIssues = [
      ...validateAccessScope(input?.scope),
      ...validateMutationContext(input?.mutation),
      ...validateIdentity(identity),
    ];
    if (
      input?.expectedBaseBlobSha !== null &&
      (typeof input?.expectedBaseBlobSha !== "string" ||
        !isValidObjectId(input.expectedBaseBlobSha))
    ) {
      inputIssues.push("Expected base blob SHA must be null or a hexadecimal Git object ID.");
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidProposalInput(operation, inputIssues) };
    }

    const validated = validateWorkflow(input.workflow);
    if (!validated.success) {
      return {
        success: false,
        error: {
          code: "workflow_error",
          operation,
          phase: "validation",
          message: "Workflow does not satisfy the Flowcordia contract.",
          retryable: false,
          workflowIssues: validated.issues,
        },
      };
    }

    const scope = input.scope;
    const workflow = validated.workflow;
    const foreignCodeNodeId = foreignCodeReference(workflow, scope);
    if (foreignCodeNodeId) {
      return {
        success: false,
        error: {
          code: "workflow_error",
          operation,
          phase: "validation",
          message: `Code node "${foreignCodeNodeId}" references a different repository.`,
          retryable: false,
        },
      };
    }
    const compilation = compileWorkflowToTriggerTask(workflow);
    if (!compilation.success) {
      return {
        success: false,
        error: {
          code: "workflow_error",
          operation,
          phase: "validation",
          message:
            compilation.issues[0]?.message ??
            "Workflow cannot be compiled into a reviewed Trigger.dev artifact.",
          retryable: false,
        },
      };
    }
    const generatedSource = compilation.artifact.source;
    const proposalBranch = buildProposalBranch(workflow.id, input.proposalId);
    const branchContext = identityContext({
      scope,
      identity,
      proposalBranch,
      operation,
      phase: "branch",
    });
    const resolved = await this.#resolveClient(scope, branchContext);
    if (!resolved.success) return resolved;
    const client = resolved.value;

    const base = await this.#getBranch(client, scope, scope.repository.branch, branchContext);
    if (!base.success) return base;
    if (!base.value.exists) {
      return {
        success: false,
        error: {
          ...branchContext,
          code: "not_found",
          message: "Proposal base branch was not found.",
          retryable: false,
        },
      };
    }
    if (base.value.sha !== input.expectedBaseCommitSha) {
      return {
        success: false,
        error: proposalConflict(
          branchContext,
          "Base branch changed. Refresh before creating the proposal.",
          input.expectedBaseCommitSha,
          base.value.sha
        ),
      };
    }

    let branch = await this.#getBranch(client, scope, proposalBranch, branchContext);
    if (!branch.success) return branch;
    let resumed = branch.value.exists;
    let recovered = false;
    if (!branch.value.exists) {
      try {
        const created = await client.createBranch({
          repository: scope.repository,
          branch: proposalBranch,
          fromCommitSha: input.expectedBaseCommitSha,
        });
        branch = { success: true, value: { exists: true, sha: created.sha } };
      } catch (error) {
        let reconciled: GitHubBranchResult | undefined;
        try {
          reconciled = await client.getBranch({
            repository: scope.repository,
            branch: proposalBranch,
          });
        } catch {
          // Preserve the original mutation outcome when reconciliation itself is unavailable.
        }
        if (reconciled?.exists && reconciled.sha === input.expectedBaseCommitSha) {
          branch = { success: true, value: reconciled };
          resumed = true;
          recovered = ambiguousMutation(error);
        } else if (reconciled?.exists) {
          return { success: false, error: proposalCollision(branchContext) };
        } else {
          return {
            success: false,
            error: transportProposalError(error, branchContext, true),
          };
        }
      }
    }

    if (!branch.value.exists) {
      return {
        success: false,
        error: proposalConflict(branchContext, "Proposal branch disappeared."),
      };
    }

    const preflightPullRequests = await this.#findValidatedPullRequests({
      client,
      scope,
      identity,
      proposalBranch,
      expectedHeadSha: branch.value.sha,
    });
    if (!preflightPullRequests.success) return preflightPullRequests;

    let workflowSource: GitHubWorkflowReadValue["source"];
    let finalCommitSha: string;
    if (branch.value.sha !== input.expectedBaseCommitSha) {
      const read = await this.#workflowStore.read({
        scope: proposalScope(scope, proposalBranch),
        workflowId: workflow.id,
      });
      if (!read.success) {
        if (read.error.code === "not_found") {
          return {
            success: false,
            error: proposalCollision(
              { ...branchContext, phase: "workflow" },
              "Proposal branch advanced without the expected workflow."
            ),
          };
        }
        return {
          success: false,
          error: workflowProposalError(read.error, { ...branchContext, phase: "workflow" }),
        };
      }
      if (!workflowMatches(workflow, read.value)) {
        return {
          success: false,
          error: proposalCollision(
            { ...branchContext, phase: "workflow" },
            "Proposal branch contains a different workflow definition."
          ),
        };
      }
      const artifact = await this.#workflowStore.readGeneratedArtifact({
        scope: proposalScope(scope, proposalBranch),
        workflowId: workflow.id,
      });
      if (!artifact.success || !artifactMatches(generatedSource, artifact.value)) {
        return {
          success: false,
          error: proposalCollision(
            { ...branchContext, phase: "workflow" },
            "Proposal branch does not contain the expected generated Trigger.dev artifact."
          ),
        };
      }
      workflowSource = { ...read.value.source, commitSha: artifact.value.source.commitSha };
      finalCommitSha = artifact.value.source.commitSha;
      resumed = true;
    } else {
      const saved = await this.#workflowStore.save({
        scope: proposalScope(scope, proposalBranch),
        workflow,
        expectedBlobSha: input.expectedBaseBlobSha,
        mutation: input.mutation,
      });
      if (!saved.success) {
        if (saved.error.code === "ambiguous_write") {
          const read = await this.#workflowStore.read({
            scope: proposalScope(scope, proposalBranch),
            workflowId: workflow.id,
          });
          if (read.success && workflowMatches(workflow, read.value)) {
            workflowSource = read.value.source;
            recovered = true;
            resumed = true;
          } else {
            return {
              success: false,
              error: workflowProposalError(saved.error, {
                ...branchContext,
                phase: "workflow",
              }),
            };
          }
        } else {
          return {
            success: false,
            error: workflowProposalError(saved.error, { ...branchContext, phase: "workflow" }),
          };
        }
      } else {
        workflowSource = saved.value.source;
      }
      const artifact = await this.#workflowStore.saveGeneratedArtifact({
        scope: proposalScope(scope, proposalBranch),
        workflowId: workflow.id,
        sourceText: generatedSource,
        mutation: input.mutation,
      });
      if (!artifact.success) {
        return {
          success: false,
          error: workflowProposalError(artifact.error, {
            ...branchContext,
            phase: "workflow",
          }),
        };
      }
      finalCommitSha = artifact.value.source.commitSha;
      workflowSource = { ...workflowSource, commitSha: finalCommitSha };
    }

    const currentBranch = await this.#getBranch(client, scope, proposalBranch, branchContext);
    if (!currentBranch.success) return currentBranch;
    if (!currentBranch.value.exists) {
      return {
        success: false,
        error: proposalConflict(branchContext, "Proposal branch disappeared."),
      };
    }
    if (currentBranch.value.sha !== finalCommitSha) {
      return {
        success: false,
        error: proposalConflict(
          branchContext,
          "Proposal branch changed after the workflow was stored. Resume creation to reconcile it.",
          finalCommitSha,
          currentBranch.value.sha
        ),
      };
    }

    const pullRequestContext = { ...branchContext, phase: "pull_request" as const };
    const currentPullRequests = await this.#findValidatedPullRequests({
      client,
      scope,
      identity,
      proposalBranch,
      expectedHeadSha: currentBranch.value.sha,
    });
    if (!currentPullRequests.success) return currentPullRequests;
    const existingPullRequest = currentPullRequests.value[0];

    if (mode === "prepare") {
      return {
        success: true,
        value: {
          proposalBranch,
          workflowSource,
          resumed,
          recovered,
        },
      };
    }

    let pullRequest: GitHubPullRequest;
    if (existingPullRequest) {
      pullRequest = existingPullRequest;
      resumed = true;
    } else {
      try {
        pullRequest = await client.createPullRequest({
          repository: scope.repository,
          baseBranch: scope.repository.branch,
          headBranch: proposalBranch,
          title: buildProposalTitle(workflow),
          body: buildProposalBody(identity, workflow),
          draft: true,
        });
      } catch (error) {
        let reconciled: GitHubPullRequest[] | undefined;
        if (definitiveConflict(error) || ambiguousMutation(error)) {
          try {
            reconciled = await client.findPullRequests({
              repository: scope.repository,
              baseBranch: scope.repository.branch,
              headBranch: proposalBranch,
            });
          } catch {
            // Preserve the original mutation outcome when reconciliation itself is unavailable.
          }
        }
        const reconciledPullRequest = reconciled?.length === 1 ? reconciled[0] : undefined;
        if (reconciledPullRequest) {
          pullRequest = reconciledPullRequest;
          resumed = true;
          recovered = ambiguousMutation(error);
        } else if (reconciled && reconciled.length > 1) {
          return { success: false, error: proposalCollision(pullRequestContext) };
        } else {
          return {
            success: false,
            error: transportProposalError(error, pullRequestContext, true),
          };
        }
      }
    }

    if (!existingPullRequest) {
      const identityError = pullRequestIdentityError({
        scope,
        identity,
        proposalBranch,
        pullRequest,
        operation,
        phase: "pull_request",
      });
      if (identityError) return { success: false, error: identityError };
      const closedError = closedProposalError({ scope, identity, proposalBranch, pullRequest });
      if (closedError) return { success: false, error: closedError };
    }
    if (pullRequest.headSha !== currentBranch.value.sha) {
      return {
        success: false,
        error: proposalConflict(
          { ...pullRequestContext, pullRequestNumber: pullRequest.number },
          "Pull request head does not match the proposal branch head.",
          currentBranch.value.sha,
          pullRequest.headSha
        ),
      };
    }

    const outcome = recovered ? "recovered" : resumed ? "resumed" : "created";
    return {
      success: true,
      value: {
        proposal: proposalReference(scope, identity, proposalBranch, pullRequest),
        workflowSource,
        resumed,
        audit: proposalAudit({
          operation,
          outcome,
          scope,
          identity,
          proposalBranch,
          pullRequest,
          mutation: input.mutation,
        }),
      },
    };
  }

  async submit(
    input: SubmitGitHubProposalInput
  ): Promise<GitHubProposalResult<SubmitGitHubProposalValue>> {
    const operation = "submit" as const;
    const identity = {
      proposalId: input?.proposalId,
      workflowId: input?.workflowId,
      baseCommitSha: input?.baseCommitSha,
      creatorReviewerId: input?.creatorReviewerId,
    } as GitHubProposalIdentity;
    const inputIssues = [
      ...validateAccessScope(input?.scope),
      ...validateMutationContext(input?.mutation),
      ...validateIdentity(identity),
      ...validatePullRequestNumber(input?.pullRequestNumber),
    ];
    if (typeof input?.expectedHeadSha !== "string" || !isValidObjectId(input.expectedHeadSha)) {
      inputIssues.push("Expected head SHA must be a hexadecimal Git object ID.");
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidProposalInput(operation, inputIssues) };
    }

    const scope = input.scope;
    const proposalBranch = buildProposalBranch(input.workflowId, input.proposalId);
    const context = identityContext({
      scope,
      identity,
      proposalBranch,
      pullRequestNumber: input.pullRequestNumber,
      operation,
      phase: "submission",
    });
    const resolved = await this.#resolveClient(scope, context);
    if (!resolved.success) return resolved;
    const client = resolved.value;

    let snapshot: GitHubProposalSnapshot;
    try {
      snapshot = await client.getProposalSnapshot({
        repository: scope.repository,
        pullRequestNumber: input.pullRequestNumber,
      });
    } catch (error) {
      return { success: false, error: transportProposalError(error, context, false) };
    }
    const identityError = pullRequestIdentityError({
      scope,
      identity,
      proposalBranch,
      pullRequest: snapshot.pullRequest,
      operation,
      phase: "submission",
    });
    if (identityError) return { success: false, error: identityError };
    if (snapshot.pullRequest.headSha !== input.expectedHeadSha) {
      return {
        success: false,
        error: proposalConflict(
          context,
          "Pull request head changed. Review the new head before submission.",
          input.expectedHeadSha,
          snapshot.pullRequest.headSha
        ),
      };
    }
    if (snapshot.pullRequest.state !== "open" || snapshot.pullRequest.merged) {
      return {
        success: false,
        error: proposalConflict(context, "Only an open, unmerged pull request can be submitted."),
      };
    }
    if (!snapshot.pullRequest.draft) {
      return {
        success: true,
        value: {
          proposal: proposalReference(scope, identity, proposalBranch, snapshot.pullRequest),
          noChange: true,
          audit: proposalAudit({
            operation,
            outcome: "already_ready",
            scope,
            identity,
            proposalBranch,
            pullRequest: snapshot.pullRequest,
            mutation: input.mutation,
          }),
        },
      };
    }

    let pullRequest: GitHubPullRequest;
    let recovered = false;
    try {
      pullRequest = await client.markReadyForReview({
        repository: scope.repository,
        pullRequestNumber: input.pullRequestNumber,
        expectedHeadSha: input.expectedHeadSha,
      });
    } catch (error) {
      if (ambiguousMutation(error)) {
        try {
          const reconciled = await client.getProposalSnapshot({
            repository: scope.repository,
            pullRequestNumber: input.pullRequestNumber,
          });
          if (
            reconciled.pullRequest.headSha === input.expectedHeadSha &&
            !reconciled.pullRequest.draft
          ) {
            pullRequest = reconciled.pullRequest;
            recovered = true;
          } else {
            return { success: false, error: transportProposalError(error, context, true) };
          }
        } catch {
          return { success: false, error: transportProposalError(error, context, true) };
        }
      } else {
        return { success: false, error: transportProposalError(error, context, true) };
      }
    }

    const afterIdentityError = pullRequestIdentityError({
      scope,
      identity,
      proposalBranch,
      pullRequest,
      operation,
      phase: "submission",
    });
    if (afterIdentityError) return { success: false, error: afterIdentityError };
    if (pullRequest.headSha !== input.expectedHeadSha || pullRequest.draft) {
      return {
        success: false,
        error: proposalConflict(
          context,
          "Pull request changed while it was being submitted.",
          input.expectedHeadSha,
          pullRequest.headSha
        ),
      };
    }

    return {
      success: true,
      value: {
        proposal: proposalReference(scope, identity, proposalBranch, pullRequest),
        noChange: false,
        audit: proposalAudit({
          operation,
          outcome: recovered ? "recovered" : "submitted",
          scope,
          identity,
          proposalBranch,
          pullRequest,
          mutation: input.mutation,
        }),
      },
    };
  }

  async promote(
    input: PromoteGitHubProposalInput
  ): Promise<GitHubProposalResult<PromoteGitHubProposalValue>> {
    const operation = "promote" as const;
    const identity = {
      proposalId: input?.proposalId,
      workflowId: input?.workflowId,
      baseCommitSha: input?.baseCommitSha,
      creatorReviewerId: input?.creatorReviewerId,
    } as GitHubProposalIdentity;
    const inputIssues = [
      ...validateAccessScope(input?.scope),
      ...validateMutationContext(input?.mutation),
      ...validateIdentity(identity),
      ...validatePullRequestNumber(input?.pullRequestNumber),
      ...validateProposalPolicy(input?.policy),
    ];
    if (typeof input?.expectedHeadSha !== "string" || !isValidObjectId(input.expectedHeadSha)) {
      inputIssues.push("Expected head SHA must be a hexadecimal Git object ID.");
    }
    if (!(["merge", "squash", "rebase"] as const).includes(input?.mergeMethod)) {
      inputIssues.push("Merge method must be merge, squash, or rebase.");
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidProposalInput(operation, inputIssues) };
    }

    const scope = input.scope;
    const proposalBranch = buildProposalBranch(input.workflowId, input.proposalId);
    const context = identityContext({
      scope,
      identity,
      proposalBranch,
      pullRequestNumber: input.pullRequestNumber,
      operation,
      phase: "promotion",
    });
    const resolved = await this.#resolveClient(scope, context);
    if (!resolved.success) return resolved;
    const client = resolved.value;

    let snapshot: GitHubProposalSnapshot;
    try {
      snapshot = await client.getProposalSnapshot({
        repository: scope.repository,
        pullRequestNumber: input.pullRequestNumber,
      });
    } catch (error) {
      return { success: false, error: transportProposalError(error, context, false) };
    }
    const identityError = pullRequestIdentityError({
      scope,
      identity,
      proposalBranch,
      pullRequest: snapshot.pullRequest,
      operation,
      phase: "promotion",
    });
    if (identityError) return { success: false, error: identityError };
    if (snapshot.pullRequest.headSha !== input.expectedHeadSha) {
      return {
        success: false,
        error: proposalConflict(
          context,
          "Pull request head changed. Re-evaluate approvals and checks before promotion.",
          input.expectedHeadSha,
          snapshot.pullRequest.headSha
        ),
      };
    }
    if (snapshot.pullRequest.merged) {
      if (!snapshot.pullRequest.mergeCommitSha) {
        return {
          success: false,
          error: {
            ...context,
            code: "unavailable",
            message: "Merged pull request does not have a merge commit identity.",
            retryable: true,
          },
        };
      }
      return {
        success: true,
        value: {
          proposal: proposalReference(scope, identity, proposalBranch, snapshot.pullRequest),
          mergeCommitSha: snapshot.pullRequest.mergeCommitSha,
          alreadyMerged: true,
          audit: proposalAudit({
            operation,
            outcome: "already_merged",
            scope,
            identity,
            proposalBranch,
            pullRequest: snapshot.pullRequest,
            mutation: input.mutation,
            mergeCommitSha: snapshot.pullRequest.mergeCommitSha,
          }),
        },
      };
    }

    const headScope = proposalScope(scope, proposalBranch);
    const headWorkflow = await this.#workflowStore.read({
      scope: headScope,
      workflowId: input.workflowId,
      revision: input.expectedHeadSha,
    });
    if (!headWorkflow.success) {
      return {
        success: false,
        error: workflowProposalError(headWorkflow.error, { ...context, phase: "workflow" }),
      };
    }
    const headCompilation = compileWorkflowToTriggerTask(headWorkflow.value.workflow);
    const foreignCodeNodeId = foreignCodeReference(headWorkflow.value.workflow, scope);
    if (foreignCodeNodeId) {
      return {
        success: false,
        error: {
          ...context,
          phase: "workflow",
          code: "workflow_error",
          message: `Code node "${foreignCodeNodeId}" references a different repository.`,
          retryable: false,
        },
      };
    }
    if (!headCompilation.success) {
      return {
        success: false,
        error: {
          ...context,
          phase: "workflow",
          code: "workflow_error",
          message:
            headCompilation.issues[0]?.message ??
            "Proposal head cannot be compiled into a reviewed Trigger.dev artifact.",
          retryable: false,
        },
      };
    }
    const headArtifact = await this.#workflowStore.readGeneratedArtifact({
      scope: headScope,
      workflowId: input.workflowId,
      revision: input.expectedHeadSha,
    });
    if (!headArtifact.success) {
      return {
        success: false,
        error: workflowProposalError(headArtifact.error, { ...context, phase: "workflow" }),
      };
    }
    if (!artifactMatches(headCompilation.artifact.source, headArtifact.value)) {
      return {
        success: false,
        error: {
          ...context,
          phase: "workflow",
          code: "workflow_error",
          message:
            "Generated Trigger.dev artifact does not match the workflow at the reviewed proposal head.",
          retryable: false,
        },
      };
    }

    const evaluation = evaluateProposalPolicy({
      snapshot,
      policy: input.policy,
      expectedHeadSha: input.expectedHeadSha,
      expectedBaseBranch: scope.repository.branch,
      expectedProposalBranch: proposalBranch,
      proposalCreatorReviewerId: input.creatorReviewerId,
    });
    if (!evaluation.allowed) {
      return {
        success: false,
        error: policyBlockedError({
          operation,
          scope,
          identity,
          proposalBranch,
          pullRequestNumber: input.pullRequestNumber,
          phase: "policy",
          blockers: evaluation.blockers,
        }),
      };
    }

    let mergeCommitSha: string;
    let recovered = false;
    try {
      const merged = await client.mergePullRequest({
        repository: scope.repository,
        pullRequestNumber: input.pullRequestNumber,
        expectedHeadSha: input.expectedHeadSha,
        method: input.mergeMethod,
      });
      if (!merged.merged || !merged.mergeCommitSha) {
        return {
          success: false,
          error: policyBlockedError({
            operation,
            scope,
            identity,
            proposalBranch,
            pullRequestNumber: input.pullRequestNumber,
            phase: "promotion",
            blockers: [
              {
                code: "github_rules_blocked",
                message: "GitHub repository rules declined the merge.",
              },
            ],
            message: "GitHub repository rules declined promotion.",
          }),
        };
      }
      mergeCommitSha = merged.mergeCommitSha;
    } catch (error) {
      if (ambiguousMutation(error)) {
        try {
          const reconciled = await client.getProposalSnapshot({
            repository: scope.repository,
            pullRequestNumber: input.pullRequestNumber,
          });
          if (
            reconciled.pullRequest.merged &&
            reconciled.pullRequest.headSha === input.expectedHeadSha &&
            reconciled.pullRequest.mergeCommitSha
          ) {
            snapshot = reconciled;
            mergeCommitSha = reconciled.pullRequest.mergeCommitSha;
            recovered = true;
          } else {
            return { success: false, error: transportProposalError(error, context, true) };
          }
        } catch {
          return { success: false, error: transportProposalError(error, context, true) };
        }
      } else if (error instanceof GitHubTransportError && error.status === 405) {
        return {
          success: false,
          error: policyBlockedError({
            operation,
            scope,
            identity,
            proposalBranch,
            pullRequestNumber: input.pullRequestNumber,
            phase: "promotion",
            blockers: [
              {
                code: "github_rules_blocked",
                message: "GitHub repository rules declined the merge.",
              },
            ],
            message: "GitHub repository rules declined promotion.",
          }),
        };
      } else {
        return { success: false, error: transportProposalError(error, context, true) };
      }
    }

    const mergedPullRequest: GitHubPullRequest = {
      ...snapshot.pullRequest,
      state: "closed",
      merged: true,
      mergeCommitSha,
    };
    return {
      success: true,
      value: {
        proposal: proposalReference(scope, identity, proposalBranch, mergedPullRequest),
        mergeCommitSha,
        alreadyMerged: false,
        audit: proposalAudit({
          operation,
          outcome: recovered ? "recovered" : "promoted",
          scope,
          identity,
          proposalBranch,
          pullRequest: mergedPullRequest,
          mutation: input.mutation,
          mergeCommitSha,
        }),
      },
    };
  }
}
