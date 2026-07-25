#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOWCORDIA_CONNECTED_CAMPAIGN_SCHEMA_VERSION = "0.1";
export const FLOWCORDIA_CONNECTED_CAMPAIGN_CONFIRMATION = "RUN-CONNECTED-RELEASE-CAMPAIGN";

export const FLOWCORDIA_CONNECTED_CAMPAIGN_STAGES = [
  ["bundled_clean_install", ".github/workflows/flowcordia-bundled-clean-install.yml"],
  ["self_host_lifecycle", ".github/workflows/flowcordia-self-host-lifecycle.yml"],
  ["provider", ".github/workflows/flowcordia-provider-readiness.yml"],
  ["alert", ".github/workflows/flowcordia-alert-readiness.yml"],
  ["author", ".github/workflows/flowcordia-private-beta-journey.yml"],
  ["preview", ".github/workflows/flowcordia-connected-acceptance.yml"],
  ["promotion", ".github/workflows/flowcordia-promotion-acceptance.yml"],
  ["production_identity", ".github/workflows/flowcordia-production-identity.yml"],
  ["production", ".github/workflows/flowcordia-production-acceptance.yml"],
  ["webhook_production", ".github/workflows/flowcordia-webhook-production-acceptance.yml"],
  ["rollback_proposal", ".github/workflows/flowcordia-rollback-acceptance.yml"],
  ["rollback_promotion", ".github/workflows/flowcordia-promotion-acceptance.yml"],
  ["rollback_production_identity", ".github/workflows/flowcordia-production-identity.yml"],
  ["rollback_production", ".github/workflows/flowcordia-production-acceptance.yml"],
  ["assemble", ".github/workflows/flowcordia-assemble-release-evidence.yml"],
];

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,255}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const POSITIVE_RUN_ID = /^[1-9][0-9]{0,19}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

export class FlowcordiaConnectedCampaignError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FlowcordiaConnectedCampaignError";
    this.code = code;
  }
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new FlowcordiaConnectedCampaignError(
      "INVALID_PLAN",
      `${label} has missing or unexpected fields.`
    );
  }
}

function text(value, pattern, label, maximum = 2_048) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} is invalid.`);
  }
  return value;
}

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} is invalid.`);
  }
  return value.trim();
}

function path(value, label) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} is invalid.`);
  }
  return value;
}

function branch(value) {
  const candidate = text(value, BRANCH, "repository.branch", 255);
  if (
    candidate === "@" ||
    candidate.startsWith("-") ||
    candidate.startsWith("/") ||
    candidate.endsWith("/") ||
    candidate.endsWith(".") ||
    candidate.includes("..") ||
    candidate.includes("//") ||
    candidate.includes("@{") ||
    candidate.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))
  ) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", "repository.branch is invalid.");
  }
  return candidate;
}

function integer(value, label, minimum, maximum) {
  const candidate = String(value);
  if (!POSITIVE_INTEGER.test(candidate)) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} must be an integer.`);
  }
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", `${label} is out of bounds.`);
  }
  return parsed;
}

