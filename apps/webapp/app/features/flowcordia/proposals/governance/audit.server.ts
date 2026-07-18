import { randomUUID } from "node:crypto";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import type { WorkflowIndexScope } from "../../workflows/index/types";
import type { ResolvedFlowcordiaProposalGovernance } from "./service.server";
import { FlowcordiaProposalGovernanceError } from "./types";

export async function recordFlowcordiaProposalGovernancePromotion(input: {
  scope: WorkflowIndexScope;
  governance: ResolvedFlowcordiaProposalGovernance;
  proposalId: string;
  expectedHeadSha: string;
  actorId: string;
  correlationId: string;
  occurredAt?: Date;
}): Promise<void> {
  if (
    input.governance.source !== "stored" ||
    !input.governance.publicId ||
    input.governance.version === null
  ) {
    throw new FlowcordiaProposalGovernanceError(
      "policy_unavailable",
      "Proposal governance must be stored before promotion can be audited.",
      true
    );
  }
  const occurredAt = input.occurredAt ?? new Date();
  const inserted = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."proposal_governance_policy_audit_event" (
      "id", "policy_id", "organization_id", "project_id", "repository_id", "event_type",
      "actor_id", "correlation_id", "dedupe_key", "payload", "occurred_at", "created_at"
    )
    SELECT
      ${randomUUID()}, p."id", ${input.scope.tenantId}, ${input.scope.projectId},
      ${input.scope.repositoryId}, 'proposal_governance.promotion_evaluated', ${input.actorId},
      ${input.correlationId},
      ${`proposal-governance:promotion:${input.proposalId}:${input.expectedHeadSha}:${input.governance.policyDigest}:${input.correlationId}`},
      CAST(${JSON.stringify({
        proposalId: input.proposalId,
        expectedHeadSha: input.expectedHeadSha,
        policyPublicId: input.governance.publicId,
        policyVersion: input.governance.version.toString(),
        policyDigest: input.governance.policyDigest,
        minimumApprovals: input.governance.profile.minimumApprovals,
        requiredCheckCount: input.governance.profile.requiredCheckNames.length,
        requiredReviewerCount: input.governance.profile.requiredReviewerIds.length,
        allowedReviewerCount: input.governance.profile.allowedReviewerIds?.length ?? null,
      })} AS JSONB),
      ${occurredAt}, ${occurredAt}
    FROM "flowcordia"."proposal_governance_policy" p
    WHERE
      p."public_id" = ${input.governance.publicId}
      AND p."version" = ${input.governance.version}
      AND p."policy_digest" = ${input.governance.policyDigest}
      AND p."organization_id" = ${input.scope.tenantId}
      AND p."project_id" = ${input.scope.projectId}
      AND p."repository_id" = ${input.scope.repositoryId}
      AND p."github_app_installation_id" = ${input.scope.githubAppInstallationId}
      AND p."repository_github_id" = ${BigInt(input.scope.repositoryGithubId)}
    ON CONFLICT ("dedupe_key") DO NOTHING
  `);
  if (inserted !== 1) {
    throw new FlowcordiaProposalGovernanceError(
      "policy_conflict",
      "Proposal governance changed before promotion could be audited. Reload and try again."
    );
  }
}
