import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  parseFlowcordiaPrivateBetaEnvironment,
  privateBetaFailure,
  type FlowcordiaPrivateBetaConfig,
  type FlowcordiaPrivateBetaEvidence,
  type FlowcordiaPrivateBetaIdentity,
  type FlowcordiaPrivateBetaStage,
  type FlowcordiaPrivateBetaStepEvidence,
} from "../../apps/webapp/app/features/flowcordia/acceptance/private-beta-contract";
import { writeFlowcordiaPrivateBetaEvidence } from "./private-beta-evidence";

const SHA = /^[0-9a-f]{40}$/;
const PROPOSAL_ID = /^[A-Za-z0-9_-]{1,255}$/;

async function attribute(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) throw new Error(`Required private beta attribute ${name} is unavailable.`);
  return value;
}

function fallbackWorkflowId(): string {
  const value = process.env.FLOWCORDIA_PRIVATE_BETA_WORKFLOW_ID ?? "invalid_workflow";
  return /^[a-z][a-z0-9_-]{2,127}$/.test(value) ? value : "invalid_workflow";
}

async function openStructuralInput(page: Page, payloadText: string): Promise<void> {
  await page.getByTestId("flowcordia-lifecycle-step-build").click();
  const testing = page.getByTestId("flowcordia-testing-panel");
  await expect(testing).toBeVisible();
  await page.getByTestId("flowcordia-testing-mode-structural").click();
  await page.getByTestId("flowcordia-testing-input-json").click();
  await page.getByTestId("flowcordia-testing-payload").fill(payloadText);
}

test("standard account completes the Flowcordia private beta author journey", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_PRIVATE_BETA_EVIDENCE_PATH ??
    "/tmp/flowcordia-private-beta-evidence/evidence.json";
  let config: FlowcordiaPrivateBetaConfig | null = null;
  let evidence: FlowcordiaPrivateBetaEvidence | null = null;
  let stage: Exclude<FlowcordiaPrivateBetaStage, "complete"> = "configuration";
  let applicationCommitSha: string | undefined;
  let identity: FlowcordiaPrivateBetaIdentity | undefined;
  const steps: FlowcordiaPrivateBetaStepEvidence[] = [];

  const runStep = async <T>(
    nextStage: Exclude<FlowcordiaPrivateBetaStage, "configuration" | "complete">,
    operation: () => Promise<T>
  ): Promise<T> => {
    stage = nextStage;
    const began = Date.now();
    const result = await operation();
    steps.push({ stage: nextStage, result: "PASSED", durationMs: Date.now() - began });
    return result;
  };

  try {
    config = parseFlowcordiaPrivateBetaEnvironment(process.env);
    test.setTimeout(config.journeyTimeoutMs + 120_000);

    const route = await runStep("navigation", async () => {
      await page.goto(config!.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const locator = page.getByTestId("flowcordia-studio-route");
      await expect(locator).toBeVisible();
      await expect(locator).toHaveAttribute("data-connected", "true");
      await expect(locator).toHaveAttribute(
        "data-application-commit",
        config!.expectedApplicationCommitSha
      );
      applicationCommitSha = await attribute(locator, "data-application-commit");
      return locator;
    });

    const studio = page.getByTestId("flowcordia-workflow-studio");
    await runStep("identity", async () => {
      await expect(route).toHaveAttribute("data-platform-admin", "false");
      await expect(route).toHaveAttribute("data-super-capability", "false");
      await expect(route).toHaveAttribute("data-impersonating", "false");
      await expect(studio).toBeVisible();
      await expect(studio).toHaveAttribute("data-workflow-id", config!.workflowId);
      identity = {
        platformAdmin: false,
        superCapability: false,
        impersonating: false,
      };
    });

    await runStep("draft", async () => {
      if ((await studio.getAttribute("data-draft-present")) !== "true") {
        await page.getByTestId("flowcordia-start-editing").click();
      }
      await expect(studio).toHaveAttribute("data-draft-present", "true");
      await expect(studio).not.toHaveAttribute("data-draft-version", "");
    });

    await runStep("edit", async () => {
      const previousVersion = await attribute(studio, "data-draft-version");
      const name = page.getByTestId("flowcordia-workflow-name");
      await expect(name).toBeVisible();
      if ((await name.inputValue()).trim() === config!.replacementName) {
        throw new Error("The private beta replacement name must differ from the active draft.");
      }
      await name.fill(config!.replacementName);
      await page.getByTestId("flowcordia-save-workflow-details").click();
      await expect(studio).not.toHaveAttribute("data-draft-version", previousVersion);
      await expect(name).toHaveValue(config!.replacementName);
    });

    await runStep("structural_test", async () => {
      await openStructuralInput(page, config!.payloadText);
      await page.getByTestId("flowcordia-testing-run").click();
      await expect(page.getByTestId("flowcordia-structural-result")).toHaveAttribute(
        "data-status",
        "PASSED",
        { timeout: Math.min(config!.journeyTimeoutMs, 10 * 60 * 1_000) }
      );
    });

    const proposal = await runStep("proposal", async () => {
      const button = page.getByTestId("flowcordia-publish-proposal");
      await expect(button).toBeEnabled();
      await button.click();
      const created = page.getByTestId("flowcordia-proposal-created");
      await expect(created).toBeVisible({
        timeout: Math.min(config!.journeyTimeoutMs, 10 * 60 * 1_000),
      });
      const proposalId = await attribute(created, "data-proposal-id");
      const proposalHeadSha = await attribute(created, "data-proposal-head");
      const pullRequestNumber = Number(await attribute(created, "data-pull-request-number"));
      if (!PROPOSAL_ID.test(proposalId) || !SHA.test(proposalHeadSha)) {
        throw new Error("Private beta proposal returned invalid bounded identity.");
      }
      if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
        throw new Error("Private beta proposal returned an invalid pull request number.");
      }
      return { proposalId, proposalHeadSha, pullRequestNumber };
    });

    if (!applicationCommitSha || !identity) {
      throw new Error("Verified private beta identity context is unavailable.");
    }
    evidence = {
      schemaVersion: "0.2",
      mode: "private_beta_author_journey",
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      applicationCommitSha,
      identity,
      operatorAttestation: config.operatorAttestation,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
      proposal,
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Session cleanup must not replace the primary journey result.
    }
    await writeFlowcordiaPrivateBetaEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        privateBetaFailure({
          stage,
          workflowId: config?.workflowId ?? fallbackWorkflowId(),
          startedAt,
          completedAt: new Date().toISOString(),
          applicationCommitSha,
          identity,
          operatorAttestation: config?.operatorAttestation,
          steps: steps.length > 0 ? steps : undefined,
        })
    );
  }
});
