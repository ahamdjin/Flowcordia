import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    FLOWCORDIA_ACCEPTANCE_EXPECTED_APPLICATION_COMMIT_SHA: "1".repeat(40),
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
      expectedApplicationCommitSha: "1".repeat(40),
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
      { FLOWCORDIA_ACCEPTANCE_EXPECTED_APPLICATION_COMMIT_SHA: "ABC123" },
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
      schemaVersion: "0.2",
      mode: "preview",
      result: "PASSED",
      stage: "complete",
      workflowId: "reference_workflow",
      applicationCommitSha: "1".repeat(40),
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
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
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
      await expect(
        writeFlowcordiaConnectedAcceptanceEvidence(join(directory, "unsafe.json"), {
          ...evidence,
          payload: sentinel,
        } as FlowcordiaConnectedAcceptanceEvidence)
      ).rejects.toThrow("forbidden field payload");
      const { applicationCommitSha: _applicationCommitSha, ...missingApplicationCommit } = evidence;
      await expect(
        writeFlowcordiaConnectedAcceptanceEvidence(
          join(directory, "missing-application.json"),
          missingApplicationCommit as FlowcordiaConnectedAcceptanceEvidence
        )
      ).rejects.toThrow("exact application commit");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps connected acceptance on stable bounded browser and workflow contracts", () => {
    const source = (relativePath: string) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const route = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );
    const readiness = source(
      "../../app/features/flowcordia/workflows/readiness/RepositoryReadinessPanel.tsx"
    );
    const studio = source("../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx");
    const testing = source(
      "../../app/features/flowcordia/workflows/studio/WorkflowFunctionTestPanel.tsx"
    );
    const config = source("../../../../playwright.flowcordia-connected.config.ts");
    const workflow = source("../../../../.github/workflows/flowcordia-connected-acceptance.yml");

    expect(route).toContain('data-testid="flowcordia-studio-route"');
    expect(route).toContain('data-connected="true"');
    expect(route).toContain('data-connected="false"');
    expect(route).toContain("data-application-commit");
    expect(readiness).toContain('data-testid="flowcordia-readiness"');
    expect(readiness).toContain("data-repository-commit");
    expect(studio).toContain('data-testid="flowcordia-workflow-studio"');
    expect(studio).toContain("data-proposal-head");
    expect(studio).toContain("data-run-proof");
    expect(studio).toContain("data-release-http-nodes");
    expect(studio).toContain("data-release-mapping-nodes");
    expect(studio).toContain("data-release-ready-credentials");
    expect(testing).toContain('data-testid="flowcordia-testing-payload"');
    expect(testing).toContain('data-testid="flowcordia-structural-result"');
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-acceptance");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("FLOWCORDIA_ACCEPTANCE_EVIDENCE_PATH");
    expect(workflow).not.toContain("path: ${{ env.FLOWCORDIA_ACCEPTANCE_OUTPUT_DIR }}");
  });

  it("uses a fixed capability failure without serializing workflow data", () => {
    const failure = connectedAcceptanceFailure({
      mode: "preview",
      stage: "capability",
      workflowId: "reference_workflow",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:01:00.000Z",
    });
    expect(failure.failure).toEqual({
      code: "CAPABILITY_FAILED",
      message: "The release workflow does not prove HTTP, mapping, and ready credential coverage.",
    });
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
