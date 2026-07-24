import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFlowcordiaSlackActionEvidence,
  FLOWCORDIA_SLACK_ACTION_CANDIDATE,
  FLOWCORDIA_SLACK_ACTION_CONFIRMATION,
  FLOWCORDIA_SLACK_ACTION_ENVIRONMENT,
  FLOWCORDIA_SLACK_ACTION_WORKFLOW,
  parseFlowcordiaSlackActionEvidence,
  type FlowcordiaSlackActionEvidence,
} from "../../../../scripts/flowcordia-slack-action-evidence.mjs";

const applicationCommitSha = "1234567890abcdef1234567890abcdef12345678";
const checkedAt = new Date("2026-07-24T04:30:00.000Z");
const productionSlackSha = "45a88b9581bfab2566dc881e2cd66d334e621e2c";
const temporaryDirectories: string[] = [];

function repositorySource(path: string): string {
  return fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
}

function evidenceFieldNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(evidenceFieldNames);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [key, ...evidenceFieldNames(child)]);
}

function syntheticEvidence(): FlowcordiaSlackActionEvidence {
  return createFlowcordiaSlackActionEvidence({
    applicationCommitSha,
    runId: "987654321",
    runAttempt: "1",
    runnerOs: "Linux",
    runnerArch: "X64",
    checkedAt,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Flowcordia Slack action compatibility", () => {
  it("creates bounded non-mutating READY evidence", () => {
    const evidence = syntheticEvidence();
    const fieldNames = evidenceFieldNames(evidence).join("\n");

    expect(evidence.state).toBe("READY");
    expect(evidence.candidate).toEqual(FLOWCORDIA_SLACK_ACTION_CANDIDATE);
    expect(evidence.source.protectedEnvironment).toBe(FLOWCORDIA_SLACK_ACTION_ENVIRONMENT);
    expect(evidence.verification).toEqual({
      authentication: "VERIFIED",
      mutation: "NONE",
    });
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fieldNames).not.toMatch(
      /token|authorization|payload|response|channel|team|user|bot|recipient|header|url/i
    );
    expect(parseFlowcordiaSlackActionEvidence(evidence)).toEqual(evidence);
  });

  it("rejects modified compatibility evidence", () => {
    const evidence = syntheticEvidence();
    evidence.runner.os = "Windows";

    expect(() => parseFlowcordiaSlackActionEvidence(evidence)).toThrow(
      "Slack compatibility evidence digest is invalid"
    );
  });

  it("uses owner-only no-overwrite evidence output", async () => {
    const root = await mkdtemp(join(tmpdir(), "flowcordia-slack-action-"));
    temporaryDirectories.push(root);
    const output = join(root, "compatibility.json");
    const script = repositorySource("scripts/flowcordia-slack-action-evidence.mjs");
    const args = [
      script,
      "create",
      "--application-sha",
      applicationCommitSha,
      "--run-id",
      "987654321",
      "--run-attempt",
      "1",
      "--runner-os",
      "Linux",
      "--runner-arch",
      "X64",
      "--checked-at",
      checkedAt.toISOString(),
      "--output",
      output,
    ];

    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(first.status).toBe(0);
    expect(JSON.parse(await readFile(output, "utf8")).state).toBe("READY");

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("Refusing to overwrite existing evidence");
  });

  it("owns a protected main-only credentialed canary without Slack mutation", async () => {
    const [workflow, critical, weekly, policy, runbook] = await Promise.all([
      readFile(repositorySource(FLOWCORDIA_SLACK_ACTION_WORKFLOW), "utf8"),
      readFile(repositorySource(".github/workflows/dependabot-critical-alerts.yml"), "utf8"),
      readFile(repositorySource(".github/workflows/dependabot-weekly-summary.yml"), "utf8"),
      readFile(repositorySource("flowcordia/security/github-actions-upgrade-policy.md"), "utf8"),
      readFile(
        repositorySource("flowcordia/runbooks/github-actions-slack-compatibility.md"),
        "utf8"
      ),
    ]);

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("on:\n  push:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain(FLOWCORDIA_SLACK_ACTION_CONFIRMATION);
    expect(workflow).toContain("environment: dependabot-summary");
    expect(workflow).toContain(FLOWCORDIA_SLACK_ACTION_CANDIDATE.sha);
    expect(workflow).toContain("method: auth.test");
    expect(workflow).toContain("errors: true");
    expect(workflow).toContain("${{ secrets.SLACK_BOT_TOKEN }}");
    expect(workflow).toContain('[[ "$SLACK_OK" == "true" ]]');
    expect(workflow).not.toContain("chat.postMessage");
    expect(workflow).not.toContain("SLACK_CHANNEL_ID");
    expect(workflow).not.toContain("payload-file-path");
    expect(workflow).not.toContain("git push");

    expect(critical).toContain(`${productionSlackSha} # v3.0.3`);
    expect(weekly).toContain(`${productionSlackSha} # v3.0.3`);
    expect(critical).not.toContain(FLOWCORDIA_SLACK_ACTION_CANDIDATE.sha);
    expect(weekly).not.toContain(FLOWCORDIA_SLACK_ACTION_CANDIDATE.sha);
    expect(policy).toContain("Slack compatibility campaign");
    expect(policy).toContain("does not authorize the Slack v4 promotion");
    expect(runbook).toContain(FLOWCORDIA_SLACK_ACTION_CONFIRMATION);
    expect(runbook).toContain("mutation: NONE");
  });
});
