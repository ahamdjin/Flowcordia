import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  connectedAcceptanceFailure,
  FLOWCORDIA_CONNECTED_ACCEPTANCE_MODES,
  parseFlowcordiaConnectedAcceptanceEnvironment,
  type FlowcordiaConnectedAcceptanceConfig,
  type FlowcordiaConnectedAcceptanceEvidence,
  type FlowcordiaConnectedAcceptanceMode,
} from "../../apps/webapp/app/features/flowcordia/acceptance/contract";
import { writeFlowcordiaConnectedAcceptanceEvidence } from "./evidence";

const SHA = /^[a-f0-9]{40}$/;
const SAFE_NAME = /^[A-Za-z0-9._/-]{1,256}$/;

function fallbackMode(): FlowcordiaConnectedAcceptanceMode {
  const value = process.env.FLOWCORDIA_ACCEPTANCE_MODE;
  return FLOWCORDIA_CONNECTED_ACCEPTANCE_MODES.includes(value as FlowcordiaConnectedAcceptanceMode)
    ? (value as FlowcordiaConnectedAcceptanceMode)
    : "readiness";
}

function fallbackWorkflowId(): string {
  const value = process.env.FLOWCORDIA_ACCEPTANCE_WORKFLOW_ID ?? "invalid_workflow";
  return /^[a-z][a-z0-9_-]{2,127}$/.test(value) ? value : "invalid_workflow";
}

async function attribute(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (value === null || value.length === 0) {
    throw new Error(`Required acceptance attribute ${name} is unavailable.`);
  }
  return value;
}

