from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


path = "apps/webapp/app/features/flowcordia/acceptance/release-manifest.server.ts"

replace_once(
    path,
    '''import { createHash } from "node:crypto";\n''',
    '''import { createHash } from "node:crypto";\nimport {\n  validateFlowcordiaOperationalReleaseEvidence,\n  type FlowcordiaOperationalReleaseSummary,\n} from "./release-operational-evidence.server";\n''',
)

replace_once(
    path,
    '''export const FLOWCORDIA_RELEASE_EVIDENCE_STAGES = [\n  "preview",\n  "promotion",\n  "production",\n  "rollback_proposal",\n  "rollback_production",\n] as const;\n''',
    '''export const FLOWCORDIA_RELEASE_EVIDENCE_STAGES = [\n  "provider",\n  "alert",\n  "preview",\n  "promotion",\n  "production",\n  "rollback_proposal",\n  "rollback_production",\n] as const;\n''',
)

replace_once(
    path,
    '''export const FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS = {\n  preview: ".github/workflows/flowcordia-connected-acceptance.yml",\n  promotion: ".github/workflows/flowcordia-promotion-acceptance.yml",\n  production: ".github/workflows/flowcordia-production-acceptance.yml",\n  rollback_proposal: ".github/workflows/flowcordia-rollback-acceptance.yml",\n  rollback_production: ".github/workflows/flowcordia-production-acceptance.yml",\n} as const satisfies Record<FlowcordiaReleaseEvidenceStage, string>;\n''',
    '''export const FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS = {\n  provider: ".github/workflows/flowcordia-provider-readiness.yml",\n  alert: ".github/workflows/flowcordia-alert-readiness.yml",\n  preview: ".github/workflows/flowcordia-connected-acceptance.yml",\n  promotion: ".github/workflows/flowcordia-promotion-acceptance.yml",\n  production: ".github/workflows/flowcordia-production-acceptance.yml",\n  rollback_proposal: ".github/workflows/flowcordia-rollback-acceptance.yml",\n  rollback_production: ".github/workflows/flowcordia-production-acceptance.yml",\n} as const satisfies Record<FlowcordiaReleaseEvidenceStage, string>;\n''',
)

replace_once(
    path,
    '''export interface FlowcordiaReleaseManifest {\n  schemaVersion: "0.2";\n  releaseId: string;\n  result: "ACCEPTED";\n  applicationCommitSha: string;\n  workflowId: string;\n''',
    '''export interface FlowcordiaReleaseManifest {\n  schemaVersion: "0.3";\n  releaseId: string;\n  result: "ACCEPTED";\n  applicationCommitSha: string;\n  operations: FlowcordiaOperationalReleaseSummary;\n  workflowId: string;\n''',
)

replace_once(
    path,
    '''const FORBIDDEN_KEY =\n  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError|reason/i;\n''',
    '''const FORBIDDEN_KEY =\n  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|providerResponse|providerBody|providerError|stack|rawError|reason/i;\n''',
)

replace_once(
    path,
    '''export function flowcordiaReleaseArtifactName(input: {\n  stage: FlowcordiaReleaseEvidenceStage;\n  workflowId: string;\n  proposalId: string;\n  runId: string;\n}): string {\n  switch (input.stage) {\n    case "preview":\n''',
    '''export function flowcordiaReleaseArtifactName(input: {\n  stage: FlowcordiaReleaseEvidenceStage;\n  releaseId: string;\n  workflowId: string;\n  proposalId: string;\n  runId: string;\n}): string {\n  switch (input.stage) {\n    case "provider":\n      return `flowcordia-provider-readiness-${input.releaseId}-${input.runId}`;\n    case "alert":\n      return `flowcordia-alert-readiness-${input.releaseId}-${input.runId}`;\n    case "preview":\n''',
)

replace_once(
    path,
    '''  identity: { workflowId: string; proposalId: string }\n): FlowcordiaReleaseEvidenceSource {\n''',
    '''  identity: { releaseId: string; workflowId: string; proposalId: string }\n): FlowcordiaReleaseEvidenceSource {\n''',
)

replace_once(
    path,
    '''      "Release evidence requires exactly five source artifacts."\n''',
    '''      "Release evidence requires exactly seven source artifacts."\n''',
)

replace_once(
    path,
    '''      stage,\n      sourceByStage(input.sources, stage, {\n        workflowId,\n        proposalId,\n      })\n''',
    '''      stage,\n      sourceByStage(input.sources, stage, {\n        releaseId,\n        workflowId,\n        proposalId,\n      })\n''',
)

replace_once(
    path,
    '''  const previewSource = sourceRuns.get("preview")!;\n''',
    '''  const providerSource = sourceRuns.get("provider")!;\n  const alertSource = sourceRuns.get("alert")!;\n  const operationalEvidence = validateFlowcordiaOperationalReleaseEvidence({\n    providerEvidence: providerSource.evidence,\n    alertEvidence: alertSource.evidence,\n    releaseId,\n    applicationCommitSha,\n    assembledAt,\n  });\n\n  const previewSource = sourceRuns.get("preview")!;\n''',
)

replace_once(
    path,
    '''  const orderedSources = [\n    sourceIdentity(previewSource, previewTiming),\n    sourceIdentity(promotionSource, promotionTiming),\n    sourceIdentity(productionSource, productionTiming),\n    sourceIdentity(rollbackProposalSource, rollbackProposalTiming),\n    sourceIdentity(rollbackProductionSource, rollbackProductionTiming),\n  ];\n''',
    '''  const orderedSources = [\n    sourceIdentity(providerSource, operationalEvidence.timing.provider),\n    sourceIdentity(alertSource, operationalEvidence.timing.alert),\n    sourceIdentity(previewSource, previewTiming),\n    sourceIdentity(promotionSource, promotionTiming),\n    sourceIdentity(productionSource, productionTiming),\n    sourceIdentity(rollbackProposalSource, rollbackProposalTiming),\n    sourceIdentity(rollbackProductionSource, rollbackProductionTiming),\n  ];\n''',
)

replace_once(
    path,
    '''    schemaVersion: "0.2" as const,\n    releaseId,\n    result: "ACCEPTED" as const,\n    applicationCommitSha,\n    workflowId,\n''',
    '''    schemaVersion: "0.3" as const,\n    releaseId,\n    result: "ACCEPTED" as const,\n    applicationCommitSha,\n    operations: operationalEvidence.operations,\n    workflowId,\n''',
)
