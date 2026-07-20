import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia production proposal lookup ownership", () => {
  it("queries one exact workflow and complete durable repository scope", () => {
    const repository = source(
      "../../app/features/flowcordia/workflows/production/repository.server.ts"
    );

    expect(repository).toContain("prisma.flowcordiaWorkflowProposal.findFirst");
    expect(repository).toContain("organizationId: input.scope.tenantId");
    expect(repository).toContain("projectId: input.scope.projectId");
    expect(repository).toContain("appInstallationId: installationId(input.scope.installationId)");
    expect(repository).toContain("repositoryId: input.scope.repositoryId");
    expect(repository).toContain(
      "repositoryGithubId: repositoryGithubId(input.scope.repositoryGithubId)"
    );
    expect(repository).toContain("workflowId: input.workflowId");
    expect(repository).toContain('state: "MERGED"');
    expect(repository).toContain('headSha: { not: null }');
    expect(repository).toContain('mergeCommitSha: { not: null }');
    expect(repository).toContain('orderBy: [{ updatedAt: "desc" }, { id: "desc" }]');
    expect(repository).toContain("isValidWorkflowId(input.workflowId)");
    expect(repository).toContain("MAX_DATABASE_BIGINT");
  });

  it("keeps Studio reads and mutations on the same exact lookup", () => {
    const query = source("../../app/features/flowcordia/workflows/production/query.server.ts");
    const trigger = source("../../app/features/flowcordia/workflows/production/trigger.server.ts");

    expect(query).toContain("findLatestMergedFlowcordiaProposal");
    expect(trigger).toContain("findLatestMergedFlowcordiaProposal");
    expect(query).not.toContain("listProposals({");
    expect(trigger).not.toContain("listProposals({");
    expect(query).not.toContain("limit: 100");
    expect(trigger).not.toContain("limit: 100");
  });
});