export function parseFlowcordiaConnectedCampaignPlan(value) {
  const plan = object(value, "Campaign plan");
  exactKeys(
    plan,
    [
      "alert",
      "allowGlobalStudio",
      "applicationCommitSha",
      "mergeMethod",
      "proposalPath",
      "publications",
      "releaseId",
      "replacementName",
      "repository",
      "rollbackTarget",
      "schemaVersion",
      "stageTimeoutSeconds",
      "studioPath",
      "webhookNodeId",
      "workflowId",
    ],
    "Campaign plan"
  );
  if (plan.schemaVersion !== FLOWCORDIA_CONNECTED_CAMPAIGN_SCHEMA_VERSION) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", "Campaign schema is unsupported.");
  }
  const repository = object(plan.repository, "repository");
  exactKeys(repository, ["branch", "name", "owner"], "repository");
  const publications = object(plan.publications, "publications");
  exactKeys(publications, ["currentRunId", "targetRunId"], "publications");
  const alert = object(plan.alert, "alert");
  exactKeys(
    alert,
    ["channelRef", "maxOldestPendingAgeMs", "maxPendingAlerts", "projectRef"],
    "alert"
  );
  const rollbackTarget = object(plan.rollbackTarget, "rollbackTarget");
  exactKeys(
    rollbackTarget,
    ["headSha", "mergeCommitSha", "proposalId", "reason"],
    "rollbackTarget"
  );
  if (typeof plan.allowGlobalStudio !== "boolean") {
    throw new FlowcordiaConnectedCampaignError(
      "INVALID_PLAN",
      "allowGlobalStudio must be a boolean."
    );
  }
  if (!["squash", "merge", "rebase"].includes(plan.mergeMethod)) {
    throw new FlowcordiaConnectedCampaignError("INVALID_PLAN", "mergeMethod is invalid.");
  }
  const currentRunId = text(
    String(publications.currentRunId),
    POSITIVE_RUN_ID,
    "publications.currentRunId",
    20
  );
  const targetRunId = text(
    String(publications.targetRunId),
    POSITIVE_RUN_ID,
    "publications.targetRunId",
    20
  );
  if (currentRunId === targetRunId) {
    throw new FlowcordiaConnectedCampaignError(
      "INVALID_PLAN",
      "Current and target publication runs must differ."
    );
  }
  return {
    schemaVersion: FLOWCORDIA_CONNECTED_CAMPAIGN_SCHEMA_VERSION,
    releaseId: text(plan.releaseId, RELEASE_ID, "releaseId", 128),
    applicationCommitSha: text(
      plan.applicationCommitSha,
      SHA,
      "applicationCommitSha",
      40
    ),
    workflowId: text(plan.workflowId, WORKFLOW_ID, "workflowId", 128),
    studioPath: path(plan.studioPath, "studioPath"),
    proposalPath: path(plan.proposalPath, "proposalPath"),
    replacementName: boundedText(plan.replacementName, "replacementName", 160),
    repository: {
      owner: text(repository.owner, REPOSITORY_NAME, "repository.owner", 100),
      name: text(repository.name, REPOSITORY_NAME, "repository.name", 100),
      branch: branch(repository.branch),
    },
    mergeMethod: plan.mergeMethod,
    allowGlobalStudio: plan.allowGlobalStudio,
    publications: { currentRunId, targetRunId },
    alert: {
      projectRef: text(alert.projectRef, PUBLIC_ID, "alert.projectRef", 255),
      channelRef: text(alert.channelRef, PUBLIC_ID, "alert.channelRef", 255),
      maxPendingAlerts: integer(alert.maxPendingAlerts, "alert.maxPendingAlerts", 0, 100_000),
      maxOldestPendingAgeMs: integer(
        alert.maxOldestPendingAgeMs,
        "alert.maxOldestPendingAgeMs",
        1_000,
        86_400_000
      ),
    },
    webhookNodeId: text(plan.webhookNodeId, NODE_ID, "webhookNodeId", 128),
    rollbackTarget: {
      proposalId: text(rollbackTarget.proposalId, PUBLIC_ID, "rollbackTarget.proposalId", 255),
      headSha: text(rollbackTarget.headSha, SHA, "rollbackTarget.headSha", 40),
      mergeCommitSha: text(
        rollbackTarget.mergeCommitSha,
        SHA,
        "rollbackTarget.mergeCommitSha",
        40
      ),
      reason: boundedText(rollbackTarget.reason, "rollbackTarget.reason", 2_000),
    },
    stageTimeoutSeconds: integer(
      plan.stageTimeoutSeconds,
      "stageTimeoutSeconds",
      60,
      21_600
    ),
  };
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  if (result.error || result.status !== 0) {
    throw new FlowcordiaConnectedCampaignError(
      "COMMAND_FAILED",
      `${basename(executable)} command failed safely.`
    );
  }
  return result.stdout.trim();
}

function gh(args, options) {
  return command("gh", args, options);
}

function sleep(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function files(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = join(root, entry.name);
    if (entry.isDirectory()) result.push(...files(candidate));
    else if (entry.isFile() && !entry.isSymbolicLink()) result.push(candidate);
  }
  return result.sort();
}

function artifactSetDigest(root) {
  const inventory = files(root).map((candidate) => ({
    path: relative(root, candidate).replaceAll("\\", "/"),
    size: statSync(candidate).size,
    sha256: sha256(readFileSync(candidate)),
  }));
  return sha256(JSON.stringify(inventory));
}

