import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  parseFlowcordiaPromotionAcceptanceEnvironment,
  promotionAcceptanceFailure,
  type FlowcordiaPromotionAcceptanceConfig,
  type FlowcordiaPromotionAcceptanceEvidence,
} from "../../apps/webapp/app/features/flowcordia/acceptance/promotion-contract";
import { writeFlowcordiaPromotionAcceptanceEvidence } from "./promotion-evidence";

const SHA = /^[a-f0-9]{40}$/;
const SAFE_NAME = /^[A-Za-z0-9._/-]{1,256}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;

async function attribute(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (value === null || value.length === 0) {
    throw new Error(`Required promotion acceptance attribute ${name} is unavailable.`);
  }
  return value;
}

async function integerAttribute(locator: Locator, name: string): Promise<number> {
  const value = Number(await attribute(locator, name));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Promotion acceptance attribute ${name} is not a non-negative integer.`);
  }
  return value;
}

async function proveReadiness(page: Page, config: FlowcordiaPromotionAcceptanceConfig) {
  await page.goto(config.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const route = page.getByTestId("flowcordia-studio-route");
  await expect(route).toBeVisible();
  await expect(route).toHaveAttribute("data-connected", "true");
  const studio = page.getByTestId("flowcordia-workflow-studio");
  await expect(studio).toBeVisible();
  await expect(studio).toHaveAttribute("data-workflow-id", config.workflowId);

  const readiness = page.getByTestId("flowcordia-readiness");
  await page.getByTestId("flowcordia-readiness-run").click();
  await expect(readiness).toHaveAttribute("data-state", "READY", {
    timeout: config.readinessTimeoutMs,
  });
  await expect(readiness).toHaveAttribute("data-blocked", "0");
  await expect(readiness).toHaveAttribute("data-unavailable", "0");
  await expect(readiness).toHaveAttribute("data-repository-owner", config.repository.owner);
  await expect(readiness).toHaveAttribute("data-repository-name", config.repository.name);
  await expect(readiness).toHaveAttribute("data-repository-branch", config.repository.branch);

  const commitSha = await attribute(readiness, "data-repository-commit");
  if (!SHA.test(commitSha)) {
    throw new Error("Connected readiness returned an invalid immutable commit.");
  }
  return {
    state: "READY" as const,
    passed: await integerAttribute(readiness, "data-passed"),
    blocked: 0 as const,
    unavailable: 0 as const,
    repository: { ...config.repository, commitSha },
  };
}

function fallbackPublicId(value: string | undefined, fallback: string): string {
  return value && PUBLIC_ID.test(value) ? value : fallback;
}

test("governed Flowcordia promotion acceptance", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_PROMOTION_EVIDENCE_PATH ??
    "/tmp/flowcordia-promotion-evidence/evidence.json";
  let config: FlowcordiaPromotionAcceptanceConfig | null = null;
  let evidence: FlowcordiaPromotionAcceptanceEvidence | null = null;
  let stage: Exclude<FlowcordiaPromotionAcceptanceEvidence["stage"], "complete"> =
    "configuration";

  try {
    config = parseFlowcordiaPromotionAcceptanceEnvironment(process.env);
    test.setTimeout(config.readinessTimeoutMs + config.promotionTimeoutMs + 120_000);

    stage = "readiness";
    const readiness = await proveReadiness(page, config);

    stage = "navigation";
    await page.goto(config.proposalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const route = page.getByTestId("flowcordia-proposal-route");
    await expect(route).toBeVisible();
    await expect(route).toHaveAttribute("data-connected", "true");

    const workspace = page.getByTestId("flowcordia-proposal-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-proposal-id", config.proposalId);
    await expect(workspace).toHaveAttribute("data-repository-owner", config.repository.owner);
    await expect(workspace).toHaveAttribute("data-repository-name", config.repository.name);
    await expect(workspace).toHaveAttribute("data-repository-branch", config.repository.branch);
    await expect(workspace).toHaveAttribute("data-can-write", "true");
    await expect(workspace).toHaveAttribute("data-proposal-state", "READY");
    await expect(workspace).toHaveAttribute("data-proposal-head", config.expectedHeadSha);
    await expect(workspace).toHaveAttribute("data-available-action", "promote");

    stage = "governance";
    await expect(workspace).toHaveAttribute("data-governance-state", "SATISFIED");
    await expect(workspace).toHaveAttribute("data-governance-head", config.expectedHeadSha);
    const governance = {
      state: "SATISFIED" as const,
      evaluatedHeadSha: config.expectedHeadSha,
    };

    stage = "promotion";
    await page.getByTestId("flowcordia-promotion-open").click();
    await page.getByTestId("flowcordia-promotion-merge-method").selectOption(config.mergeMethod);
    await page.getByTestId("flowcordia-promotion-confirm").click();

    await expect(workspace).toHaveAttribute("data-proposal-state", "MERGED", {
      timeout: config.promotionTimeoutMs,
    });
    await expect(workspace).toHaveAttribute("data-proposal-id", config.proposalId);
    await expect(workspace).toHaveAttribute("data-proposal-head", config.expectedHeadSha);
    const mergeCommitSha = await attribute(workspace, "data-merge-commit");
    if (!SHA.test(mergeCommitSha) || !SAFE_NAME.test(config.repository.branch)) {
      throw new Error("Promotion returned invalid bounded merge evidence.");
    }

    evidence = {
      schemaVersion: "0.1",
      mode: "promotion",
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      proposalId: config.proposalId,
      startedAt,
      completedAt: new Date().toISOString(),
      readiness,
      governance,
      promotion: {
        expectedHeadSha: config.expectedHeadSha,
        mergeMethod: config.mergeMethod,
        mergeCommitSha,
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Cleanup must not replace the primary acceptance result.
    }
    await writeFlowcordiaPromotionAcceptanceEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        promotionAcceptanceFailure({
          stage,
          workflowId: config?.workflowId ?? fallbackPublicId(process.env.FLOWCORDIA_PROMOTION_WORKFLOW_ID, "invalid_workflow"),
          proposalId: config?.proposalId ?? fallbackPublicId(process.env.FLOWCORDIA_PROMOTION_PROPOSAL_ID, "invalid_proposal"),
          startedAt,
          completedAt: new Date().toISOString(),
        })
    );
  }
});
