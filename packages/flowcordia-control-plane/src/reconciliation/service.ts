import type {
  JsonValue,
  LeasedProposalReconciliation,
  ProposalReconciliationGateway,
  ProposalState,
  ProposalStore,
  ReconciliationFailureCode,
  RemoteProposalObservation,
  WorkflowProposalAggregate,
} from "../types.js";

const ACTOR_ID = "system:flowcordia-proposal-worker";

export class ProposalObservationError extends Error {
  readonly code: ReconciliationFailureCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: ReconciliationFailureCode,
    message: string,
    options: { retryable: boolean; retryAfterMs?: number; cause?: unknown }
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProposalObservationError";
    this.code = code;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface ProposalReconciliationReport {
  claimed: number;
  completed: number;
  failed: number;
  deferred: number;
  leaseLost: number;
}

interface ProposalReconciliationServiceOptions {
  store: ProposalStore;
  gateway: ProposalReconciliationGateway;
  workerId: string;
  createLockToken: () => string;
  now?: () => Date;
  batchSize?: number;
  leaseMs?: number;
  staleAfterMs?: number;
  refreshIntervalMs?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  maxMissingAttempts?: number;
  random?: () => number;
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Proposal observation failed.";
  const clean = message.replace(/[\r\n\t]+/g, " ").trim();
  return clean.length <= 500 ? clean : `${clean.slice(0, 497)}...`;
}

function targetState(observation: RemoteProposalObservation): ProposalState {
  const pullRequest = observation.pullRequest;
  if (!pullRequest) return "FAILED";
  if (pullRequest.merged) return "MERGED";
  if (pullRequest.state === "closed") return "CLOSED";
  return pullRequest.draft ? "DRAFT" : "READY";
}

function proposalPayload(
  proposal: WorkflowProposalAggregate,
  observation: RemoteProposalObservation,
  state: ProposalState,
  code?: ReconciliationFailureCode
): JsonValue {
  return {
    proposalId: proposal.proposalId,
    workflowId: proposal.workflowId,
    tenantId: proposal.tenantId,
    projectId: proposal.projectId,
    repositoryId: proposal.repositoryId,
    state,
    proposalBranch: proposal.proposalBranch,
    ...(observation.branchSha ? { branchSha: observation.branchSha } : {}),
    ...(observation.pullRequest
      ? {
          pullRequestNumber: observation.pullRequest.number,
          pullRequestState: observation.pullRequest.state,
          pullRequestDraft: observation.pullRequest.draft,
          merged: observation.pullRequest.merged,
          headSha: observation.pullRequest.headSha,
        }
      : {}),
    ...(code ? { code } : {}),
  };
}

export class ProposalReconciliationService {
  readonly #store: ProposalStore;
  readonly #gateway: ProposalReconciliationGateway;
  readonly #workerId: string;
  readonly #createLockToken: () => string;
  readonly #now: () => Date;
  readonly #batchSize: number;
  readonly #leaseMs: number;
  readonly #staleAfterMs: number;
  readonly #refreshIntervalMs: number;
  readonly #baseRetryMs: number;
  readonly #maxRetryMs: number;
  readonly #maxMissingAttempts: number;
  readonly #random: () => number;

