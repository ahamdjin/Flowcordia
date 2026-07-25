import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOWCORDIA_CONNECTED_CAMPAIGN_STAGES,
  parseFlowcordiaConnectedCampaignPlan,
  sourceRunsFromReceipts,
} from "./flowcordia-connected-release-campaign.mjs";

function plan(overrides = {}) {
  return {
    schemaVersion: "0.1",
    releaseId: "flowcordia-0.1.0-rc.1",
    applicationCommitSha: "a".repeat(40),
    workflowId: "release_workflow",
    studioPath: "/orgs/example/projects/reference/env/production/flowcordia/workflows",
    proposalPath: "/orgs/example/projects/reference/env/production/flowcordia/proposals",
    replacementName: "Release acceptance 2026-07-25",
    repository: { owner: "example", name: "flowcordia-reference", branch: "main" },
    mergeMethod: "squash",
    allowGlobalStudio: false,
    publications: { currentRunId: "1001", targetRunId: "1002" },
    alert: {
      projectRef: "proj_reference",
      channelRef: "alert_reference",
      maxPendingAlerts: 0,
      maxOldestPendingAgeMs: 300000,
    },
    webhookNodeId: "incoming_webhook",
    rollbackTarget: {
      proposalId: "proposal_previous",
      headSha: "b".repeat(40),
      mergeCommitSha: "c".repeat(40),
      reason: "Restore the previously accepted reference workflow after production proof.",
    },
    stageTimeoutSeconds: 3600,
    ...overrides,
  };
}

test("campaign plan accepts one bounded exact release identity", () => {
  const parsed = parseFlowcordiaConnectedCampaignPlan(plan());
  assert.equal(parsed.releaseId, "flowcordia-0.1.0-rc.1");
  assert.equal(parsed.publications.currentRunId, "1001");
  assert.equal(parsed.repository.branch, "main");
  assert.equal(parsed.alert.maxPendingAlerts, 0);
});

test("campaign plan rejects arbitrary fields and mutable identities", () => {
  assert.throws(() => parseFlowcordiaConnectedCampaignPlan({ ...plan(), workflowFile: "evil.yml" }));
  assert.throws(() =>
    parseFlowcordiaConnectedCampaignPlan(plan({ applicationCommitSha: "main" }))
  );
  assert.throws(() =>
    parseFlowcordiaConnectedCampaignPlan(
      plan({ publications: { currentRunId: "1001", targetRunId: "1001" } })
    )
  );
});

test("campaign uses a fixed official stage order", () => {
  assert.deepEqual(
    FLOWCORDIA_CONNECTED_CAMPAIGN_STAGES.map(([stage]) => stage),
    [
      "bundled_clean_install",
      "self_host_lifecycle",
      "provider",
      "alert",
      "author",
      "preview",
      "promotion",
      "production_identity",
      "production",
      "webhook_production",
      "rollback_proposal",
      "rollback_promotion",
      "rollback_production_identity",
      "rollback_production",
      "assemble",
    ]
  );
  for (const [, workflow] of FLOWCORDIA_CONNECTED_CAMPAIGN_STAGES) {
    assert.match(workflow, /^\.github\/workflows\/flowcordia-[a-z0-9-]+\.yml$/);
  }
});

test("release assembler receives exactly ten distinct official source runs", () => {
  const stages = [
    "bundled_clean_install",
    "self_host_lifecycle",
    "provider",
    "alert",
    "preview",
    "promotion",
    "production",
    "webhook_production",
    "rollback_proposal",
    "rollback_production",
  ];
  const sourceRuns = sourceRunsFromReceipts(
    stages.map((stage, index) => ({ stage, runId: 2000 + index }))
  );
  assert.deepEqual(Object.keys(sourceRuns), stages);
  assert.equal(new Set(Object.values(sourceRuns)).size, 10);
});