function evidence(root, predicate, label) {
  const matches = [];
  for (const candidate of files(root).filter((pathValue) => pathValue.endsWith(".json"))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      continue;
    }
    if (predicate(parsed)) matches.push(parsed);
  }
  if (matches.length !== 1) {
    throw new FlowcordiaConnectedCampaignError(
      "EVIDENCE_AMBIGUOUS",
      `${label} evidence is missing or ambiguous.`
    );
  }
  if (matches[0].result !== "PASSED" && matches[0].result !== "READY") {
    throw new FlowcordiaConnectedCampaignError("EVIDENCE_FAILED", `${label} did not pass.`);
  }
  return matches[0];
}

function mainHead(repository) {
  return gh(["api", `repos/${repository}/commits/main`, "--jq", ".sha"]);
}

function recentRuns(workflow, repository) {
  const output = gh([
    "run",
    "list",
    "--repo",
    repository,
    "--workflow",
    workflow,
    "--event",
    "workflow_dispatch",
    "--branch",
    "main",
    "--limit",
    "30",
    "--json",
    "databaseId,headSha,status,conclusion,createdAt,url",
  ]);
  return JSON.parse(output || "[]");
}

function dispatchAndReconcile({ repository, workflow, inputs, applicationCommitSha }) {
  if (mainHead(repository) !== applicationCommitSha) {
    throw new FlowcordiaConnectedCampaignError(
      "MAIN_MOVED",
      "Main changed during the connected release campaign."
    );
  }
  const before = new Set(recentRuns(workflow, repository).map((run) => String(run.databaseId)));
  const dispatchedAt = Date.now();
  const argumentsList = ["workflow", "run", workflow, "--repo", repository, "--ref", "main"];
  for (const [key, value] of Object.entries(inputs)) {
    argumentsList.push("-f", `${key}=${String(value)}`);
  }
  let dispatchFailed = false;
  try {
    gh(argumentsList);
  } catch {
    dispatchFailed = true;
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidates = recentRuns(workflow, repository).filter((run) => {
      const createdAt = Date.parse(run.createdAt);
      return (
        !before.has(String(run.databaseId)) &&
        run.headSha === applicationCommitSha &&
        Number.isFinite(createdAt) &&
        createdAt >= dispatchedAt - 5_000
      );
    });
    if (candidates.length > 1) {
      throw new FlowcordiaConnectedCampaignError(
        "DISPATCH_AMBIGUOUS",
        `Dispatch for ${workflow} produced multiple exact candidates.`
      );
    }
    if (candidates.length === 1) return candidates[0];
    sleep(5_000);
  }
  throw new FlowcordiaConnectedCampaignError(
    dispatchFailed ? "DISPATCH_UNCERTAIN" : "DISPATCH_MISSING",
    `Dispatch for ${workflow} could not be reconciled without retry.`
  );
}

function waitForRun({ repository, runId, applicationCommitSha, timeoutSeconds }) {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    const run = JSON.parse(gh(["api", `repos/${repository}/actions/runs/${runId}`]));
    if (run.head_sha !== applicationCommitSha || run.head_branch !== "main") {
      throw new FlowcordiaConnectedCampaignError(
        "RUN_IDENTITY_MISMATCH",
        "A campaign stage ran on another revision."
      );
    }
    if (run.status === "completed") {
      if (run.conclusion !== "success") {
        throw new FlowcordiaConnectedCampaignError(
          "STAGE_FAILED",
          "A connected release campaign stage did not succeed."
        );
      }
      return run;
    }
    sleep(15_000);
  }
  throw new FlowcordiaConnectedCampaignError("STAGE_TIMEOUT", "A campaign stage timed out.");
}

function downloadRunArtifacts(repository, runId, root) {
  gh(["run", "download", String(runId), "--repo", repository, "--dir", root]);
  if (files(root).length === 0) {
    throw new FlowcordiaConnectedCampaignError(
      "ARTIFACT_MISSING",
      "A successful campaign stage did not preserve evidence."
    );
  }
}

function stageReceipt(stage, workflow, run, artifactSha256) {
  return {
    stage,
    workflow,
    runId: Number(run.id ?? run.databaseId),
    headSha: run.head_sha ?? run.headSha,
    conclusion: "success",
    artifactSetSha256,
    startedAt: run.run_started_at ?? run.created_at ?? run.createdAt,
    completedAt: run.updated_at ?? run.createdAt,
  };
}

