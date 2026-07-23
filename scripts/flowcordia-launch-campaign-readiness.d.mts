export const FLOWCORDIA_LAUNCH_CAMPAIGN_SCHEMA_VERSION: "0.1";
export const FLOWCORDIA_LAUNCH_CAMPAIGN_WORKFLOW: string;
export const FLOWCORDIA_LAUNCH_CAMPAIGN_CONFIRMATION: string;
export const FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES: readonly [
  "publication",
  "lifecycle",
  "provider",
  "alert",
  "connected",
  "promotion",
  "production",
  "webhook",
  "rollback",
  "dossier",
];
export type FlowcordiaLaunchCampaignStage = (typeof FLOWCORDIA_LAUNCH_CAMPAIGN_STAGES)[number];
export const FLOWCORDIA_LAUNCH_CAMPAIGN_ENVIRONMENTS: Record<
  FlowcordiaLaunchCampaignStage,
  string
>;

export interface FlowcordiaLaunchCampaignCheck {
  key: string;
  state: "READY" | "BLOCKED";
  message: string;
}

export interface FlowcordiaLaunchCampaignStageEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-launch-campaign-stage-readiness";
  state: "READY" | "BLOCKED";
  stage: FlowcordiaLaunchCampaignStage;
  applicationCommitSha: string;
  checkedAt: string;
  checks: FlowcordiaLaunchCampaignCheck[];
  source: {
    repository: string;
    workflowPath: string;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
    sourceCommitSha: string;
    job: FlowcordiaLaunchCampaignStage;
    environment: string;
    runner: "github-hosted" | "self-hosted";
  };
  evidenceSha256: string;
}

export interface FlowcordiaLaunchCampaignEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-launch-campaign-readiness";
  state: "READY" | "BLOCKED";
  applicationCommitSha: string;
  checkedAt: string;
  stages: Array<{
    stage: FlowcordiaLaunchCampaignStage;
    state: "READY" | "BLOCKED";
    environment: string;
    runner: "github-hosted" | "self-hosted";
    checkedAt: string;
    readyChecks: number;
    blockedChecks: number;
    evidenceSha256: string;
  }>;
  source: {
    repository: string;
    workflowPath: string;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
    sourceCommitSha: string;
  };
  evidenceSha256: string;
}

export function flowcordiaLaunchCampaignSha256(value: unknown): string;
export function createFlowcordiaLaunchCampaignStageEvidence(input: {
  stage: FlowcordiaLaunchCampaignStage;
  applicationCommitSha: string;
  environment: Record<string, string | undefined>;
  checkedAt?: Date;
}): Promise<FlowcordiaLaunchCampaignStageEvidence>;
export function parseFlowcordiaLaunchCampaignStageEvidence(
  value: unknown
): FlowcordiaLaunchCampaignStageEvidence;
export function assembleFlowcordiaLaunchCampaignEvidence(input: {
  applicationCommitSha: string;
  evidenceRoot: string;
  checkedAt?: Date;
}): Promise<FlowcordiaLaunchCampaignEvidence>;
