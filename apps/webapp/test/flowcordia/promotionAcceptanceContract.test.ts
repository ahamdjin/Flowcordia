import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_PROMOTION_CONFIRMATION,
  parseFlowcordiaPromotionAcceptanceEnvironment,
  promotionAcceptanceFailure,
  type FlowcordiaPromotionAcceptanceEvidence,
} from "../../app/features/flowcordia/acceptance/promotion-contract";
import { writeFlowcordiaPromotionAcceptanceEvidence } from "../../../../tests/flowcordia-connected/promotion-evidence";

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    FLOWCORDIA_PROMOTION_CONFIRMATION,
    FLOWCORDIA_PROMOTION_BASE_URL: "https://flowcordia.example.com",
    FLOWCORDIA_PROMOTION_STUDIO_PATH: "/orgs/acme/projects/reference/env/prod/flowcordia/workflows",
    FLOWCORDIA_PROMOTION_PROPOSAL_PATH:
      "/orgs/acme/projects/reference/env/prod/flowcordia/proposals",
    FLOWCORDIA_PROMOTION_WORKFLOW_ID: "reference_workflow",
    FLOWCORDIA_PROMOTION_PROPOSAL_ID: "proposal_reference_123",
    FLOWCORDIA_PROMOTION_EXPECTED_HEAD_SHA: "a".repeat(40),
    FLOWCORDIA_PROMOTION_REPOSITORY_OWNER: "acme",
    FLOWCORDIA_PROMOTION_REPOSITORY_NAME: "flowcordia-reference",
    FLOWCORDIA_PROMOTION_REPOSITORY_BRANCH: "main",
    FLOWCORDIA_PROMOTION_MERGE_METHOD: "squash",
    FLOWCORDIA_PROMOTION_STORAGE_STATE_PATH: "/tmp/storage-state.json",
    FLOWCORDIA_PROMOTION_EVIDENCE_PATH: "/tmp/evidence.json",
    ...overrides,
  };
}

describe("Flowcordia governed promotion acceptance contract", () => {
  it("constructs exact workflow and proposal URLs for one confirmed reference promotion", () => {
    expect(parseFlowcordiaPromotionAcceptanceEnvironment(environment())).toMatchObject({
      baseUrl: "https://flowcordia.example.com",
      studioUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/workflows?workflow=reference_workflow",
      proposalUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/proposals?proposal=proposal_reference_123",
      workflowId: "reference_workflow",
      proposalId: "proposal_reference_123",
      expectedHeadSha: "a".repeat(40),
      repository: { owner: "acme", name: "flowcordia-reference", branch: "main" },
      mergeMethod: "squash",
      readinessTimeoutMs: 120_000,
      promotionTimeoutMs: 300_000,
    });
  });

  it("requires the exact destructive confirmation and immutable promotion identity", () => {
    for (const overrides of [
      { FLOWCORDIA_PROMOTION_CONFIRMATION: "promote" },
      { FLOWCORDIA_PROMOTION_BASE_URL: "http://flowcordia.example.com" },
      { FLOWCORDIA_PROMOTION_STUDIO_PATH: "//evil.example/studio" },
      { FLOWCORDIA_PROMOTION_PROPOSAL_PATH: "/proposals?proposal=other" },
      { FLOWCORDIA_PROMOTION_WORKFLOW_ID: "Invalid workflow" },
      { FLOWCORDIA_PROMOTION_PROPOSAL_ID: "proposal/other" },
      { FLOWCORDIA_PROMOTION_EXPECTED_HEAD_SHA: "ABC123" },
      { FLOWCORDIA_PROMOTION_REPOSITORY_OWNER: "owner/other" },
      { FLOWCORDIA_PROMOTION_REPOSITORY_NAME: "repo other" },
      { FLOWCORDIA_PROMOTION_REPOSITORY_BRANCH: "../main" },
      { FLOWCORDIA_PROMOTION_MERGE_METHOD: "fast-forward" },
      { FLOWCORDIA_PROMOTION_TIMEOUT_SECONDS: "1801" },
    ]) {
      expect(() => parseFlowcordiaPromotionAcceptanceEnvironment(environment(overrides))).toThrow();
    }
  });

  it("writes bounded promotion evidence without browser, actor, policy, or provider secrets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-promotion-evidence-"));
    const path = join(directory, "evidence.json");
    const evidence: FlowcordiaPromotionAcceptanceEvidence = {
      schemaVersion: "0.1",
      mode: "promotion",
      result: "PASSED",
      stage: "complete",
      workflowId: "reference_workflow",
      proposalId: "proposal_reference_123",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:01:00.000Z",
      readiness: {
        state: "READY",
        passed: 6,
        blocked: 0,
        unavailable: 0,
        repository: {
          owner: "acme",
          name: "flowcordia-reference",
          branch: "main",
          commitSha: "a".repeat(40),
        },
      },
      governance: { state: "SATISFIED", evaluatedHeadSha: "b".repeat(40) },
      promotion: {
        expectedHeadSha: "b".repeat(40),
        mergeMethod: "squash",
        mergeCommitSha: "c".repeat(40),
      },
    };

    try {
      await writeFlowcordiaPromotionAcceptanceEvidence(path, evidence);
      const value = await readFile(path, "utf8");
      expect(JSON.parse(value)).toEqual(evidence);
      expect(value).not.toMatch(
        /payload|output|cookie|token|storageState|headers|actor|correlation|policyId|provider|stack|rawError/i
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses fixed stage-owned failure evidence", () => {
    expect(
      promotionAcceptanceFailure({
        stage: "promotion",
        workflowId: "reference_workflow",
        proposalId: "proposal_reference_123",
        startedAt: "2026-07-20T00:00:00.000Z",
        completedAt: "2026-07-20T00:01:00.000Z",
      }).failure
    ).toEqual({
      code: "PROMOTION_FAILED",
      message: "The exact governed proposal was not observed as merged.",
    });
  });

  it("keeps promotion on protected manual UI contracts only", () => {
    const source = (relativePath: string) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const route = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.proposals/route.tsx"
    );
    const workspace = source(
      "../../app/features/flowcordia/proposals/workspace/ProposalWorkspace.tsx"
    );
    const workflow = source("../../../../.github/workflows/flowcordia-promotion-acceptance.yml");
    const config = source("../../../../playwright.flowcordia-promotion.config.ts");

    expect(route).toContain('data-testid="flowcordia-proposal-route"');
    expect(workspace).toContain('data-testid="flowcordia-proposal-workspace"');
    expect(workspace).toContain('data-testid="flowcordia-promotion-open"');
    expect(workspace).toContain('data-testid="flowcordia-promotion-merge-method"');
    expect(workspace).toContain('data-testid="flowcordia-promotion-confirm"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-promotion-acceptance");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
  });
});
