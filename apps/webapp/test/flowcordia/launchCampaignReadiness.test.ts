import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleFlowcordiaLaunchCampaignEvidence,
  createFlowcordiaLaunchCampaignStageEvidence,
  FLOWCORDIA_LAUNCH_CAMPAIGN_CONFIRMATION,
  FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS,
  FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES,
  FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW,
  flowcordiaLaunchCampaignSha256,
  parseFlowcordiaLaunchCampaignStageEvidence,
  type FlowcordiaLaunchCampaignStage,
  type FlowcordiaLaunchCampaignStageEvidence,
} from "../../../../scripts/flowcordia-launch-campaign-readiness.mjs";

const applicationCommitSha = "1234567890abcdef1234567890abcdef12345678";
const checkedAt = new Date("2026-07-24T00:00:00.000Z");
const temporaryDirectories: string[] = [];

function storageState(): string {
  return Buffer.from(
    JSON.stringify({
      cookies: [{ name: "session", value: "private-session", domain: "example.com", path: "/" }],
      origins: [{ origin: "https://app.example.com", localStorage: [] }],
    })
  ).toString("base64");
}

function baseEnvironment(stage: FlowcordiaLaunchCampaignStage): Record<string, string> {
  return {
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: applicationCommitSha,
    GITHUB_REPOSITORY: "ahamdjin/Flowcordia",
    GITHUB_RUN_ID: "987654321",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKSPACE: "/workspace/flowcordia",
    FLOWCORDIA_CAMPAIGN_CONFIRMATION: FLOWCORDIA_LAUNCH_CAMPAIGN_CONFIRMATION,
    FLOWCORDIA_CAMPAIGN_ENVIRONMENT_REACHED: FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS[stage],
  };
}

function syntheticStage(
  stage: FlowcordiaLaunchCampaignStage,
  state: "READY" | "BLOCKED" = "READY",
  overrides: Partial<FlowcordiaLaunchCampaignStageEvidence> = {}
): FlowcordiaLaunchCampaignStageEvidence {
  const checks = [
    "main_revision",
    "protected_environment",
    "operator_confirmation",
    "configuration",
  ].map((key, index) => ({
    key,
    state: state === "BLOCKED" && index === 3 ? ("BLOCKED" as const) : ("READY" as const),
    message:
      state === "BLOCKED" && index === 3
        ? "The protected configuration is blocked."
        : "The protected configuration is ready.",
  }));
  const withoutDigest = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-launch-campaign-stage-readiness" as const,
    state,
    stage,
    applicationCommitSha,
    checkedAt: checkedAt.toISOString(),
    checks,
    source: {
      repository: "ahamdjin/flowcordia",
      workflowPath: FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW,
      runId: "987654321",
      runAttempt: 1,
      sourceRef: "refs/heads/main" as const,
      sourceCommitSha: applicationCommitSha,
      job: stage,
      environment: FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS[stage],
      runner: stage === "lifecycle" ? ("self-hosted" as const) : ("github-hosted" as const),
    },
    ...overrides,
  };
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaLaunchCampaignSha256(withoutDigest),
  } as FlowcordiaLaunchCampaignStageEvidence;
}

