import type { PrismaClientOrTransaction } from "~/db.server";
import { $transaction, Prisma, prisma } from "~/db.server";
import { FLOWCORDIA_OPERATIONS_WORKER_NAME } from "../proposals/worker/heartbeat.server";
import type { WorkflowIndexScope } from "../workflows/index/types";
import type { FlowcordiaOperationsMetrics, FlowcordiaOperationsThresholds } from "./contract";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_RECONCILIATION_REFRESH_MS = 900_000;
const DEFAULT_RECONCILIATION_STALE_MS = 300_000;

interface QueueRow {
  count: bigint;
  oldestAt: Date | null;
  maximumAttempts: number;
  expiredLocks: bigint;
}

interface ProposalRow {
  staleReconcilingCount: bigint;
  recentFailedCount: bigint;
}

function count(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || BigInt(result) !== value) {
    throw new RangeError(`${label} exceeds browser-safe bounds.`);
  }
  return result;
}

function age(now: Date, value: Date | null): number | null {
  if (value === null) return null;
  const milliseconds = Math.max(0, now.getTime() - value.getTime());
  if (!Number.isSafeInteger(milliseconds)) {
    throw new TypeError("Stored operations timestamp is invalid.");
  }
  return milliseconds;
}

function positiveTiming(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

function thresholds(input: {
  pollIntervalMs: number;
  reconciliationRefreshMs: number;
  reconciliationStaleMs: number;
}): FlowcordiaOperationsThresholds {
  const pollIntervalMs = positiveTiming(input.pollIntervalMs, "Worker poll interval");
  const reconciliationRefreshMs = positiveTiming(
    input.reconciliationRefreshMs,
    "Reconciliation refresh interval"
  );
  const reconciliationStaleMs = positiveTiming(
    input.reconciliationStaleMs,
    "Reconciliation stale interval"
  );
  const outboxAttentionAgeMs = Math.max(60_000, pollIntervalMs * 5);
  const reconciliationAttentionAgeMs = Math.max(60_000, pollIntervalMs * 5);
  return {
    outboxAttentionAgeMs,
    outboxBlockedAgeMs: Math.max(300_000, outboxAttentionAgeMs * 5),
    reconciliationAttentionAgeMs,
    reconciliationBlockedAgeMs: Math.max(
      300_000,
      reconciliationAttentionAgeMs * 5,
      reconciliationStaleMs + reconciliationAttentionAgeMs,
      reconciliationRefreshMs + reconciliationAttentionAgeMs
    ),
  };
}

export async function queryFlowcordiaOperationsMetrics(
  input: { scope: WorkflowIndexScope; now?: Date },
  database: PrismaClientOrTransaction = prisma
): Promise<FlowcordiaOperationsMetrics> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new TypeError("Operations health time is invalid.");

  const snapshot = await $transaction(
    database,
    "flowcordia.operations.health",
    async (transaction) => {
      const heartbeat = await transaction.flowcordiaOperationsWorkerHeartbeat.findUnique({
        where: { workerName: FLOWCORDIA_OPERATIONS_WORKER_NAME },
        select: {
          observedAt: true,
          healthyUntil: true,
          pollIntervalMs: true,
          reconciliationRefreshMs: true,
          reconciliationStaleMs: true,
        },
      });
      const timing = {
        pollIntervalMs: heartbeat?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        reconciliationRefreshMs:
          heartbeat?.reconciliationRefreshMs ?? DEFAULT_RECONCILIATION_REFRESH_MS,
        reconciliationStaleMs: heartbeat?.reconciliationStaleMs ?? DEFAULT_RECONCILIATION_STALE_MS,
      };
      const releaseThresholds = thresholds(timing);
      const reconciliationEligibleBefore = new Date(now.getTime() - timing.reconciliationStaleMs);
      const staleProposalBefore = new Date(
        now.getTime() - releaseThresholds.reconciliationBlockedAgeMs
      );
      const failedSince = new Date(now.getTime() - 24 * 60 * 60 * 1_000);

      const [outboxRows, reconciliationRows, proposalRows] = await Promise.all([
        transaction.$queryRaw<QueueRow[]>(Prisma.sql`
          SELECT
            COUNT(*)::bigint AS "count",
            MIN(event."occurredAt") AS "oldestAt",
            COALESCE(MAX(event."attempts"), 0)::int AS "maximumAttempts",
            COUNT(*) FILTER (
              WHERE event."lockExpiresAt" IS NOT NULL
                AND event."lockExpiresAt" <= ${now}
            )::bigint AS "expiredLocks"
          FROM "FlowcordiaOutboxEvent" AS event
          INNER JOIN "FlowcordiaWorkflowProposal" AS proposal
            ON proposal."id" = event."aggregateId"
          WHERE event."publishedAt" IS NULL
            AND event."aggregateType" = 'flowcordia.workflow_proposal'
            AND event."organizationId" = ${input.scope.tenantId}
            AND proposal."organizationId" = ${input.scope.tenantId}
            AND proposal."projectId" = ${input.scope.projectId}
            AND proposal."repositoryId" = ${input.scope.repositoryId}
        `),
        transaction.$queryRaw<QueueRow[]>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (
              WHERE schedule."availableAt" <= ${now}
                AND COALESCE(proposal."lastReconciledAt", proposal."updatedAt") <= ${reconciliationEligibleBefore}
            )::bigint AS "count",
            MIN(schedule."availableAt") FILTER (
              WHERE schedule."availableAt" <= ${now}
                AND COALESCE(proposal."lastReconciledAt", proposal."updatedAt") <= ${reconciliationEligibleBefore}
            ) AS "oldestAt",
            COALESCE(MAX(schedule."attempts") FILTER (
              WHERE schedule."availableAt" <= ${now}
                AND COALESCE(proposal."lastReconciledAt", proposal."updatedAt") <= ${reconciliationEligibleBefore}
            ), 0)::int AS "maximumAttempts",
            COUNT(*) FILTER (
              WHERE schedule."lockExpiresAt" IS NOT NULL
                AND schedule."lockExpiresAt" <= ${now}
            )::bigint AS "expiredLocks"
          FROM "FlowcordiaProposalReconciliation" AS schedule
          INNER JOIN "FlowcordiaWorkflowProposal" AS proposal
            ON proposal."id" = schedule."proposalStorageId"
          WHERE proposal."organizationId" = ${input.scope.tenantId}
            AND proposal."projectId" = ${input.scope.projectId}
            AND proposal."repositoryId" = ${input.scope.repositoryId}
            AND proposal."state" IN (
              'CREATING'::"FlowcordiaProposalState",
              'DRAFT'::"FlowcordiaProposalState",
              'READY'::"FlowcordiaProposalState",
              'PROMOTING'::"FlowcordiaProposalState",
              'RECONCILING'::"FlowcordiaProposalState"
            )
        `),
        transaction.$queryRaw<ProposalRow[]>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (
              WHERE proposal."state" = 'RECONCILING'::"FlowcordiaProposalState"
                AND COALESCE(proposal."lastReconciledAt", proposal."updatedAt") <= ${staleProposalBefore}
            )::bigint AS "staleReconcilingCount",
            COUNT(*) FILTER (
              WHERE proposal."state" = 'FAILED'::"FlowcordiaProposalState"
                AND proposal."updatedAt" >= ${failedSince}
            )::bigint AS "recentFailedCount"
          FROM "FlowcordiaWorkflowProposal" AS proposal
          WHERE proposal."organizationId" = ${input.scope.tenantId}
            AND proposal."projectId" = ${input.scope.projectId}
            AND proposal."repositoryId" = ${input.scope.repositoryId}
        `),
      ]);
      if (outboxRows.length !== 1 || reconciliationRows.length !== 1 || proposalRows.length !== 1) {
        throw new Error("Flowcordia operations health returned an invalid aggregate shape.");
      }
      return {
        heartbeat,
        releaseThresholds,
        outbox: outboxRows[0]!,
        reconciliation: reconciliationRows[0]!,
        proposals: proposalRows[0]!,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
  if (!snapshot) throw new Error("Flowcordia operations health transaction aborted.");

  return {
    workerActive: Boolean(snapshot.heartbeat && snapshot.heartbeat.healthyUntil > now),
    workerHeartbeatAgeMs: age(now, snapshot.heartbeat?.observedAt ?? null),
    unpublishedOutboxCount: count(snapshot.outbox.count, "Outbox count"),
    oldestUnpublishedOutboxAgeMs: age(now, snapshot.outbox.oldestAt),
    maximumOutboxAttempts: snapshot.outbox.maximumAttempts,
    expiredOutboxLocks: count(snapshot.outbox.expiredLocks, "Expired outbox lock count"),
    pendingReconciliationCount: count(snapshot.reconciliation.count, "Reconciliation count"),
    oldestReconciliationDelayMs: age(now, snapshot.reconciliation.oldestAt),
    maximumReconciliationAttempts: snapshot.reconciliation.maximumAttempts,
    expiredReconciliationLocks: count(
      snapshot.reconciliation.expiredLocks,
      "Expired reconciliation lock count"
    ),
    staleReconcilingProposalCount: count(
      snapshot.proposals.staleReconcilingCount,
      "Stale reconciling proposal count"
    ),
    recentFailedProposalCount: count(
      snapshot.proposals.recentFailedCount,
      "Recent failed proposal count"
    ),
    thresholds: snapshot.releaseThresholds,
  };
}
