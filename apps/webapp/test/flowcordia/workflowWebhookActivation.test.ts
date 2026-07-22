import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia production webhook activation", () => {
  it("binds only an exact promoted and deployed workflow identity", () => {
    const activation = source(
      "../../app/features/flowcordia/workflows/webhook/activation.server.ts"
    );

    expect(activation).toContain("findLatestMergedFlowcordiaProposal");
    expect(activation).toContain("latestMerged.proposalId !== input.expectedProposalId");
    expect(activation).toContain("deployment.commitSHA !== input.expectedMergeCommitSha");
    expect(activation).toContain("revision: input.expectedMergeCommitSha");
    expect(activation).toContain('node.operation !== "trigger.webhook"');
    expect(activation).toContain("workflowPath: source.value.source.path");
    expect(activation).toContain("workflowBlobSha: source.value.source.blobSha");
    expect(activation).toContain("workflowSha256(source.value.workflow)");
    expect(activation).toContain("workerId: deployment.workerId");
    expect(activation).toContain("workerVersion: deployment.version");
    expect(activation).toContain("taskIdentifier");
  });

  it("checks production HMAC readiness without resolving secret values", () => {
    const activation = source(
      "../../app/features/flowcordia/workflows/webhook/activation.server.ts"
    );

    expect(activation).toContain("flowcordiaWebhookHmacEnvironmentName");
    expect(activation).toContain("isSecret: true");
    expect(activation).toContain("select: { version: true }");
    expect(activation).toContain("credentialVersion: String(credentialVersion)");
    expect(activation).not.toContain("getVariableValuesForKeys");
    expect(activation).not.toContain("parseFlowcordiaStoredWebhookSecret");
    expect(activation).not.toContain("secretValue");
  });

  it("uses a serializable node-scoped append-only revision transaction", () => {
    const adapter = source(
      "../../app/features/flowcordia/workflows/webhook/binding-prisma.server.ts"
    );

    expect(adapter).toContain("TransactionIsolationLevel.Serializable");
    expect(adapter).toContain("runtimeEnvironmentId_workflowId_nodeId");
    expect(adapter).toContain("nodeId: input.scope.nodeId");
    expect(adapter).toContain("endpoint.nodeId !== input.scope.nodeId");
    expect(adapter).toContain("row.endpoint.nodeId !== row.nodeId");
    expect(adapter).toContain("findRevisionByFingerprint");
    expect(adapter).toContain("createRevision");
    expect(adapter).toContain("activeRevisionId: input.revisionId");
    expect(adapter).toContain("revokedAt: null");
    expect(adapter).not.toContain("credentialValue");
    expect(adapter).not.toContain("secret");
  });
});