  constructor(options: ProposalReconciliationServiceOptions) {
    if (!options?.store || typeof options.store.claimReconciliations !== "function") {
      throw new TypeError("Proposal reconciliation requires a durable store.");
    }
    if (!options.gateway || typeof options.gateway.observe !== "function") {
      throw new TypeError("Proposal reconciliation requires a read-only GitHub gateway.");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.workerId ?? "")) {
      throw new TypeError("Reconciliation worker ID has an invalid format.");
    }
    if (typeof options.createLockToken !== "function") {
      throw new TypeError("Proposal reconciliation requires a lock-token factory.");
    }
    this.#store = options.store;
    this.#gateway = options.gateway;
    this.#workerId = options.workerId;
    this.#createLockToken = options.createLockToken;
    this.#now = options.now ?? (() => new Date());
    this.#batchSize = boundedInteger(options.batchSize ?? 25, "Reconciliation batch size", 1, 200);
    this.#leaseMs = boundedInteger(
      options.leaseMs ?? 120_000,
      "Reconciliation lease",
      5_000,
      900_000
    );
    this.#staleAfterMs = boundedInteger(
      options.staleAfterMs ?? 300_000,
      "Reconciliation stale threshold",
      30_000,
      86_400_000
    );
    this.#refreshIntervalMs = boundedInteger(
      options.refreshIntervalMs ?? 900_000,
      "Reconciliation refresh interval",
      60_000,
      86_400_000
    );
    this.#baseRetryMs = boundedInteger(
      options.baseRetryMs ?? 5_000,
      "Reconciliation base retry",
      100,
      3_600_000
    );
    this.#maxRetryMs = boundedInteger(
      options.maxRetryMs ?? 300_000,
      "Reconciliation maximum retry",
      this.#baseRetryMs,
      86_400_000
    );
    this.#maxMissingAttempts = boundedInteger(
      options.maxMissingAttempts ?? 5,
      "Reconciliation missing-attempt limit",
      1,
      100
    );
    this.#random = options.random ?? Math.random;
  }

  async reconcileOnce(signal?: AbortSignal): Promise<ProposalReconciliationReport> {
    signal?.throwIfAborted();
    const now = this.#now();
    const lockToken = this.#createLockToken();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(lockToken)) {
      throw new TypeError("Reconciliation lock token has an invalid format.");
    }
    const leased = await this.#store.claimReconciliations({
      workerId: this.#workerId,
      lockToken,
      limit: this.#batchSize,
      now,
      staleBefore: new Date(now.getTime() - this.#staleAfterMs),
      lockExpiresAt: new Date(now.getTime() + this.#leaseMs),
    });
    const report: ProposalReconciliationReport = {
      claimed: leased.length,
      completed: 0,
      failed: 0,
      deferred: 0,
      leaseLost: 0,
    };
    for (const item of leased) {
      signal?.throwIfAborted();
      await this.#reconcileItem(item, report, signal);
    }
    return report;
  }

  async #reconcileItem(
    item: LeasedProposalReconciliation,
    report: ProposalReconciliationReport,
    signal?: AbortSignal
  ): Promise<void> {
    let observation: RemoteProposalObservation;
    try {
      observation = await this.#gateway.observe(item.proposal, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      const normalized =
        error instanceof ProposalObservationError
          ? error
          : new ProposalObservationError(
              "invalid_remote_response",
              "GitHub proposal observation returned an invalid response.",
              { retryable: false, cause: error }
            );
      if (normalized.retryable) {
        await this.#defer(
          item,
          normalized.code,
          safeMessage(normalized),
          report,
          normalized.retryAfterMs
        );
      } else {
        await this.#fail(
          item,
          { branchSha: null, pullRequest: null, pullRequestCollision: false, workflowSha256: null },
          normalized.code,
          safeMessage(normalized),
          report
        );
      }
      return;
    }

    const definitive = this.#validateObservation(item.proposal, observation);
    if (definitive) {
      await this.#fail(item, observation, definitive.code, definitive.message, report);
      return;
    }
    if (
      !observation.pullRequest ||
      !observation.workflowSha256 ||
      (!observation.branchSha && observation.pullRequest.state === "open")
    ) {
      if (item.attempts >= this.#maxMissingAttempts) {
        await this.#fail(
          item,
          observation,
          "remote_not_found",
          "The proposal could not be proven from GitHub after bounded retries.",
          report
        );
      } else {
        await this.#defer(
          item,
          "remote_not_found",
          "GitHub has not exposed every proposal resource yet.",
          report
        );
      }
      return;
    }
    const state = targetState(observation);
    const pullRequest = observation.pullRequest;
    const occurredAt = this.#now();
    const correlationId = `reconcile:${item.proposal.storageId}:v${item.proposal.version}`;
    const completed = await this.#store.completeReconciliation({
      proposalStorageId: item.proposal.storageId,
      expectedVersion: item.proposal.version,
      lockToken: item.lockToken,
      patch: {
        state,
        headSha: pullRequest.headSha,
        pullRequestNumber: pullRequest.number,
        pullRequestUrl: pullRequest.url,
        pullRequestDraft: pullRequest.draft,
        pullRequestState: pullRequest.state,
        merged: pullRequest.merged,
        mergeCommitSha: pullRequest.merged ? pullRequest.mergeCommitSha : null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastCorrelationId: correlationId,
        lastReconciledAt: occurredAt,
      },
      eventType: "proposal.reconciliation.completed",
      actorId: ACTOR_ID,
      correlationId,
      dedupeKey: `${item.proposal.storageId}:v${item.proposal.version}:reconciliation:completed:${state}`,
      payload: proposalPayload(item.proposal, observation, state),
      occurredAt,
      nextAvailableAt:
        state === "MERGED" || state === "CLOSED"
          ? null
          : new Date(occurredAt.getTime() + this.#refreshIntervalMs),
    });
    if (completed) report.completed += 1;
    else report.leaseLost += 1;
  }

  #validateObservation(
    proposal: WorkflowProposalAggregate,
    observation: RemoteProposalObservation
  ): { code: ReconciliationFailureCode; message: string } | null {
    if (observation.pullRequestCollision) {
      return {
        code: "proposal_collision",
        message: "Multiple GitHub pull requests claim this proposal identity.",
      };
    }
    const pullRequest = observation.pullRequest;
    if (
      pullRequest &&
      (pullRequest.baseBranch !== proposal.baseBranch ||
        pullRequest.headBranch !== proposal.proposalBranch ||
        !pullRequest.markerMatches ||
        (proposal.pullRequestNumber !== null &&
          pullRequest.number !== proposal.pullRequestNumber) ||
        (observation.branchSha !== null && pullRequest.headSha !== observation.branchSha))
    ) {
      return {
        code: "identity_mismatch",
        message: "GitHub proposal identity does not match the durable record.",
      };
    }
    if (
      observation.workflowSha256 !== null &&
      observation.workflowSha256 !== proposal.desiredWorkflowSha256
    ) {
      return {
        code: "workflow_mismatch",
        message: "The GitHub workflow content differs from the approved proposal content.",
      };
    }
    return null;
  }

  async #fail(
    item: LeasedProposalReconciliation,
    observation: RemoteProposalObservation,
    code: ReconciliationFailureCode,
    message: string,
    report: ProposalReconciliationReport
  ): Promise<void> {
    const occurredAt = this.#now();
    const correlationId = `reconcile:${item.proposal.storageId}:v${item.proposal.version}`;
    const completed = await this.#store.completeReconciliation({
      proposalStorageId: item.proposal.storageId,
      expectedVersion: item.proposal.version,
      lockToken: item.lockToken,
      patch: {
        state: "FAILED",
        lastErrorCode: code,
        lastErrorMessage: message,
        lastCorrelationId: correlationId,
        lastReconciledAt: occurredAt,
      },
      eventType: "proposal.reconciliation.failed",
      actorId: ACTOR_ID,
      correlationId,
      dedupeKey: `${item.proposal.storageId}:v${item.proposal.version}:reconciliation:failed:${code}`,
      payload: proposalPayload(item.proposal, observation, "FAILED", code),
      occurredAt,
      nextAvailableAt: null,
    });
    if (completed) report.failed += 1;
    else report.leaseLost += 1;
  }

  async #defer(
    item: LeasedProposalReconciliation,
    code: ReconciliationFailureCode,
    message: string,
    report: ProposalReconciliationReport,
    retryAfterMs?: number
  ): Promise<void> {
    const exponent = Math.min(Math.max(0, item.attempts - 1), 20);
    const ceiling = Math.min(this.#maxRetryMs, this.#baseRetryMs * 2 ** exponent);
    const jittered = Math.max(
      this.#baseRetryMs,
      Math.floor(ceiling * (0.5 + this.#random() * 0.5))
    );
    const delay = Math.min(this.#maxRetryMs, Math.max(jittered, retryAfterMs ?? 0));
    const deferred = await this.#store.deferReconciliation({
      proposalStorageId: item.proposal.storageId,
      lockToken: item.lockToken,
      availableAt: new Date(this.#now().getTime() + delay),
      lastErrorCode: code,
      lastErrorMessage: safeMessage(new Error(message)),
    });
    if (deferred) report.deferred += 1;
    else report.leaseLost += 1;
  }
}