function runStage(context, stage, inputs, predicate = null) {
  const workflow = new Map(FLOWCORDIA_CONNECTED_CAMPAIGN_STAGES).get(stage);
  if (!workflow) throw new FlowcordiaConnectedCampaignError("UNKNOWN_STAGE", "Stage is unknown.");
  const candidate = dispatchAndReconcile({
    repository: context.repository,
    workflow,
    inputs,
    applicationCommitSha: context.plan.applicationCommitSha,
  });
  const run = waitForRun({
    repository: context.repository,
    runId: candidate.databaseId,
    applicationCommitSha: context.plan.applicationCommitSha,
    timeoutSeconds: context.plan.stageTimeoutSeconds,
  });
  const root = join(context.privateRoot, `${stage}-${candidate.databaseId}`);
  downloadRunArtifacts(context.repository, candidate.databaseId, root);
  const parsedEvidence = predicate ? evidence(root, predicate, stage) : null;
  const receipt = stageReceipt(stage, workflow, run, artifactSetDigest(root));
  context.receipts.push(receipt);
  rmSync(root, { recursive: true, force: true });
  return { runId: String(candidate.databaseId), evidence: parsedEvidence };
}

function requirePassed(value, mode) {
  return value?.mode === mode && value?.result === "PASSED" && value?.stage === "complete";
}

export function sourceRunsFromReceipts(receipts) {
  const runId = (stage) => {
    const match = receipts.find((candidate) => candidate.stage === stage);
    if (!match) throw new FlowcordiaConnectedCampaignError("MISSING_STAGE", `${stage} is missing.`);
    return String(match.runId);
  };
  return {
    self_host_lifecycle: runId("self_host_lifecycle"),
    provider: runId("provider"),
    alert: runId("alert"),
    preview: runId("preview"),
    promotion: runId("promotion"),
    production: runId("production"),
    webhook_production: runId("webhook_production"),
    rollback_proposal: runId("rollback_proposal"),
    rollback_production: runId("rollback_production"),
  };
}

