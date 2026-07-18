import { randomUUID } from "node:crypto";
import { Prisma } from "@trigger.dev/database";
import {
  flowcordiaProposalGovernanceProfileDigest,
  parseFlowcordiaProposalGovernanceProfile,
  validateFlowcordiaProposalGovernanceStrengthening,
  type FlowcordiaProposalGovernanceProfile,
} from "@flowcordia/github-proposals";
import { prisma } from "~/db.server";
import type { WorkflowIndexScope } from "../../workflows/index/types";
import {
  FlowcordiaProposalGovernanceError,
  type FlowcordiaProposalGovernancePolicyRecord,
} from "./types";

interface GovernanceRow {
  id: string;
  publicId: string;
  schemaVersion: string;
  minimumApprovals: number;
  requiredCheckNames: unknown;
  requiredReviewerIds: unknown;
  allowedReviewerIds: unknown;
  policyDigest: string;
  version: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

function scopePredicate(scope: WorkflowIndexScope) {
  return Prisma.sql`
    p."organization_id" = ${scope.tenantId}
    AND p."project_id" = ${scope.projectId}
    AND p."github_app_installation_id" = ${scope.githubAppInstallationId}
    AND p."app_installation_id" = ${BigInt(scope.installationId)}
    AND p."repository_id" = ${scope.repositoryId}
    AND p."repository_github_id" = ${BigInt(scope.repositoryGithubId)}
  `;
}

function policyColumns() {
  return Prisma.sql`
    p."id",
    p."public_id" AS "publicId",
    p."schema_version" AS "schemaVersion",
    p."minimum_approvals" AS "minimumApprovals",
    p."required_check_names" AS "requiredCheckNames",
    p."required_reviewer_ids" AS "requiredReviewerIds",
    p."allowed_reviewer_ids" AS "allowedReviewerIds",
    p."policy_digest" AS "policyDigest",
    p."version",
    p."created_by_actor_id" AS "createdByActorId",
    p."updated_by_actor_id" AS "updatedByActorId",
    p."created_at" AS "createdAt",
    p."updated_at" AS "updatedAt"
  `;
}

function decodePolicy(row: GovernanceRow): FlowcordiaProposalGovernancePolicyRecord {
  const parsed = parseFlowcordiaProposalGovernanceProfile({
    schemaVersion: row.schemaVersion,
    minimumApprovals: row.minimumApprovals,
    requiredCheckNames: row.requiredCheckNames,
    requiredReviewerIds: row.requiredReviewerIds,
    allowedReviewerIds: row.allowedReviewerIds,
  });
  if (
    !parsed.success ||
    flowcordiaProposalGovernanceProfileDigest(parsed.profile) !== row.policyDigest
  ) {
    throw new FlowcordiaProposalGovernanceError(
      "policy_corrupt",
      "The stored proposal governance profile failed its integrity check."
    );
  }
  return {
    id: row.id,
    publicId: row.publicId,
    profile: parsed.profile,
    policyDigest: row.policyDigest,
    version: row.version,
    createdByActorId: row.createdByActorId,
    updatedByActorId: row.updatedByActorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function selectPolicy(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: WorkflowIndexScope,
  lock = false
): Promise<FlowcordiaProposalGovernancePolicyRecord | null> {
  const rows = await client.$queryRaw<GovernanceRow[]>(Prisma.sql`
    SELECT ${policyColumns()}
    FROM "flowcordia"."proposal_governance_policy" p
    WHERE ${scopePredicate(scope)}
    LIMIT 1
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  return rows[0] ? decodePolicy(rows[0]) : null;
}

async function appendAudit(input: {
  tx: Prisma.TransactionClient;
  scope: WorkflowIndexScope;
  policy: FlowcordiaProposalGovernancePolicyRecord;
  actorId: string;
  correlationId: string;
  eventType: "proposal_governance.created" | "proposal_governance.updated";
  occurredAt: Date;
}): Promise<void> {
  const inserted = await input.tx.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."proposal_governance_policy_audit_event" (
      "id", "policy_id", "organization_id", "project_id", "repository_id", "event_type",
      "actor_id", "correlation_id", "dedupe_key", "payload", "occurred_at", "created_at"
    ) VALUES (
      ${randomUUID()}, ${input.policy.id}, ${input.scope.tenantId}, ${input.scope.projectId},
      ${input.scope.repositoryId}, ${input.eventType}, ${input.actorId}, ${input.correlationId},
      ${`proposal-governance:${input.policy.publicId}:${input.policy.version}:${input.correlationId}`},
      CAST(${JSON.stringify({
        publicId: input.policy.publicId,
        version: input.policy.version.toString(),
        policyDigest: input.policy.policyDigest,
        minimumApprovals: input.policy.profile.minimumApprovals,
        requiredCheckCount: input.policy.profile.requiredCheckNames.length,
        requiredReviewerCount: input.policy.profile.requiredReviewerIds.length,
        allowedReviewerCount: input.policy.profile.allowedReviewerIds?.length ?? null,
      })} AS JSONB),
      ${input.occurredAt}, ${input.occurredAt}
    )
    ON CONFLICT ("dedupe_key") DO NOTHING
  `);
  if (inserted !== 1) {
    throw new FlowcordiaProposalGovernanceError(
      "policy_conflict",
      "Proposal governance could not be audited uniquely. Reload and try again."
    );
  }
}

export async function getFlowcordiaProposalGovernancePolicy(
  scope: WorkflowIndexScope
): Promise<FlowcordiaProposalGovernancePolicyRecord | null> {
  return selectPolicy(prisma, scope);
}

export async function saveFlowcordiaProposalGovernancePolicy(input: {
  scope: WorkflowIndexScope;
  profile: FlowcordiaProposalGovernanceProfile;
  expectedVersion: bigint | null;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<FlowcordiaProposalGovernancePolicyRecord> {
  const normalized = parseFlowcordiaProposalGovernanceProfile(input.profile);
  if (!normalized.success) {
    throw new FlowcordiaProposalGovernanceError(
      "invalid_policy",
      normalized.issues[0] ?? "The proposal governance profile is invalid."
    );
  }
  const profile = normalized.profile;
  const policyDigest = flowcordiaProposalGovernanceProfileDigest(profile);
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await selectPolicy(tx, input.scope, true);
    if (!existing) {
      if (input.expectedVersion !== null) {
        throw new FlowcordiaProposalGovernanceError(
          "policy_conflict",
          "The proposal governance profile changed. Reload before saving."
        );
      }
      const id = randomUUID();
      const publicId = randomUUID();
      const rows = await tx.$queryRaw<GovernanceRow[]>(Prisma.sql`
        INSERT INTO "flowcordia"."proposal_governance_policy" AS p (
          "id", "public_id", "organization_id", "project_id", "github_app_installation_id",
          "app_installation_id", "repository_id", "repository_github_id", "repository_owner",
          "repository_name", "branch", "schema_version", "minimum_approvals",
          "required_check_names", "required_reviewer_ids", "allowed_reviewer_ids",
          "policy_digest", "version", "created_by_actor_id", "updated_by_actor_id",
          "created_at", "updated_at"
        ) VALUES (
          ${id}, ${publicId}, ${input.scope.tenantId}, ${input.scope.projectId},
          ${input.scope.githubAppInstallationId}, ${BigInt(input.scope.installationId)},
          ${input.scope.repositoryId}, ${BigInt(input.scope.repositoryGithubId)},
          ${input.scope.repository.owner}, ${input.scope.repository.name},
          ${input.scope.repository.branch}, ${profile.schemaVersion}, ${profile.minimumApprovals},
          CAST(${JSON.stringify(profile.requiredCheckNames)} AS JSONB),
          CAST(${JSON.stringify(profile.requiredReviewerIds)} AS JSONB),
          ${
            profile.allowedReviewerIds === null
              ? Prisma.sql`NULL`
              : Prisma.sql`CAST(${JSON.stringify(profile.allowedReviewerIds)} AS JSONB)`
          },
          ${policyDigest}, 1, ${input.actorId}, ${input.actorId}, ${now}, ${now}
        )
        ON CONFLICT ("project_id", "repository_id") DO NOTHING
        RETURNING ${policyColumns()}
      `);
      if (!rows[0]) {
        throw new FlowcordiaProposalGovernanceError(
          "policy_conflict",
          "The proposal governance profile was created concurrently. Reload before saving."
        );
      }
      const created = decodePolicy(rows[0]);
      await appendAudit({
        tx,
        scope: input.scope,
        policy: created,
        actorId: input.actorId,
        correlationId: input.correlationId,
        eventType: "proposal_governance.created",
        occurredAt: now,
      });
      return created;
    }

    if (input.expectedVersion === null || existing.version !== input.expectedVersion) {
      throw new FlowcordiaProposalGovernanceError(
        "policy_conflict",
        "The proposal governance profile changed. Reload before saving."
      );
    }
    const weakeningIssues = validateFlowcordiaProposalGovernanceStrengthening(
      existing.profile,
      profile
    );
    if (weakeningIssues.length > 0) {
      throw new FlowcordiaProposalGovernanceError(
        "policy_weakening",
        weakeningIssues[0] ?? "The repository governance policy cannot be weakened here."
      );
    }
    const rows = await tx.$queryRaw<GovernanceRow[]>(Prisma.sql`
      UPDATE "flowcordia"."proposal_governance_policy" AS p
      SET
        "repository_owner" = ${input.scope.repository.owner},
        "repository_name" = ${input.scope.repository.name},
        "branch" = ${input.scope.repository.branch},
        "schema_version" = ${profile.schemaVersion},
        "minimum_approvals" = ${profile.minimumApprovals},
        "required_check_names" = CAST(${JSON.stringify(profile.requiredCheckNames)} AS JSONB),
        "required_reviewer_ids" = CAST(${JSON.stringify(profile.requiredReviewerIds)} AS JSONB),
        "allowed_reviewer_ids" = ${
          profile.allowedReviewerIds === null
            ? Prisma.sql`NULL`
            : Prisma.sql`CAST(${JSON.stringify(profile.allowedReviewerIds)} AS JSONB)`
        },
        "policy_digest" = ${policyDigest},
        "version" = "version" + 1,
        "updated_by_actor_id" = ${input.actorId},
        "updated_at" = ${now}
      WHERE p."id" = ${existing.id} AND p."version" = ${existing.version}
      RETURNING ${policyColumns()}
    `);
    if (!rows[0]) {
      throw new FlowcordiaProposalGovernanceError(
        "policy_conflict",
        "The proposal governance profile changed while it was being saved."
      );
    }
    const updated = decodePolicy(rows[0]);
    await appendAudit({
      tx,
      scope: input.scope,
      policy: updated,
      actorId: input.actorId,
      correlationId: input.correlationId,
      eventType: "proposal_governance.updated",
      occurredAt: now,
    });
    return updated;
  });
}