async function evidenceRoot(
  overrides: Partial<
    Record<FlowcordiaLaunchCampaignStage, FlowcordiaLaunchCampaignStageEvidence>
  > = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "flowcordia-launch-campaign-"));
  temporaryDirectories.push(root);
  for (const stage of FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES) {
    const directory = join(root, `flowcordia-launch-campaign-stage-${stage}-987654321`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, `${stage}.json`),
      `${JSON.stringify(overrides[stage] ?? syntheticStage(stage))}\n`,
      { mode: 0o600 }
    );
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Flowcordia launch campaign readiness", () => {
  it("produces bounded READY connected configuration without preserving protected values", async () => {
    const environment = {
      ...baseEnvironment("connected"),
      FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://app.example.com",
      FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: JSON.stringify({ kind: "reference" }),
      FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64: storageState(),
    };

    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: "connected",
      applicationCommitSha,
      environment,
      checkedAt,
    });

    expect(evidence.state).toBe("READY");
    expect(evidence.checks.every((check) => check.state === "READY")).toBe(true);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("private-session");
    expect(serialized).not.toContain(environment.FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64);
    expect(serialized).not.toContain(environment.FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON);
    expect(parseFlowcordiaLaunchCampaignStageEvidence(evidence)).toEqual(evidence);
  });

  it("returns bounded BLOCKED evidence for invalid browser configuration", async () => {
    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: "webhook",
      applicationCommitSha,
      environment: {
        ...baseEnvironment("webhook"),
        FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL: "http://unsafe.example.com",
        FLOWCORDIA_WEBHOOK_ACCEPTANCE_PAYLOAD_JSON: "not-json",
        FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET: "short",
        FLOWCORDIA_WEBHOOK_ACCEPTANCE_STORAGE_STATE_B64: "invalid",
      },
      checkedAt,
    });

    expect(evidence.state).toBe("BLOCKED");
    expect(evidence.checks.filter((check) => check.state === "BLOCKED")).toHaveLength(4);
    expect(JSON.stringify(evidence)).not.toContain("not-json");
    expect(JSON.stringify(evidence)).not.toContain("short");
  });

  it("blocks lifecycle readiness when the dedicated safe path boundary is absent", async () => {
    const evidence = await createFlowcordiaLaunchCampaignStageEvidence({
      stage: "lifecycle",
      applicationCommitSha,
      environment: baseEnvironment("lifecycle"),
      checkedAt,
    });

    expect(evidence.state).toBe("BLOCKED");
    expect(
      evidence.checks.some((check) => check.key === "path_isolation" && check.state === "BLOCKED")
    ).toBe(true);
  });

  it("rejects a modified stage digest", () => {
    const evidence = syntheticStage("provider");
    evidence.checks[0]!.message = "Modified after evidence assembly.";

    expect(() => parseFlowcordiaLaunchCampaignStageEvidence(evidence)).toThrow(
      "evidence digest is invalid"
    );
  });

  it("assembles ten exact stage artifacts into one ordered READY result", async () => {
    const root = await evidenceRoot();
    const evidence = await assembleFlowcordiaLaunchCampaignEvidence({
      applicationCommitSha,
      evidenceRoot: root,
      checkedAt: new Date("2026-07-24T00:05:00.000Z"),
    });

    expect(evidence.state).toBe("READY");
    expect(evidence.stages.map((stage) => stage.stage)).toEqual(FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES);
    expect(evidence.stages).toHaveLength(10);
    expect(evidence.stages.every((stage) => stage.blockedChecks === 0)).toBe(true);
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves a blocked stage without losing the exact campaign lineage", async () => {
    const root = await evidenceRoot({ alert: syntheticStage("alert", "BLOCKED") });
    const evidence = await assembleFlowcordiaLaunchCampaignEvidence({
      applicationCommitSha,
      evidenceRoot: root,
      checkedAt: new Date("2026-07-24T00:05:00.000Z"),
    });

    expect(evidence.state).toBe("BLOCKED");
    expect(evidence.stages.find((stage) => stage.stage === "alert")).toMatchObject({
      state: "BLOCKED",
      blockedChecks: 1,
    });
  });

  it("rejects mixed workflow-run identity", async () => {
    const mixed = syntheticStage("promotion");
    mixed.source.runId = "987654322";
    const { evidenceSha256: _digest, ...withoutDigest } = mixed;
    mixed.evidenceSha256 = flowcordiaLaunchCampaignSha256(withoutDigest);
    const root = await evidenceRoot({ promotion: mixed });

    await expect(
      assembleFlowcordiaLaunchCampaignEvidence({
        applicationCommitSha,
        evidenceRoot: root,
        checkedAt: new Date("2026-07-24T00:05:00.000Z"),
      })
    ).rejects.toThrow("one exact workflow run");
  });

  it("never overwrites an existing CLI evidence path", async () => {
    const root = await mkdtemp(join(tmpdir(), "flowcordia-launch-cli-"));
    temporaryDirectories.push(root);
    const output = join(root, "connected.json");
    const script = fileURLToPath(
      new URL("../../../../scripts/flowcordia-launch-campaign-readiness.mjs", import.meta.url)
    );
    const environment = {
      ...process.env,
      ...baseEnvironment("connected"),
      FLOWCORDIA_ACCEPTANCE_BASE_URL: "https://app.example.com",
      FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON: JSON.stringify({ kind: "reference" }),
      FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64: storageState(),
    };
    const args = [
      script,
      "stage",
      "--stage",
      "connected",
      "--application-sha",
      applicationCommitSha,
      "--output",
      output,
    ];

    expect(spawnSync(process.execPath, args, { env: environment }).status).toBe(0);
    const second = spawnSync(process.execPath, args, {
      env: environment,
      encoding: "utf8",
    });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("could not be committed atomically");
    expect(JSON.parse(await readFile(output, "utf8")).state).toBe("READY");
  });

  it("uses every protected environment without invoking destructive campaign work", async () => {
    const workflow = await readFile(
      fileURLToPath(
        new URL(
          "../../../../.github/workflows/flowcordia-launch-campaign-readiness.yml",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    for (const environment of Object.values(FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS)) {
      expect(workflow).toContain(`environment: ${environment}`);
    }
    expect(workflow).toContain("flowcordia-release");
    expect(workflow).toContain(
      "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1"
    );
    expect(workflow).toContain(
      "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093"
    );
    expect(workflow).not.toContain("playwright test");
    expect(workflow).not.toContain("flowcordia:providers:preflight");
    expect(workflow).not.toContain("flowcordia:alerts:preflight");
    expect(workflow).not.toContain("docker build");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).not.toContain("git push");
  });
});
