export interface FlowcordiaSlackActionCandidate {
  action: "slackapi/slack-github-action";
  version: "v4.0.0";
  sha: string;
  method: "auth.test";
}

export interface FlowcordiaSlackActionEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-slack-action-compatibility";
  state: "READY";
  applicationCommitSha: string;
  checkedAt: string;
  source: {
    workflow: string;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
    sourceCommitSha: string;
    protectedEnvironment: "dependabot-summary";
  };
  candidate: FlowcordiaSlackActionCandidate;
  runner: {
    os: string;
    arch: string;
  };
  verification: {
    authentication: "VERIFIED";
    mutation: "NONE";
  };
  evidenceSha256: string;
}

export interface CreateFlowcordiaSlackActionEvidenceInput {
  applicationCommitSha: string;
  runId: string;
  runAttempt: string | number;
  runnerOs: string;
  runnerArch: string;
  checkedAt: Date;
}

export const FLOWCORDIA_SLACK_ACTION_SCHEMA_VERSION: "0.1";
export const FLOWCORDIA_SLACK_ACTION_WORKFLOW: string;
export const FLOWCORDIA_SLACK_ACTION_CONFIRMATION: string;
export const FLOWCORDIA_SLACK_ACTION_ENVIRONMENT: "dependabot-summary";
export const FLOWCORDIA_SLACK_ACTION_CANDIDATE: FlowcordiaSlackActionCandidate;

export function flowcordiaSlackActionSha256(value: unknown): string;
export function createFlowcordiaSlackActionEvidence(
  input: CreateFlowcordiaSlackActionEvidenceInput
): FlowcordiaSlackActionEvidence;
export function parseFlowcordiaSlackActionEvidence(value: unknown): FlowcordiaSlackActionEvidence;
export function writeFlowcordiaSlackActionEvidence(
  path: string,
  evidence: FlowcordiaSlackActionEvidence
): Promise<void>;
