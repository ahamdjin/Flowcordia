import { expect, test } from "@playwright/test";
import {
  parseFlowcordiaRollbackAcceptanceEnvironment,
  rollbackAcceptanceFailure,
  type FlowcordiaRollbackAcceptanceConfig,
  type FlowcordiaRollbackAcceptanceEvidence,
  type FlowcordiaRollbackAcceptanceStage,
} from "../../apps/webapp/app/features/flowcordia/acceptance/rollback-contract";
import { FLOWCORDIA_ROLLBACK_CONFIRMATION } from "../../apps/webapp/app/features/flowcordia/workflows/rollback/command-contract";
import { writeFlowcordiaRollbackAcceptanceEvidence } from "./rollback-evidence";

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const SHA = /^[0-9a-f]{40}$/;

function fallbackWorkflowId(): string {
  const value = process.env.FLOWCORDIA_ROLLBACK_ACCEPTANCE_WORKFLOW_ID ?? "invalid_workflow";
  return /^[a-z][a-z0-9_-]{2,127}$/.test(value) ? value : "invalid_workflow";
}

test("create one exact governed rollback proposal through Studio", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_ROLLBACK_ACCEPTANCE_EVIDENCE_PATH ??
    "/tmp/flowcordia-rollback-acceptance/evidence.json";
  let config: FlowcordiaRollbackAcceptanceConfig | null = null;
  let evidence: FlowcordiaRollbackAcceptanceEvidence | null = null;
  let stage: Exclude<FlowcordiaRollbackAcceptanceStage, "complete"> = "configuration";

  try {
    config = parseFlowcordiaRollbackAcceptanceEnvironment(process.env);
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
    const panel = page.getByTestId("flowcordia-rollback-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-current-proposal", config.expectedCurrentProposalId);
    await expect(panel).toHaveAttribute("data-current-head", config.expectedCurrentHeadSha);
    await expect(panel).toHaveAttribute(
      "data-current-merge-commit",
      config.expectedCurrentMergeCommitSha
    );
    await expect(panel).toHaveAttribute("data-base-commit", config.expectedBaseCommitSha);
    await expect(panel).toHaveAttribute("data-base-blob", config.expectedBaseBlobSha);

    stage = "rollback_readiness";
    await expect(panel).toHaveAttribute("data-state", "READY");
    await expect(page.getByTestId("flowcordia-rollback-open")).toBeEnabled();
    await page.getByTestId("flowcordia-rollback-open").click();
    const target = page.getByTestId("flowcordia-rollback-target");
    await target.selectOption(config.targetProposalId);
    await expect(target).toHaveValue(config.targetProposalId);
    const selected = target.locator("option:checked");
    await expect(selected).toHaveAttribute("data-head", config.targetHeadSha);
    await expect(selected).toHaveAttribute("data-merge-commit", config.targetMergeCommitSha);

    stage = "proposal";
    await page.getByTestId("flowcordia-rollback-reason").fill(config.reason);
    await page
      .getByTestId("flowcordia-rollback-confirmation")
      .fill(FLOWCORDIA_ROLLBACK_CONFIRMATION);
    await expect(page.getByTestId("flowcordia-rollback-confirm")).toBeEnabled();
    await page.getByTestId("flowcordia-rollback-confirm").click();
    const created = page.getByTestId("flowcordia-rollback-created");
    await expect(created).toBeVisible({ timeout: config.timeoutMs });
    await expect(created).toHaveAttribute("data-target-proposal-id", config.targetProposalId);
    await expect(created).toHaveAttribute("data-target-merge-commit", config.targetMergeCommitSha);
    const rollbackProposalId = (await created.getAttribute("data-proposal-id")) ?? "";
    const rollbackProposalHeadSha = (await created.getAttribute("data-proposal-head")) ?? "";
    const pullRequestNumber = Number(await created.getAttribute("data-pull-request-number"));
    if (
      !PUBLIC_ID.test(rollbackProposalId) ||
      rollbackProposalId === config.expectedCurrentProposalId ||
      rollbackProposalId === config.targetProposalId ||
      !SHA.test(rollbackProposalHeadSha)
    ) {
      throw new Error("Rollback proposal returned invalid bounded identity.");
    }
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      throw new Error("Rollback proposal returned an invalid pull request number.");
    }

    evidence = {
      schemaVersion: "0.1",
      mode: "rollback_proposal",
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      applicationCommitSha: config.expectedApplicationCommitSha,
      startedAt,
      completedAt: new Date().toISOString(),
      rollback: {
        currentProposalId: config.expectedCurrentProposalId,
        currentHeadSha: config.expectedCurrentHeadSha,
        currentMergeCommitSha: config.expectedCurrentMergeCommitSha,
        baseCommitSha: config.expectedBaseCommitSha,
        baseBlobSha: config.expectedBaseBlobSha,
        targetProposalId: config.targetProposalId,
        targetHeadSha: config.targetHeadSha,
        targetMergeCommitSha: config.targetMergeCommitSha,
        rollbackProposalId,
        rollbackProposalHeadSha,
        pullRequestNumber,
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Browser cleanup must not replace the primary acceptance result.
    }
    await writeFlowcordiaRollbackAcceptanceEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        rollbackAcceptanceFailure({
          stage,
          workflowId: config?.workflowId ?? fallbackWorkflowId(),
          startedAt,
          completedAt: new Date().toISOString(),
        })
    );
  }
});
