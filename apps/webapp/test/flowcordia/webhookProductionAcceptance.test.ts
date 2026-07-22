import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_WEBHOOK_ACCEPTANCE_CONFIRMATION,
  parseFlowcordiaWebhookAcceptanceEnvironment,
  webhookAcceptanceFailure,
} from "../../app/features/flowcordia/acceptance/webhook-production-contract";

function repositoryFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

function environment(): NodeJS.ProcessEnv {
  return {
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL: "https://flowcordia.example",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_STUDIO_PATH:
      "/orgs/acme/projects/project/env/prod/flowcordia/workflows?not-allowed",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_WORKFLOW_ID: "orders_intake",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_NODE_ID: "webhook_1",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_APPLICATION_COMMIT_SHA:
      "0123456789abcdef0123456789abcdef01234567",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_PAYLOAD_JSON: '{"order":42}',
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET: "s".repeat(32),
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_STORAGE_STATE_PATH: "/tmp/flowcordia-storage.json",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_EVIDENCE_PATH: "/tmp/flowcordia-evidence.json",
    FLOWCORDIA_WEBHOOK_ACCEPTANCE_TIMEOUT_SECONDS: "1200",
  };
}

describe("Flowcordia production webhook acceptance", () => {
  it("accepts one bounded protected environment", () => {
    const values = environment();
    values.FLOWCORDIA_WEBHOOK_ACCEPTANCE_STUDIO_PATH =
      "/orgs/acme/projects/project/env/prod/flowcordia/workflows";
    expect(parseFlowcordiaWebhookAcceptanceEnvironment(values)).toMatchObject({
      studioUrl:
        "https://flowcordia.example/orgs/acme/projects/project/env/prod/flowcordia/workflows",
      workflowId: "orders_intake",
      nodeId: "webhook_1",
      timeoutMs: 1_200_000,
      payload: { order: 42 },
    });
  });

  it("rejects ambiguous paths, insecure origins, and weak secrets", () => {
    expect(() => parseFlowcordiaWebhookAcceptanceEnvironment(environment())).toThrow(/Studio path/);
    const insecure = environment();
    insecure.FLOWCORDIA_WEBHOOK_ACCEPTANCE_STUDIO_PATH = "/flowcordia/workflows";
    insecure.FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL = "http://flowcordia.example";
    expect(() => parseFlowcordiaWebhookAcceptanceEnvironment(insecure)).toThrow(/HTTPS origin/);
    const weak = environment();
    weak.FLOWCORDIA_WEBHOOK_ACCEPTANCE_STUDIO_PATH = "/flowcordia/workflows";
    weak.FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET = "short";
    expect(() => parseFlowcordiaWebhookAcceptanceEnvironment(weak)).toThrow(/HMAC secret/);
  });

  it("produces bounded failure evidence without operational identity", () => {
    expect(
      webhookAcceptanceFailure({
        stage: "revocation",
        workflowId: "orders_intake",
        startedAt: "2026-07-23T00:00:00.000Z",
        completedAt: "2026-07-23T00:01:00.000Z",
      })
    ).toEqual({
      schemaVersion: "0.1",
      mode: "webhook_production",
      result: "FAILED",
      stage: "revocation",
      workflowId: "orders_intake",
      startedAt: "2026-07-23T00:00:00.000Z",
      completedAt: "2026-07-23T00:01:00.000Z",
      failure: {
        code: "WEBHOOK_ACCEPTANCE_FAILED",
        message: "The protected production webhook acceptance stage failed.",
      },
    });
  });

  it("keeps the destructive workflow main-only, protected, pinned, and sanitized", () => {
    const source = repositoryFile(
      ".github/workflows/flowcordia-webhook-production-acceptance.yml"
    );
    expect(source).toContain("workflow_dispatch:");
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    expect(source).toContain("environment: flowcordia-webhook-acceptance");
    expect(source).toContain(`Type ${FLOWCORDIA_WEBHOOK_ACCEPTANCE_CONFIRMATION}`);
    expect(source).toContain("persist-credentials: false");
    expect(source).toContain("ref: ${{ github.sha }}");
    expect(source).toContain(
      "FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET: ${{ secrets.FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET }}"
    );
    expect(source).toContain(
      "pnpm exec playwright test --config=playwright.flowcordia-webhook-production.config.ts"
    );
    expect(source).toContain("flowcordia-webhook-production-${{ inputs.workflow_id }}");
    expect(source).toContain("unset FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET");
    expect(source).not.toContain("pull_request:");
    expect(source).not.toContain("on:\n  push:");
  });

  it("forbids secret, payload, endpoint, URL, delivery, and run identities in evidence", () => {
    const source = repositoryFile(
      "tests/flowcordia-connected/webhook-production-evidence.ts"
    );
    expect(source).toContain("payload");
    expect(source).toContain("secret");
    expect(source).toContain("url");
    expect(source).toContain("publicId");
    expect(source).toContain("deliveryId");
    expect(source).toContain("runId");
  });
});
