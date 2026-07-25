import { expect, test, type Locator } from "@playwright/test";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import {
  parseFlowcordiaProductionIdentityEnvironment,
  productionIdentityFailure,
  type FlowcordiaProductionIdentityConfig,
  type FlowcordiaProductionIdentityEvidence,
} from "../../apps/webapp/app/features/flowcordia/acceptance/production-identity-contract";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DEPLOYMENT_VERSION = /^[A-Za-z0-9._:-]{1,128}$/;

async function attribute(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) throw new Error(`Required production identity attribute ${name} is unavailable.`);
  return value;
}

async function writeEvidence(path: string, evidence: FlowcordiaProductionIdentityEvidence) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function fallback(value: string | undefined, pattern: RegExp, replacement: string): string {
  return value && pattern.test(value) ? value : replacement;
}

test("discovers the exact ready Flowcordia production identity", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_PRODUCTION_IDENTITY_EVIDENCE_PATH ??
    "/tmp/flowcordia-production-identity/evidence.json";
  let config: FlowcordiaProductionIdentityConfig | null = null;
  let evidence: FlowcordiaProductionIdentityEvidence | null = null;
  let stage: Exclude<FlowcordiaProductionIdentityEvidence["stage"], "complete"> =
    "configuration";
  let applicationCommitSha: string | undefined;

  try {
    config = parseFlowcordiaProductionIdentityEnvironment(process.env);
    test.setTimeout(config.timeoutMs + 120_000);

    stage = "navigation";
    await page.goto(config.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const route = page.getByTestId("flowcordia-studio-route");
    await expect(route).toBeVisible();
    await expect(route).toHaveAttribute("data-connected", "true");
    await expect(route).toHaveAttribute(
      "data-application-commit",
      config.expectedApplicationCommitSha
    );
    applicationCommitSha = await attribute(route, "data-application-commit");

    await page.getByTestId("flowcordia-lifecycle-step-production").click();
    const production = page.getByTestId("flowcordia-production-proof");
    await expect(production).toBeVisible();

    stage = "waiting";
    await expect(production).toHaveAttribute("data-state", "READY", {
      timeout: config.timeoutMs,
    });
    await expect(production).toHaveAttribute("data-closure-state", "READY");

    stage = "identity";
    const proposalId = await attribute(production, "data-proposal-id");
    const headSha = await attribute(production, "data-proposal-head");
    const mergeCommitSha = await attribute(production, "data-merge-commit");
    const deploymentCommitSha = await attribute(production, "data-deployment-commit");
    const deploymentVersion = await attribute(production, "data-deployment-version");
    const closureDigest = await attribute(production, "data-closure-digest");
    const expectedCount = Number(await attribute(production, "data-closure-expected"));
    const installedCount = Number(await attribute(production, "data-closure-installed"));

    if (
      proposalId !== config.proposalId ||
      headSha !== config.expectedHeadSha ||
      mergeCommitSha !== config.expectedMergeCommitSha ||
      deploymentCommitSha !== config.expectedMergeCommitSha ||
      !SHA.test(headSha) ||
      !SHA.test(mergeCommitSha) ||
      !SHA.test(deploymentCommitSha) ||
      !DEPLOYMENT_VERSION.test(deploymentVersion) ||
      !SHA256.test(closureDigest) ||
      !Number.isSafeInteger(expectedCount) ||
      expectedCount < 1 ||
      expectedCount > 100 ||
      installedCount !== expectedCount
    ) {
      throw new Error("The observed production identity does not match the exact promoted closure.");
    }

    evidence = {
      schemaVersion: "0.1",
      mode: "production_identity",
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      proposalId,
      applicationCommitSha,
      startedAt,
      completedAt: new Date().toISOString(),
      production: {
        headSha,
        mergeCommitSha,
        deploymentCommitSha,
        deploymentVersion,
        closureDigest,
        closureWorkflowCount: expectedCount,
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Cleanup must not replace the primary result.
    }
    await writeEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        productionIdentityFailure({
          stage,
          workflowId: config?.workflowId ??
            fallback(process.env.FLOWCORDIA_PRODUCTION_IDENTITY_WORKFLOW_ID, /^[a-z][a-z0-9_-]{2,127}$/, "invalid_workflow"),
          proposalId: config?.proposalId ??
            fallback(process.env.FLOWCORDIA_PRODUCTION_IDENTITY_PROPOSAL_ID, /^[A-Za-z0-9_-]{1,255}$/, "invalid_proposal"),
          startedAt,
          completedAt: new Date().toISOString(),
          applicationCommitSha,
        })
    );
  }
});