export function executeFlowcordiaConnectedCampaign(input) {
  const plan = parseFlowcordiaConnectedCampaignPlan(input.plan);
  if (input.confirmation !== FLOWCORDIA_CONNECTED_CAMPAIGN_CONFIRMATION) {
    throw new FlowcordiaConnectedCampaignError(
      "INVALID_CONFIRMATION",
      "Connected release campaign confirmation is invalid."
    );
  }
  if (input.repository !== process.env.GITHUB_REPOSITORY) {
    throw new FlowcordiaConnectedCampaignError(
      "REPOSITORY_MISMATCH",
      "Campaign repository identity is invalid."
    );
  }
  const privateRoot = mkdtempSync(join(tmpdir(), "flowcordia-connected-campaign-"));
  const context = { plan, repository: input.repository, privateRoot, receipts: [] };
  const startedAt = new Date().toISOString();
  try {
    runStage(context, "bundled_clean_install", {
      publication_run_id: plan.publications.targetRunId,
      confirmation: "RUN-BUNDLED-CLEAN-INSTALL",
    });
    runStage(context, "self_host_lifecycle", {
      current_publication_run_id: plan.publications.currentRunId,
      target_publication_run_id: plan.publications.targetRunId,
      confirmation: "RUN-PUBLISHED-SELF-HOST-LIFECYCLE",
    });
    runStage(context, "provider", {
      release_id: plan.releaseId,
      expected_application_commit_sha: plan.applicationCommitSha,
      confirmation: "EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST",
      allow_global_studio: String(plan.allowGlobalStudio),
    });
    runStage(context, "alert", {
      release_id: plan.releaseId,
      expected_application_commit_sha: plan.applicationCommitSha,
      project_ref: plan.alert.projectRef,
      channel_ref: plan.alert.channelRef,
      confirmation: "EXECUTE_EXACT_FLOWCORDIA_ALERT_CANARY",
      max_pending_alerts: String(plan.alert.maxPendingAlerts),
      max_oldest_pending_age_ms: String(plan.alert.maxOldestPendingAgeMs),
    });

    const author = runStage(
      context,
      "author",
      {
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        replacement_name: plan.replacementName,
        application_commit_sha: plan.applicationCommitSha,
        repository_maintainer_account: "false",
        assistance_count: "0",
        confirmation: "STANDARD_NON_MAINTAINER_ZERO_INTERVENTION",
      },
      (value) => requirePassed(value, "private_beta_author_journey")
    ).evidence;
    const proposalId = text(author.proposal?.proposalId, PUBLIC_ID, "author proposal ID", 255);
    const proposalHeadSha = text(author.proposal?.proposalHeadSha, SHA, "author proposal head", 40);

    runStage(
      context,
      "preview",
      {
        mode: "preview",
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        expected_head_sha: proposalHeadSha,
        application_commit_sha: plan.applicationCommitSha,
      },
      (value) => requirePassed(value, "preview")
    );

    const promotion = runStage(
      context,
      "promotion",
      {
        confirmation: "PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL",
        studio_path: plan.studioPath,
        proposal_path: plan.proposalPath,
        workflow_id: plan.workflowId,
        proposal_id: proposalId,
        expected_head_sha: proposalHeadSha,
        application_commit_sha: plan.applicationCommitSha,
        repository_owner: plan.repository.owner,
        repository_name: plan.repository.name,
        repository_branch: plan.repository.branch,
        merge_method: plan.mergeMethod,
      },
      (value) => requirePassed(value, "promotion")
    ).evidence;
    const mergeCommitSha = text(
      promotion.promotion?.mergeCommitSha,
      SHA,
      "promotion merge commit",
      40
    );

    const productionIdentity = runStage(
      context,
      "production_identity",
      {
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        proposal_id: proposalId,
        application_commit_sha: plan.applicationCommitSha,
        expected_head_sha: proposalHeadSha,
        merge_commit_sha: mergeCommitSha,
        confirmation: "DISCOVER_EXACT_FLOWCORDIA_PRODUCTION_IDENTITY",
      },
      (value) => requirePassed(value, "production_identity")
    ).evidence.production;
    if (!productionIdentity) {
      throw new FlowcordiaConnectedCampaignError(
        "EVIDENCE_INVALID",
        "Production identity evidence is incomplete."
      );
    }

    runStage(
      context,
      "production",
      {
        mode: "production",
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        proposal_id: proposalId,
        application_commit_sha: plan.applicationCommitSha,
        expected_head_sha: proposalHeadSha,
        merge_commit_sha: mergeCommitSha,
        deployment_version: productionIdentity.deploymentVersion,
        closure_digest: productionIdentity.closureDigest,
        closure_workflow_count: String(productionIdentity.closureWorkflowCount),
        confirmation: "EXECUTE_EXACT_FLOWCORDIA_PRODUCTION_ACCEPTANCE",
      },
      (value) => requirePassed(value, "production")
    );

    runStage(
      context,
      "webhook_production",
      {
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        node_id: plan.webhookNodeId,
        application_commit_sha: plan.applicationCommitSha,
        confirmation: "EXECUTE_EXACT_FLOWCORDIA_WEBHOOK_ACCEPTANCE",
      },
      (value) => requirePassed(value, "webhook_production")
    );

    const rollback = runStage(
      context,
      "rollback_proposal",
      {
        confirmation: "CREATE_EXACT_FLOWCORDIA_ROLLBACK_PROPOSAL_ACCEPTANCE",
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        application_commit_sha: plan.applicationCommitSha,
        current_proposal_id: proposalId,
        current_head_sha: proposalHeadSha,
        current_merge_commit_sha: mergeCommitSha,
        base_commit_sha: productionIdentity.rollbackBaseCommitSha,
        base_blob_sha: productionIdentity.rollbackBaseBlobSha,
        target_proposal_id: plan.rollbackTarget.proposalId,
        target_head_sha: plan.rollbackTarget.headSha,
        target_merge_commit_sha: plan.rollbackTarget.mergeCommitSha,
        reason: plan.rollbackTarget.reason,
      },
      (value) => requirePassed(value, "rollback_proposal")
    ).evidence.rollback;
    if (!rollback) {
      throw new FlowcordiaConnectedCampaignError(
        "EVIDENCE_INVALID",
        "Rollback proposal evidence is incomplete."
      );
    }
    const rollbackProposalId = text(
      rollback.rollbackProposalId,
      PUBLIC_ID,
      "rollback proposal ID",
      255
    );
    const rollbackHeadSha = text(
      rollback.rollbackProposalHeadSha,
      SHA,
      "rollback proposal head",
      40
    );

    const rollbackPromotion = runStage(
      context,
      "rollback_promotion",
      {
        confirmation: "PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL",
        studio_path: plan.studioPath,
        proposal_path: plan.proposalPath,
        workflow_id: plan.workflowId,
        proposal_id: rollbackProposalId,
        expected_head_sha: rollbackHeadSha,
        application_commit_sha: plan.applicationCommitSha,
        repository_owner: plan.repository.owner,
        repository_name: plan.repository.name,
        repository_branch: plan.repository.branch,
        merge_method: plan.mergeMethod,
      },
      (value) => requirePassed(value, "promotion")
    ).evidence;
    const rollbackMergeCommitSha = text(
      rollbackPromotion.promotion?.mergeCommitSha,
      SHA,
      "rollback merge commit",
      40
    );

    const rollbackProductionIdentity = runStage(
      context,
      "rollback_production_identity",
      {
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        proposal_id: rollbackProposalId,
        application_commit_sha: plan.applicationCommitSha,
        expected_head_sha: rollbackHeadSha,
        merge_commit_sha: rollbackMergeCommitSha,
        confirmation: "DISCOVER_EXACT_FLOWCORDIA_PRODUCTION_IDENTITY",
      },
      (value) => requirePassed(value, "production_identity")
    ).evidence.production;
    if (!rollbackProductionIdentity) {
      throw new FlowcordiaConnectedCampaignError(
        "EVIDENCE_INVALID",
        "Rollback production identity evidence is incomplete."
      );
    }

    runStage(
      context,
      "rollback_production",
      {
        mode: "rollback_production",
        studio_path: plan.studioPath,
        workflow_id: plan.workflowId,
        proposal_id: rollbackProposalId,
        application_commit_sha: plan.applicationCommitSha,
        expected_head_sha: rollbackHeadSha,
        merge_commit_sha: rollbackMergeCommitSha,
        deployment_version: rollbackProductionIdentity.deploymentVersion,
        closure_digest: rollbackProductionIdentity.closureDigest,
        closure_workflow_count: String(rollbackProductionIdentity.closureWorkflowCount),
        confirmation: "EXECUTE_EXACT_FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE",
      },
      (value) => requirePassed(value, "rollback_production")
    );

    const sourceRuns = sourceRunsFromReceipts(context.receipts);
    runStage(context, "assemble", {
      release_id: plan.releaseId,
      application_commit_sha: plan.applicationCommitSha,
      workflow_id: plan.workflowId,
      proposal_id: proposalId,
      source_runs_json: JSON.stringify(sourceRuns),
    });

    const receiptWithoutDigest = {
      schemaVersion: FLOWCORDIA_CONNECTED_CAMPAIGN_SCHEMA_VERSION,
      kind: "flowcordia-connected-release-campaign",
      result: "READY",
      releaseId: plan.releaseId,
      applicationCommitSha: plan.applicationCommitSha,
      workflowId: plan.workflowId,
      proposalId,
      proposalHeadSha,
      mergeCommitSha,
      rollbackProposalId,
      rollbackHeadSha,
      rollbackMergeCommitSha,
      startedAt,
      completedAt: new Date().toISOString(),
      stages: context.receipts,
      sourceRuns,
    };
    return {
      ...receiptWithoutDigest,
      receiptSha256: sha256(JSON.stringify(receiptWithoutDigest)),
    };
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const values = { planPath: null, outputPath: null, confirmation: null, repository: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) throw new FlowcordiaConnectedCampaignError("INVALID_ARGUMENTS", "Missing value.");
    if (argument === "--plan") values.planPath = resolve(value);
    else if (argument === "--output") values.outputPath = resolve(value);
    else if (argument === "--confirmation") values.confirmation = value;
    else if (argument === "--repository") values.repository = value;
    else throw new FlowcordiaConnectedCampaignError("INVALID_ARGUMENTS", "Unknown argument.");
    index += 1;
  }
  if (!values.planPath || !values.outputPath || !values.confirmation || !values.repository) {
    throw new FlowcordiaConnectedCampaignError("INVALID_ARGUMENTS", "Campaign arguments are incomplete.");
  }
  return values;
}

export function run(argv) {
  const options = parseArguments(argv);
  const plan = JSON.parse(readFileSync(options.planPath, "utf8"));
  const receipt = executeFlowcordiaConnectedCampaign({
    plan,
    confirmation: options.confirmation,
    repository: options.repository,
  });
  writeFileSync(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return receipt;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch {
    process.stderr.write("Flowcordia connected release campaign failed safely.\n");
    process.exitCode = 1;
  }
}
