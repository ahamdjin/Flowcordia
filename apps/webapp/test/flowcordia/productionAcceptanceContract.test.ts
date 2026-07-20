import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION,
  FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE_CONFIRMATION,
  parseFlowcordiaProductionAcceptanceEnvironment,
  productionAcceptanceFailure,
  type FlowcordiaProductionAcceptanceEvidence,
} from "../../app/features/flowcordia/acceptance/production-contract";
import { writeFlowcordiaProductionAcceptanceEvidence } from "../../../../tests/flowcordia-connected/production-evidence";

const validEnvironment = {
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE: "production",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION: FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION,
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL: "https://flowcordia.example.com",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_STUDIO_PATH:
    "/orgs/acme/projects/reference/env/prod/flowcordia/workflows",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_WORKFLOW_ID: "reference_workflow",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_PROPOSAL_ID: "proposal_reference",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_APPLICATION_COMMIT_SHA: "1".repeat(40),
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_HEAD_SHA: "a".repeat(40),
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_MERGE_COMMIT_SHA: "b".repeat(40),
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_DEPLOYMENT_VERSION: "20260720.1",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON: '{"kind":"production-proof"}',
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_STORAGE_STATE_PATH: "/tmp/storage.json",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_EVIDENCE_PATH: "/tmp/evidence.json",
  FLOWCORDIA_PRODUCTION_ACCEPTANCE_TIMEOUT_SECONDS: "900",
};

describe("Flowcordia production acceptance", () => {
  it("parses one exact promoted production identity", () => {
    expect(parseFlowcordiaProductionAcceptanceEnvironment(validEnvironment)).toEqual({
      mode: "production",
      baseUrl: "https://flowcordia.example.com",
      studioUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/workflows?workflow=reference_workflow",
      workflowId: "reference_workflow",
      proposalId: "proposal_reference",
      expectedApplicationCommitSha: "1".repeat(40),
      expectedHeadSha: "a".repeat(40),
      expectedMergeCommitSha: "b".repeat(40),
      expectedDeploymentVersion: "20260720.1",
      payload: { kind: "production-proof" },
      storageStatePath: "/tmp/storage.json",
      evidencePath: "/tmp/evidence.json",
      timeoutMs: 900_000,
    });
  });

  it("uses a separate destructive confirmation for rollback production", () => {
    expect(
      parseFlowcordiaProductionAcceptanceEnvironment({
        ...validEnvironment,
        FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE: "rollback_production",
        FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION:
          FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE_CONFIRMATION,
      }).mode
    ).toBe("rollback_production");
  });

  it("rejects ambiguous origin, identity, deployment, payload, timeout, and confirmation", () => {
    for (const overrides of [
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE: "preview" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION: "yes" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL: "http://flowcordia.example.com" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_STUDIO_PATH: "https://other.example.com/studio" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_WORKFLOW_ID: "Invalid workflow" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_PROPOSAL_ID: "invalid proposal" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_APPLICATION_COMMIT_SHA: "ABC123" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_HEAD_SHA: "ABC123" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_MERGE_COMMIT_SHA: "ABC123" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_DEPLOYMENT_VERSION: "invalid version" },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON: "not-json" },
      {
        FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON: JSON.stringify("x".repeat(64 * 1024)),
      },
      { FLOWCORDIA_PRODUCTION_ACCEPTANCE_TIMEOUT_SECONDS: "59" },
    ]) {
      expect(() =>
        parseFlowcordiaProductionAcceptanceEnvironment({ ...validEnvironment, ...overrides })
      ).toThrow();
    }
  });

  it("writes bounded evidence and rejects forbidden evidence fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-production-evidence-"));
    const path = join(directory, "evidence.json");
    const evidence: FlowcordiaProductionAcceptanceEvidence = {
      schemaVersion: "0.1",
      mode: "production",
      result: "PASSED",
      stage: "complete",
      workflowId: "reference_workflow",
      proposalId: "proposal_reference",
      applicationCommitSha: "1".repeat(40),
      startedAt: "2026-07-20T15:00:00.000Z",
      completedAt: "2026-07-20T15:01:00.000Z",
      production: {
        expectedHeadSha: "a".repeat(40),
        observedHeadSha: "a".repeat(40),
        mergeCommitSha: "b".repeat(40),
        deploymentCommitSha: "b".repeat(40),
        deploymentVersion: "20260720.1",
        run: {
          friendlyId: "run_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    };

    try {
      await writeFlowcordiaProductionAcceptanceEvidence(path, evidence);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(evidence);
      await expect(
        writeFlowcordiaProductionAcceptanceEvidence(join(directory, "unsafe.json"), {
          ...evidence,
          payload: { secret: "never-write-this" },
        } as FlowcordiaProductionAcceptanceEvidence)
      ).rejects.toThrow("forbidden field payload");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns fixed bounded failure evidence", () => {
    expect(
      productionAcceptanceFailure({
        mode: "production",
        stage: "proof",
        workflowId: "reference_workflow",
        proposalId: "proposal_reference",
        startedAt: "2026-07-20T15:00:00.000Z",
        completedAt: "2026-07-20T15:01:00.000Z",
      }).failure
    ).toEqual({
      code: "PROOF_FAILED",
      message: "The production run did not complete with trusted verified node evidence.",
    });
  });

  it("uses only the protected authenticated Studio production command", () => {
    const source = (relativePath: string) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const spec = source("../../../../tests/flowcordia-connected/production.connected.spec.ts");
    const workflow = source("../../../../.github/workflows/flowcordia-production-acceptance.yml");
    const config = source("../../../../playwright.flowcordia-production.config.ts");

    expect(spec).toContain("flowcordia-production-open");
    expect(spec).toContain("flowcordia-production-confirm");
    expect(spec).toContain("FLOWCORDIA_PRODUCTION_CONFIRMATION");
    expect(spec).not.toMatch(/TriggerTaskService|workerDeployment|octokit|github\.rest/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-production-acceptance");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("contents: write");
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
  });
});
