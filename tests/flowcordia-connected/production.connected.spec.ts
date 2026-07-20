import { expect, test } from "@playwright/test";
import {
  parseFlowcordiaProductionAcceptanceEnvironment,
  productionAcceptanceFailure,
  type FlowcordiaProductionAcceptanceConfig,
  type FlowcordiaProductionAcceptanceEvidence,
  type FlowcordiaProductionAcceptanceStage,
} from "../../apps/webapp/app/features/flowcordia/acceptance/production-contract";
import { FLOWCORDIA_PRODUCTION_CONFIRMATION } from "../../apps/webapp/app/features/flowcordia/workflows/production/command-contract";
import { writeFlowcordiaProductionAcceptanceEvidence } from "./production-evidence";

const RUN_ID = /^[A-Za-z0-9_-]{1,255}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;

function fallbackMode(): "production" | "rollback_production" {
  return process.env.FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE === "rollback_production"
    ? "rollback_production"
    : "production";
}

function fallbackIdentity(name: string, pattern: RegExp, fallback: string): string {
  const value = process.env[name]?.trim() ?? "";
  return pattern.test(value) ? value : fallback;
}

test("execute and prove the exact promoted production version", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_PRODUCTION_ACCEPTANCE_EVIDENCE_PATH ??
    "/tmp/flowcordia-production-acceptance/evidence.json";
  let config: FlowcordiaProductionAcceptanceConfig | null = null;
  let evidence: FlowcordiaProductionAcceptanceEvidence | null = null;
  let stage: Exclude<FlowcordiaProductionAcceptanceStage, "complete"> = "configuration";

  try {
    config = parseFlowcordiaProductionAcceptanceEnvironment(process.env);
    test.setTimeout(config.timeoutMs + 120_000);

    stage = "navigation";
    await page.goto(config.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const route = page.getByTestId("flowcordia-studio-route");
    await expect(route).toBeVisible();
    await expect(route).toHaveAttribute("data-connected", "true");

    stage = "identity";
    await expect(route).toHaveAttribute(
      "data-application-commit",
      config.expectedApplicationCommitSha
    );
    const panel = page.getByTestId("flowcordia-production-proof");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-proposal-id", config.proposalId);
    await expect(panel).toHaveAttribute("data-proposal-head", config.expectedHeadSha);
    await expect(panel).toHaveAttribute("data-merge-commit", config.expectedMergeCommitSha);
    await expect(panel).toHaveAttribute("data-deployment-commit", config.expectedMergeCommitSha);
    await expect(panel).toHaveAttribute(
      "data-deployment-version",
      config.expectedDeploymentVersion
    );

    stage = "production_readiness";
    await expect(panel).toHaveAttribute("data-state", "READY", {
      timeout: Math.min(config.timeoutMs, 10 * 60 * 1_000),
    });
    const previousRunId = (await panel.getAttribute("data-run-id")) ?? "";
    await expect(page.getByTestId("flowcordia-production-open")).toBeEnabled();

    stage = "execution";
    await page.getByTestId("flowcordia-production-open").click();
    await page
      .getByTestId("flowcordia-production-payload")
      .fill(JSON.stringify(config.payload, null, 2));
    await page
      .getByTestId("flowcordia-production-confirmation")
      .fill(FLOWCORDIA_PRODUCTION_CONFIRMATION);
    await expect(page.getByTestId("flowcordia-production-confirm")).toBeEnabled();
    await page.getByTestId("flowcordia-production-confirm").click();
    await expect(page.getByTestId("flowcordia-production-run-started")).toBeVisible({
      timeout: 60_000,
    });

    stage = "proof";
    await expect
      .poll(
        async () => {
          const candidate = (await panel.getAttribute("data-run-id")) ?? "";
          return candidate !== previousRunId && RUN_ID.test(candidate) ? candidate : "";
        },
        { timeout: config.timeoutMs, intervals: [2_000, 3_000, 5_000, 5_000] }
      )
      .toMatch(RUN_ID);
    const runId = (await panel.getAttribute("data-run-id")) ?? "";
    await expect(panel).toHaveAttribute("data-run-status", "COMPLETED_SUCCESSFULLY", {
      timeout: config.timeoutMs,
    });
    await expect(panel).toHaveAttribute("data-run-proof", "VERIFIED", {
      timeout: config.timeoutMs,
    });
    await expect(panel).toHaveAttribute("data-proposal-id", config.proposalId);
    await expect(panel).toHaveAttribute("data-proposal-head", config.expectedHeadSha);
    await expect(panel).toHaveAttribute("data-merge-commit", config.expectedMergeCommitSha);
    await expect(panel).toHaveAttribute("data-deployment-commit", config.expectedMergeCommitSha);
    await expect(panel).toHaveAttribute(
      "data-deployment-version",
      config.expectedDeploymentVersion
    );

    evidence = {
      schemaVersion: "0.1",
      mode: config.mode,
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      proposalId: config.proposalId,
      applicationCommitSha: config.expectedApplicationCommitSha,
      startedAt,
      completedAt: new Date().toISOString(),
      production: {
        expectedHeadSha: config.expectedHeadSha,
        observedHeadSha: (await panel.getAttribute("data-proposal-head")) ?? "",
        mergeCommitSha: config.expectedMergeCommitSha,
        deploymentCommitSha: (await panel.getAttribute("data-deployment-commit")) ?? "",
        deploymentVersion: config.expectedDeploymentVersion,
        run: {
          friendlyId: runId,
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Browser cleanup must not replace the primary acceptance result.
    }
    await writeFlowcordiaProductionAcceptanceEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        productionAcceptanceFailure({
          mode: config?.mode ?? fallbackMode(),
          stage,
          workflowId:
            config?.workflowId ??
            fallbackIdentity(
              "FLOWCORDIA_PRODUCTION_ACCEPTANCE_WORKFLOW_ID",
              /^[a-z][a-z0-9_-]{2,127}$/,
              "invalid_workflow"
            ),
          proposalId:
            config?.proposalId ??
            fallbackIdentity(
              "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PROPOSAL_ID",
              PUBLIC_ID,
              "invalid_proposal"
            ),
          startedAt,
          completedAt: new Date().toISOString(),
        })
    );
  }
});
