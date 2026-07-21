import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_PRIVATE_BETA_CONFIRMATION,
  parseFlowcordiaPrivateBetaEnvironment,
  privateBetaFailure,
} from "../../app/features/flowcordia/acceptance/private-beta-contract";

const APPLICATION_SHA = "a".repeat(40);
const validEnvironment = {
  FLOWCORDIA_PRIVATE_BETA_CONFIRMATION,
  FLOWCORDIA_PRIVATE_BETA_REPOSITORY_MAINTAINER: "false",
  FLOWCORDIA_PRIVATE_BETA_ASSISTANCE_COUNT: "0",
  FLOWCORDIA_PRIVATE_BETA_BASE_URL: "https://flowcordia.example.com",
  FLOWCORDIA_PRIVATE_BETA_STUDIO_PATH:
    "/orgs/acme/projects/reference/env/prod/flowcordia/workflows",
  FLOWCORDIA_PRIVATE_BETA_WORKFLOW_ID: "reference_workflow",
  FLOWCORDIA_PRIVATE_BETA_REPLACEMENT_NAME: "Private beta reviewed workflow",
  FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON: '{"kind":"private-beta"}',
  FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_PATH: "/tmp/storage.json",
  FLOWCORDIA_PRIVATE_BETA_EVIDENCE_PATH: "/tmp/evidence.json",
  FLOWCORDIA_PRIVATE_BETA_EXPECTED_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
  FLOWCORDIA_PRIVATE_BETA_TIMEOUT_SECONDS: "900",
};

describe("Flowcordia private beta author journey", () => {
  it("parses one exact-revision standard-account zero-intervention journey", () => {
    expect(parseFlowcordiaPrivateBetaEnvironment(validEnvironment)).toEqual({
      baseUrl: "https://flowcordia.example.com",
      studioUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/workflows?workflow=reference_workflow",
      workflowId: "reference_workflow",
      storageStatePath: "/tmp/storage.json",
      evidencePath: "/tmp/evidence.json",
      payloadText: '{"kind":"private-beta"}',
      replacementName: "Private beta reviewed workflow",
      expectedApplicationCommitSha: APPLICATION_SHA,
      journeyTimeoutMs: 900_000,
      operatorAttestation: {
        repositoryMaintainerAccount: false,
        maintainerInterventionCount: 0,
      },
    });
  });

  it("rejects privileged shortcuts, ambiguous attestation, and unbound deployments", () => {
    for (const overrides of [
      { FLOWCORDIA_PRIVATE_BETA_CONFIRMATION: "yes" },
      { FLOWCORDIA_PRIVATE_BETA_REPOSITORY_MAINTAINER: "true" },
      { FLOWCORDIA_PRIVATE_BETA_ASSISTANCE_COUNT: "1" },
      { FLOWCORDIA_PRIVATE_BETA_BASE_URL: "http://flowcordia.example.com" },
      { FLOWCORDIA_PRIVATE_BETA_STUDIO_PATH: "/another/page" },
      { FLOWCORDIA_PRIVATE_BETA_WORKFLOW_ID: "Invalid workflow" },
      { FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON: "not-json" },
      { FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_PATH: "relative/storage.json" },
      { FLOWCORDIA_PRIVATE_BETA_EXPECTED_APPLICATION_COMMIT_SHA: "a".repeat(39) },
      { FLOWCORDIA_PRIVATE_BETA_TIMEOUT_SECONDS: "59" },
    ]) {
      expect(() =>
        parseFlowcordiaPrivateBetaEnvironment({ ...validEnvironment, ...overrides })
      ).toThrow();
    }
  });

  it("does not claim identity or attestation proof when that stage fails", () => {
    expect(
      privateBetaFailure({
        stage: "identity",
        workflowId: "reference_workflow",
        startedAt: "2026-07-21T00:00:00.000Z",
        completedAt: "2026-07-21T00:01:00.000Z",
      })
    ).toEqual({
      schemaVersion: "0.2",
      mode: "private_beta_author_journey",
      result: "FAILED",
      stage: "identity",
      workflowId: "reference_workflow",
      startedAt: "2026-07-21T00:00:00.000Z",
      completedAt: "2026-07-21T00:01:00.000Z",
      failure: {
        code: "IDENTITY_FAILED",
        message: "The browser session did not satisfy the standard-account identity boundary.",
      },
    });
  });

  it("preserves only previously verified context in later-stage failure evidence", () => {
    expect(
      privateBetaFailure({
        stage: "proposal",
        workflowId: "reference_workflow",
        startedAt: "2026-07-21T00:00:00.000Z",
        completedAt: "2026-07-21T00:01:00.000Z",
        applicationCommitSha: APPLICATION_SHA,
        identity: {
          platformAdmin: false,
          superCapability: false,
          impersonating: false,
        },
        operatorAttestation: {
          repositoryMaintainerAccount: false,
          maintainerInterventionCount: 0,
        },
        steps: [{ stage: "identity", result: "PASSED", durationMs: 12 }],
      })
    ).toMatchObject({
      result: "FAILED",
      stage: "proposal",
      applicationCommitSha: APPLICATION_SHA,
      identity: {
        platformAdmin: false,
        superCapability: false,
        impersonating: false,
      },
      operatorAttestation: {
        repositoryMaintainerAccount: false,
        maintainerInterventionCount: 0,
      },
      steps: [{ stage: "identity", result: "PASSED", durationMs: 12 }],
      failure: { code: "PROPOSAL_FAILED" },
    });
  });
});