async function integerAttribute(locator: Locator, name: string): Promise<number> {
  const value = Number(await attribute(locator, name));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Acceptance attribute ${name} is not a non-negative integer.`);
  }
  return value;
}

async function connectedReadiness(page: Page, config: FlowcordiaConnectedAcceptanceConfig) {
  const readiness = page.getByTestId("flowcordia-readiness");
  await expect(readiness).toBeVisible();
  await page.getByTestId("flowcordia-readiness-run").click();
  await expect(readiness).toHaveAttribute("data-state", "READY", {
    timeout: config.readinessTimeoutMs,
  });
  await expect(readiness).toHaveAttribute("data-blocked", "0");
  await expect(readiness).toHaveAttribute("data-unavailable", "0");

  const owner = await attribute(readiness, "data-repository-owner");
  const name = await attribute(readiness, "data-repository-name");
  const branch = await attribute(readiness, "data-repository-branch");
  const commitSha = await attribute(readiness, "data-repository-commit");
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(name) || !SAFE_NAME.test(branch) || !SHA.test(commitSha)) {
    throw new Error("Connected readiness returned invalid bounded repository identity.");
  }

  return {
    state: "READY" as const,
    passed: await integerAttribute(readiness, "data-passed"),
    blocked: 0 as const,
    unavailable: 0 as const,
    repository: { owner, name, branch, commitSha },
  };
}

async function chooseAdvancedJson(page: Page, payloadText: string): Promise<void> {
  const testing = page.getByTestId("flowcordia-testing-panel");
  await expect(testing).toBeVisible();
  await page.getByTestId("flowcordia-testing-input-json").click();
  await page.getByTestId("flowcordia-testing-payload").fill(payloadText);
}

test("connected Flowcordia acceptance", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const evidencePath =
    process.env.FLOWCORDIA_ACCEPTANCE_EVIDENCE_PATH ??
    "/tmp/flowcordia-connected-evidence/evidence.json";
  let stage: Exclude<FlowcordiaConnectedAcceptanceEvidence["stage"], "complete"> =
    "configuration";
  let config: FlowcordiaConnectedAcceptanceConfig | null = null;
  let evidence: FlowcordiaConnectedAcceptanceEvidence | null = null;

  try {
    config = parseFlowcordiaConnectedAcceptanceEnvironment(process.env);
    test.setTimeout(
      config.readinessTimeoutMs +
        Math.max(config.structuralTimeoutMs, config.previewTimeoutMs) +
        120_000
    );

    stage = "navigation";
    await page.goto(config.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const route = page.getByTestId("flowcordia-studio-route");
    await expect(route).toBeVisible();
    await expect(route).toHaveAttribute("data-connected", "true");

    const studio = page.getByTestId("flowcordia-workflow-studio");
    await expect(studio).toBeVisible();
    await expect(studio).toHaveAttribute("data-workflow-id", config.workflowId);

    stage = "readiness";
    const readiness = await connectedReadiness(page, config);

    if (config.mode === "readiness") {
      evidence = {
        schemaVersion: "0.1",
        mode: config.mode,
        result: "PASSED",
        stage: "complete",
        workflowId: config.workflowId,
        startedAt,
        completedAt: new Date().toISOString(),
        readiness,
      };
      return;
    }

    if (!config.payloadText) {
      throw new Error("The validated connected acceptance payload is unavailable.");
    }
    await chooseAdvancedJson(page, config.payloadText);

    if (config.mode === "structural") {
      stage = "structural";
      await expect(studio).toHaveAttribute("data-draft-present", "true");
      await page.getByTestId("flowcordia-testing-mode-structural").click();
      await page.getByTestId("flowcordia-testing-run").click();
      const result = page.getByTestId("flowcordia-structural-result");
      await expect(result).toHaveAttribute("data-status", "PASSED", {
        timeout: config.structuralTimeoutMs,
      });
      evidence = {
        schemaVersion: "0.1",
        mode: config.mode,
        result: "PASSED",
        stage: "complete",
        workflowId: config.workflowId,
        startedAt,
        completedAt: new Date().toISOString(),
        readiness,
        structural: { status: "PASSED" },
      };
      return;
    }

    stage = "preview";
    if (!config.expectedHeadSha) {
      throw new Error("The validated exact proposal head is unavailable.");
    }
    await expect(studio).toHaveAttribute("data-preview-state", "READY");
    await expect(studio).toHaveAttribute("data-proposal-head", config.expectedHeadSha);
    const deploymentVersion = await attribute(studio, "data-deployment-version");
    if (!SAFE_NAME.test(deploymentVersion)) {
      throw new Error("Preview deployment version is not a bounded public identifier.");
    }

    await page.getByTestId("flowcordia-testing-mode-live").click();
    await page.getByTestId("flowcordia-testing-run").click();
    await expect(studio).toHaveAttribute("data-run-proof", "VERIFIED", {
      timeout: config.previewTimeoutMs,
    });
    await expect(studio).toHaveAttribute("data-run-status", "COMPLETED_SUCCESSFULLY");
    await expect(studio).toHaveAttribute("data-proposal-head", config.expectedHeadSha);

    const friendlyId = await attribute(studio, "data-run-id");
    if (!SAFE_NAME.test(friendlyId)) {
      throw new Error("Live run identity is not a bounded public identifier.");
    }
    evidence = {
      schemaVersion: "0.1",
      mode: config.mode,
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      startedAt,
      completedAt: new Date().toISOString(),
      readiness,
      preview: {
        state: "READY",
        expectedHeadSha: config.expectedHeadSha,
        observedHeadSha: await attribute(studio, "data-proposal-head"),
        deploymentVersion,
        run: {
          friendlyId,
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Session cleanup must not replace the primary acceptance result.
    }
    const completedAt = new Date().toISOString();
    await writeFlowcordiaConnectedAcceptanceEvidence(
      config?.evidencePath ?? evidencePath,
      evidence ??
        connectedAcceptanceFailure({
          mode: config?.mode ?? fallbackMode(),
          stage,
          workflowId: config?.workflowId ?? fallbackWorkflowId(),
          startedAt,
          completedAt,
        })
    );
  }
});
