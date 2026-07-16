import type {
  JsonValue,
  ProposalEventType,
  ProposalStore,
  WorkflowProposalAggregate,
} from "../types.js";
import {
  normalizedWebhookJson,
  type NormalizedGitHubWebhook,
  type PullRequestWebhook,
} from "./normalize.js";

interface WebhookIngestionServiceOptions {
  store: ProposalStore;
  now?: () => Date;
}

export interface IngestWebhookInput {
  deliveryId: string;
  payloadHash: string;
  receivedAt: Date;
  event: NormalizedGitHubWebhook;
}

export type IngestWebhookResult =
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "processed"; proposal: WorkflowProposalAggregate; projectionUpdated: boolean };

export class WebhookReplayMismatchError extends Error {
  constructor() {
    super("GitHub delivery ID was replayed with a different payload hash.");
    this.name = "WebhookReplayMismatchError";
  }
}

function nextPullRequestState(
  proposal: WorkflowProposalAggregate,
  event: PullRequestWebhook
): WorkflowProposalAggregate["state"] {
  if (event.merged) return "MERGED";
  if (event.state === "closed") return "CLOSED";
  if (event.draft) return "DRAFT";
  return proposal.state === "PROMOTING" ? "PROMOTING" : "READY";
}

function maxDate(left: Date | null, right: Date): Date {
  return !left || right.getTime() > left.getTime() ? right : left;
}

function webhookPayload(
  proposal: WorkflowProposalAggregate,
  event: NormalizedGitHubWebhook
): JsonValue {
  return {
    proposalId: proposal.proposalId,
    projectId: proposal.projectId,
    repositoryId: proposal.repositoryId,
    deliveryEvent: normalizedWebhookJson(event),
  };
}

export class WebhookIngestionService {
  readonly #store: ProposalStore;
  readonly #now: () => Date;

  constructor(options: WebhookIngestionServiceOptions) {
    if (!options?.store || typeof options.store.transaction !== "function") {
      throw new TypeError("Webhook ingestion requires a durable proposal store.");
    }
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
  }

  async ingest(input: IngestWebhookInput): Promise<IngestWebhookResult> {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(input.deliveryId ?? "")) {
      throw new TypeError("GitHub delivery ID has an invalid format.");
    }
    if (!/^[0-9a-f]{64}$/.test(input.payloadHash ?? "")) {
      throw new TypeError("Webhook payload hash must be a SHA-256 hex digest.");
    }
    if (!(input.receivedAt instanceof Date) || Number.isNaN(input.receivedAt.getTime())) {
      throw new TypeError("Webhook received timestamp is invalid.");
    }
    if (
      !(input.event?.occurredAt instanceof Date) ||
      Number.isNaN(input.event.occurredAt.getTime())
    ) {
      throw new TypeError("Webhook event timestamp is invalid.");
    }

    return this.#store.transaction(async (transaction) => {
      const inserted = await transaction.insertWebhookDelivery({
        deliveryId: input.deliveryId,
        eventName: input.event.eventName,
        action: input.event.action,
        installationId: input.event.installationId,
        repositoryGithubId: input.event.repositoryGithubId,
        payloadHash: input.payloadHash,
        normalizedPayload: normalizedWebhookJson(input.event),
        receivedAt: input.receivedAt,
      });
      if (inserted.status === "duplicate") {
        if (inserted.payloadHash !== input.payloadHash) {
          throw new WebhookReplayMismatchError();
        }
        return { status: "duplicate" };
      }

      const proposal = await transaction.findProposalForWebhook({
        eventName: input.event.eventName,
        installationId: input.event.installationId,
        repositoryGithubId: input.event.repositoryGithubId,
        pullRequestNumber: input.event.pullRequestNumber,
        headSha: input.event.headSha,
      });
      if (!proposal) {
        await transaction.completeWebhookDelivery({
          deliveryId: input.deliveryId,
          status: "IGNORED",
          proposalStorageId: null,
          completedAt: this.#now(),
        });
        return { status: "ignored" };
      }

      let updated = proposal;
      let projectionUpdated = false;
      let eventType: ProposalEventType = "proposal.github.webhook_received";
      if (input.event.eventName === "pull_request") {
        if (
          input.event.headBranch !== proposal.proposalBranch ||
          input.event.baseBranch !== proposal.baseBranch
        ) {
          eventType = "proposal.github.identity_mismatch";
        } else if (
          !proposal.lastPullRequestEventAt ||
          input.event.occurredAt.getTime() > proposal.lastPullRequestEventAt.getTime()
        ) {
          updated = await transaction.updateProposal({
            storageId: proposal.storageId,
            expectedVersion: proposal.version,
            patch: {
              state: nextPullRequestState(proposal, input.event),
              headSha: input.event.headSha,
              pullRequestNumber: input.event.pullRequestNumber,
              pullRequestDraft: input.event.draft,
              pullRequestState: input.event.state,
              merged: input.event.merged,
              mergeCommitSha: input.event.mergeCommitSha ?? proposal.mergeCommitSha,
              lastGithubEventAt: maxDate(proposal.lastGithubEventAt, input.event.occurredAt),
              lastPullRequestEventAt: input.event.occurredAt,
            },
          });
          projectionUpdated = true;
        }
      } else if (
        !proposal.lastGithubEventAt ||
        input.event.occurredAt.getTime() > proposal.lastGithubEventAt.getTime()
      ) {
        updated = await transaction.updateProposal({
          storageId: proposal.storageId,
          expectedVersion: proposal.version,
          patch: { lastGithubEventAt: input.event.occurredAt },
        });
        projectionUpdated = true;
      }

      const occurredAt = this.#now();
      const dedupeKey = `${updated.storageId}:webhook:${input.deliveryId}`;
      const payload = webhookPayload(updated, input.event);
      await transaction.appendAudit({
        proposalStorageId: updated.storageId,
        eventType,
        actorId: "github:webhook",
        correlationId: input.deliveryId,
        dedupeKey,
        payload,
        occurredAt,
      });
      await transaction.enqueueOutbox({
        dedupeKey,
        eventType,
        aggregateType: "flowcordia.workflow_proposal",
        aggregateId: updated.storageId,
        tenantId: updated.tenantId,
        payload,
        occurredAt,
        availableAt: occurredAt,
      });
      await transaction.completeWebhookDelivery({
        deliveryId: input.deliveryId,
        status: "PROCESSED",
        proposalStorageId: updated.storageId,
        completedAt: occurredAt,
      });
      return { status: "processed", proposal: updated, projectionUpdated };
    });
  }
}
