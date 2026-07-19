import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  connectedAcceptanceFailure,
  parseFlowcordiaConnectedAcceptanceEnvironment,
  type FlowcordiaConnectedAcceptanceEvidence,
} from "../../app/features/flowcordia/acceptance/contract";
import { writeFlowcordiaConnectedAcceptanceEvidence } from "../../../../tests/flowcordia-connected/evidence";

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    FLOWCORDIA_ACCEPTANCE_MODE: "readiness",
    FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://flowcordia.example.com",
    FLOWCORDIA_ACCEPTANCE_STUDIO_PATH:
      "/orgs/acme/projects/reference/env/prod/flowcordia/workflows",
    FLOWCORDIA_ACCEPTANCE_WORKFLOW_ID: "reference_workflow",
    FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_PATH: "/tmp/storage-state.json",
    FLOWCORDIA_ACCEPTANCE_EVIDENCE_PATH: "/tmp/evidence.json",
    ...overrides,
  };
}

describe("Flowcordia connected acceptance contract", () => {
  it("builds one exact readiness Studio URL without accepting embedded query state", () => {
    expect(parseFlowcordiaConnectedAcceptanceEnvironment(environment())).toMatchObject({
      mode: "readiness",
      baseUrl: "https://flowcordia.example.com",
      workflowId: "reference_workflow",
      studioUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/workflows?workflow=reference_workflow",
      payloadText: null,
      expectedHeadSha: null,
      readinessTimeoutMs: 120_000,
      structuralTimeoutMs: 180_000,
      previewTimeoutMs: 900_000,
    });
  });

  it("requires valid JSON and one exact lowercase proposal head for preview mode", () => {
    const config = parseFlowcordiaConnectedAcceptanceEnvironment(
      environment({
        FLOWCORDIA_ACCEPTANCE_MODE: "preview",
        FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: '{"leadId":"lead_123"}',
        FLOWCORDIA_ACCEPTANCE_EXPECTED_HEAD_SHA: "a".repeat(40),
      })
    );
    expect(config.payloadText).toBe('{"leadId":"lead_123"}');
    expect(config.expectedHeadSha).toBe("a".repeat(40));

    expect(() =>
      parseFlowcordiaConnectedAcceptanceEnvironment(
        environment({
          FLOWCORDIA_ACCEPTANCE_MODE: "preview",
          FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: "not-json",
          FLOWCORDIA_ACCEPTANCE_EXPECTED_HEAD_SHA: "a".repeat(40),
        })
      )
    ).toThrow("must contain valid JSON");
    expect(() =>
      parseFlowcordiaConnectedAcceptanceEnvironment(
        environment({
          FLOWCORDIA_ACCEPTANCE_MODE: "preview",
          FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: "{}",
          FLOWCORDIA_ACCEPTANCE_EXPECTED_HEAD_SHA: "ABC123",
        })
      )
    ).toThrow("40-character lowercase commit SHA");
  });

  it("rejects unsafe origins, ambiguous paths, invalid IDs, oversized payloads, and unbounded timeouts", () => {
    for (const overrides of [
      { FLOWCORDIA_ACCEPTANCE_BASE_URL: "http://flowcordia.example.com" },
      { FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://user:pass@flowcordia.example.com" },
      { FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://flowcordia.example.com/path" },
      { FLOWCORDIA_ACCEPTANCE_STUDIO_PATH: "//other.example.com/studio" },
      { FLOWCORDIA_ACCEPTANCE_STUDIO_PATH: "/studio?workflow=other" },
      { FLOWCORDIA_ACCEPTANCE_WORKFLOW_ID: "Invalid Workflow" },
      { FLOWCORDIA_ACCEPTANCE_READINESS_TIMEOUT_SECONDS: "9" },
      { FLOWCORDIA_ACCEPTANCE_PREVIEW_TIMEOUT_SECONDS: "1801" },
    ]) {
      expect(() => parseFlowcordiaConnectedAcceptanceEnvironment(environment(overrides))).toThrow();
    }
    expect(() =>
      parseFlowcordiaConnectedAcceptanceEnvironment(
        environment({
          FLOWCORDIA_ACCEPTANCE_MODE: "structural",
          FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: JSON.stringify("x".repeat(64 * 1024)),
        })
      )
    ).toThrow("exceeds 64 KiB");
  });

  it("writes bounded evidence atomically without payload, cookie, token, or raw error fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-connected-evidence-"));
    const path = join(directory, "evidence.json");
    const sentinel = "super-secret-payload-value";
    const evidence: FlowcordiaConnectedAcceptanceEvidence = {
      schemaVersion: "0.1",
      mode: "preview",
      result: "PASSED",
      stage: "complete",
      workflowId: "reference_workflow",
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
      preview: {
        state: "READY",
        expectedHeadSha: "b".repeat(40),
        observedHeadSha: "b".repeat(40),
        deploymentVersion: "20260720.1",
        run: {
          friendlyId: "run_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    };

    try {
      await writeFlowcordiaConnectedAcceptanceEvidence(path, evidence);
      const value = await readFile(path, "utf8");
      expect(JSON.parse(value)).toEqual(evidence);
      expect(value).not.toContain(sentinel);
      expect(value).not.toMatch(/payload|cookie|token|storageState|headers|stack|rawError/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses stage-owned fixed failure messages instead of serializing thrown errors", () => {
    const failure = connectedAcceptanceFailure({
      mode: "preview",
      stage: "preview",
      workflowId: "reference_workflow",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:01:00.000Z",
    });
    expect(failure.failure).toEqual({
      code: "PREVIEW_FAILED",
      message: "Exact-head live preview proof was not verified.",
    });
    expect(JSON.stringify(failure)).not.toContain("super-secret-payload-value");
  });
});
