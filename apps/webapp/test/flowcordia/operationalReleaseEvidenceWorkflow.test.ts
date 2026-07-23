import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function workflow(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia operational release evidence workflows", () => {
  it("runs provider readiness only from protected main with one controlled mailbox", () => {
    const source = workflow(".github/workflows/flowcordia-provider-readiness.yml");
    expect(source).toContain("workflow_dispatch:");
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    expect(source).toContain("environment: flowcordia-provider-readiness");
    expect(source).toContain("permissions: {}");
    expect(source).toContain("contents: read");
    expect(source).toContain("ref: ${{ github.sha }}");
    expect(source).toContain("persist-credentials: false");
    expect(source).toContain(
      "FLOWCORDIA_PROVIDER_TEST_RECIPIENT: ${{ secrets.FLOWCORDIA_PROVIDER_TEST_RECIPIENT }}"
    );
    expect(source).toContain("EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST");
    expect(source).toContain("FLOWCORDIA_APPLICATION_COMMIT_SHA");
    expect(source).toContain("pnpm flowcordia:providers:preflight");
    expect(source).toContain('evidence.providers.phase !== "complete"');
    expect(source).toContain('evidence.installation.profile !== "release"');
    expect(source).toContain("retention-days: 90");
    expect(source).not.toContain("pull_request:");
    expect(source).not.toContain("on:\n  push:");
    expect(source).not.toContain("email_recipient:");
  });

  it("requires all eight official run identities in the immutable assembler", () => {
    const source = workflow(".github/workflows/flowcordia-assemble-release-evidence.yml");
    expect(source).toContain("source_runs_json:");
    expect(source).toContain(
      "Exact JSON object with provider, alert, preview, promotion, production, webhook_production, rollback_proposal, and rollback_production run IDs"
    );
    for (const stage of [
      "provider",
      "alert",
      "preview",
      "promotion",
      "production",
      "webhook_production",
      "rollback_proposal",
      "rollback_production",
    ]) {
      expect(source).toContain(`"${stage}"`);
    }
    expect(source).toContain("FLOWCORDIA_RELEASE_PROVIDER_RUN_ID");
    expect(source).toContain("FLOWCORDIA_RELEASE_ALERT_RUN_ID");
    expect(source).toContain("FLOWCORDIA_RELEASE_WEBHOOK_PRODUCTION_RUN_ID");
    expect(source).toContain(".github/workflows/flowcordia-provider-readiness.yml");
    expect(source).toContain(".github/workflows/flowcordia-alert-readiness.yml");
    expect(source).toContain(".github/workflows/flowcordia-webhook-production-acceptance.yml");
    expect(source).toContain("flowcordia-provider-readiness-$FLOWCORDIA_RELEASE_ID");
    expect(source).toContain("flowcordia-alert-readiness-$FLOWCORDIA_RELEASE_ID");
    expect(source).toContain(
      "flowcordia-webhook-production-$FLOWCORDIA_RELEASE_WORKFLOW_ID-$FLOWCORDIA_RELEASE_WEBHOOK_PRODUCTION_RUN_ID"
    );
    expect(source).toContain("Every release source must use a distinct run ID");
    expect(source).not.toContain("preview_run_id:");
    expect(source).not.toContain("alert_run_id:");
    expect(source).not.toContain("webhook_production_run_id:");
  });
});
