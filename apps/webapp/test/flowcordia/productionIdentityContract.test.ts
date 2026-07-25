import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION,
  parseFlowcordiaProductionIdentityEnvironment,
  productionIdentityFailure,
} from "../../app/features/flowcordia/acceptance/production-identity-contract";

const APPLICATION_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const MERGE_SHA = "c".repeat(40);

function environment(overrides: Record<string, string> = {}) {
  return {
    FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION:
      FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION,
    FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL: "https://flowcordia.example.com",
    FLOWCORDIA_PRODUCTION_IDENTITY_STUDIO_PATH:
      "/orgs/example/projects/reference/env/production/flowcordia/workflows",
    FLOWCORDIA_PRODUCTION_IDENTITY_WORKFLOW_ID: "release_workflow",
    FLOWCORDIA_PRODUCTION_IDENTITY_PROPOSAL_ID: "proposal_release",
    FLOWCORDIA_PRODUCTION_IDENTITY_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
    FLOWCORDIA_PRODUCTION_IDENTITY_HEAD_SHA: HEAD_SHA,
    FLOWCORDIA_PRODUCTION_IDENTITY_MERGE_COMMIT_SHA: MERGE_SHA,
    FLOWCORDIA_PRODUCTION_IDENTITY_STORAGE_STATE_PATH: "/tmp/private/storage.json",
    FLOWCORDIA_PRODUCTION_IDENTITY_EVIDENCE_PATH: "/tmp/private/evidence.json",
    FLOWCORDIA_PRODUCTION_IDENTITY_TIMEOUT_SECONDS: "3600",
    ...overrides,
  };
}

describe("Flowcordia production identity contract", () => {
  it("builds one exact authenticated Studio URL", () => {
    const parsed = parseFlowcordiaProductionIdentityEnvironment(environment());
    expect(parsed).toMatchObject({
      workflowId: "release_workflow",
      proposalId: "proposal_release",
      expectedApplicationCommitSha: APPLICATION_SHA,
      expectedHeadSha: HEAD_SHA,
      expectedMergeCommitSha: MERGE_SHA,
      timeoutMs: 3_600_000,
    });
    expect(parsed.studioUrl).toContain("workflow=release_workflow");
  });

  it("rejects unsafe origins, paths, identities, and confirmation", () => {
    expect(() =>
      parseFlowcordiaProductionIdentityEnvironment(
        environment({ FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL: "http://flowcordia.example.com" })
      )
    ).toThrow();
    expect(() =>
      parseFlowcordiaProductionIdentityEnvironment(
        environment({ FLOWCORDIA_PRODUCTION_IDENTITY_STUDIO_PATH: "//evil.example/path" })
      )
    ).toThrow();
    expect(() =>
      parseFlowcordiaProductionIdentityEnvironment(
        environment({ FLOWCORDIA_PRODUCTION_IDENTITY_HEAD_SHA: "main" })
      )
    ).toThrow();
    expect(() =>
      parseFlowcordiaProductionIdentityEnvironment(
        environment({ FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION: "yes" })
      )
    ).toThrow();
  });

  it("produces only bounded failure evidence", () => {
    expect(
      productionIdentityFailure({
        stage: "identity",
        workflowId: "release_workflow",
        proposalId: "proposal_release",
        applicationCommitSha: APPLICATION_SHA,
        startedAt: "2026-07-25T00:00:00.000Z",
        completedAt: "2026-07-25T00:01:00.000Z",
      })
    ).toEqual({
      schemaVersion: "0.1",
      mode: "production_identity",
      result: "FAILED",
      stage: "identity",
      workflowId: "release_workflow",
      proposalId: "proposal_release",
      applicationCommitSha: APPLICATION_SHA,
      startedAt: "2026-07-25T00:00:00.000Z",
      completedAt: "2026-07-25T00:01:00.000Z",
      failure: {
        code: "IDENTITY_MISMATCH",
        message: "Production identity discovery failed safely.",
      },
    });
  });
});
