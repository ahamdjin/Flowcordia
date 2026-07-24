import { createHash } from "node:crypto";
import {
  collectFlowcordiaSubflowWorkflowIds,
  deriveFlowcordiaCallableWorkflowContract,
  serializeWorkflow,
  validateFlowcordiaSubflowContractBindings,
  validateWorkflow,
  type JsonObject,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import { isValidProposalId } from "../branch/naming.js";

export const FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION = "0.1" as const;
export const MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS = 100;

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;

export interface FlowcordiaProposalClosureSource {
  workflow: WorkflowDefinition;
  baseBlobSha: string | null;
}

export interface FlowcordiaProposalClosureEntry {
  workflowId: string;
  baseBlobSha: string | null;
  workflowSha256: string;
  generatedArtifactSha256: string;
}

export interface FlowcordiaProposalClosureManifest {
  schemaVersion: typeof FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION;
  proposalId: string;
  rootWorkflowId: string;
  baseCommitSha: string;
  entries: readonly FlowcordiaProposalClosureEntry[];
  closureDigest: string;
}

export interface FlowcordiaResolvedProposalClosureMember {
  workflow: WorkflowDefinition;
  baseBlobSha: string | null;
  generatedSource: string;
  workflowSha256: string;
  generatedArtifactSha256: string;
}

export interface FlowcordiaResolvedProposalClosure {
  rootWorkflowId: string;
  members: readonly FlowcordiaResolvedProposalClosureMember[];
}

export type FlowcordiaProposalClosureResolution =
  | { success: true; closure: FlowcordiaResolvedProposalClosure }
  | { success: false; issues: readonly string[] };

export type FlowcordiaProposalClosureManifestParseResult =
  | { success: true; manifest: FlowcordiaProposalClosureManifest }
  | { success: false; message: string };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function foreignCodeReference(
  workflow: WorkflowDefinition,
  repositoryFullName: string
): string | undefined {
  const expected = repositoryFullName.toLowerCase();
  return workflow.nodes.find(
    (node) =>
      node.codeReference?.repository && node.codeReference.repository.toLowerCase() !== expected
  )?.id;
}

function invalidObjectKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  );
}

export function resolveFlowcordiaProposalClosure(input: {
  rootWorkflow: WorkflowDefinition;
  descendants: readonly FlowcordiaProposalClosureSource[];
  repositoryFullName: string;
}): FlowcordiaProposalClosureResolution {
  const issues: string[] = [];
  if (
    typeof input.repositoryFullName !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repositoryFullName)
  ) {
    issues.push("Proposal closure repository identity is invalid.");
  }
  if (input.descendants.length + 1 > MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS) {
    issues.push(
      `Proposal closure cannot exceed ${MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS} workflows.`
    );
  }

  const sources = [{ workflow: input.rootWorkflow, baseBlobSha: null }, ...input.descendants];
  const byId = new Map<string, FlowcordiaProposalClosureSource>();
  for (const source of sources) {
    const workflowId = source.workflow?.id;
    if (typeof workflowId !== "string" || !WORKFLOW_ID_PATTERN.test(workflowId)) {
      issues.push("Proposal closure contains a workflow with an invalid ID.");
      continue;
    }
    if (byId.has(workflowId)) {
      issues.push(`Proposal closure contains duplicate workflow "${workflowId}".`);
      continue;
    }
    if (
      source.baseBlobSha !== null &&
      (typeof source.baseBlobSha !== "string" || !OBJECT_ID_PATTERN.test(source.baseBlobSha))
    ) {
      issues.push(`Workflow "${workflowId}" has an invalid base blob identity.`);
    }
    const validation = validateWorkflow(source.workflow);
    if (!validation.success) {
      issues.push(
        `Workflow "${workflowId}" is invalid: ${validation.issues[0]?.message ?? "unknown issue"}`
      );
      continue;
    }
    const foreignNodeId = foreignCodeReference(validation.workflow, input.repositoryFullName);
    if (foreignNodeId) {
      issues.push(
        `Code node "${foreignNodeId}" in workflow "${workflowId}" references another repository.`
      );
    }
    byId.set(workflowId, { workflow: validation.workflow, baseBlobSha: source.baseBlobSha });
  }
  if (issues.length > 0) return { success: false, issues };

  const rootWorkflowId = input.rootWorkflow.id;
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reachable = new Set<string>();
  const visit = (workflowId: string, path: readonly string[]) => {
    if (visiting.has(workflowId)) {
      issues.push(
        `Proposal closure contains a workflow cycle: ${[...path, workflowId].join(" -> ")}.`
      );
      return;
    }
    if (visited.has(workflowId)) return;
    const source = byId.get(workflowId);
    if (!source) {
      issues.push(`Proposal closure is missing reachable workflow "${workflowId}".`);
      return;
    }
    visiting.add(workflowId);
    reachable.add(workflowId);
    for (const childId of collectFlowcordiaSubflowWorkflowIds(source.workflow)) {
      visit(childId, [...path, workflowId]);
    }
    visiting.delete(workflowId);
    visited.add(workflowId);
  };
  visit(rootWorkflowId, []);
  for (const workflowId of byId.keys()) {
    if (!reachable.has(workflowId)) {
      issues.push(`Proposal closure contains unreachable workflow "${workflowId}".`);
    }
  }
  if (issues.length > 0) return { success: false, issues };

  const storedContracts = [...byId.values()].map(({ workflow }) => {
    const derived = deriveFlowcordiaCallableWorkflowContract(workflow);
    return {
      workflowId: workflow.id,
      status: "VALID" as const,
      sourceCommitSha: "0".repeat(40),
      callableContractMetadataVersion: 1,
      callableContractState: derived.success ? ("READY" as const) : ("BLOCKED" as const),
      callableInputSchema: derived.success ? derived.contract.inputSchema : null,
      callableOutputSchema: derived.success ? derived.contract.outputSchema : null,
      callableFailureMessage: derived.success ? null : derived.issue.message,
    };
  });
  for (const { workflow } of byId.values()) {
    for (const issue of validateFlowcordiaSubflowContractBindings({
      workflow,
      sourceCommitSha: "0".repeat(40),
      entries: storedContracts,
    })) {
      issues.push(`Workflow "${workflow.id}" has an unsafe child binding: ${issue.message}`);
    }
  }
  if (issues.length > 0) return { success: false, issues };

  const members: FlowcordiaResolvedProposalClosureMember[] = [];
  for (const workflowId of [...reachable].sort()) {
    const source = byId.get(workflowId)!;
    const compilation = compileWorkflowToTriggerTask(source.workflow);
    if (!compilation.success) {
      issues.push(
        `Workflow "${workflowId}" cannot compile: ${compilation.issues[0]?.message ?? "unknown issue"}`
      );
      continue;
    }
    const serialized = serializeWorkflow(source.workflow);
    members.push({
      workflow: source.workflow,
      baseBlobSha: workflowId === rootWorkflowId ? null : source.baseBlobSha,
      generatedSource: compilation.artifact.source,
      workflowSha256: sha256(serialized),
      generatedArtifactSha256: sha256(compilation.artifact.source),
    });
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, closure: { rootWorkflowId, members } };
}

export function createFlowcordiaProposalClosureManifest(input: {
  proposalId: string;
  baseCommitSha: string;
  closure: FlowcordiaResolvedProposalClosure;
  rootBaseBlobSha: string | null;
}): FlowcordiaProposalClosureManifest {
  const entries = input.closure.members
    .map((member) => ({
      workflowId: member.workflow.id,
      baseBlobSha:
        member.workflow.id === input.closure.rootWorkflowId
          ? input.rootBaseBlobSha
          : member.baseBlobSha,
      workflowSha256: member.workflowSha256,
      generatedArtifactSha256: member.generatedArtifactSha256,
    }))
    .sort((left, right) => left.workflowId.localeCompare(right.workflowId));
  const identity = {
    schemaVersion: FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION,
    proposalId: input.proposalId,
    rootWorkflowId: input.closure.rootWorkflowId,
    baseCommitSha: input.baseCommitSha,
    entries,
  };
  return { ...identity, closureDigest: sha256(canonicalJson(identity)) };
}

export function serializeFlowcordiaProposalClosureManifest(
  manifest: FlowcordiaProposalClosureManifest
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseFlowcordiaProposalClosureManifest(
  sourceText: string
): FlowcordiaProposalClosureManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    return { success: false, message: "Proposal closure manifest is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { success: false, message: "Proposal closure manifest must be an object." };
  }
  const value = parsed as Record<string, unknown>;
  if (
    invalidObjectKeys(value, [
      "schemaVersion",
      "proposalId",
      "rootWorkflowId",
      "baseCommitSha",
      "entries",
      "closureDigest",
    ]) ||
    value.schemaVersion !== FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION ||
    typeof value.proposalId !== "string" ||
    !isValidProposalId(value.proposalId) ||
    typeof value.rootWorkflowId !== "string" ||
    typeof value.baseCommitSha !== "string" ||
    !OBJECT_ID_PATTERN.test(value.baseCommitSha) ||
    typeof value.closureDigest !== "string" ||
    !DIGEST_PATTERN.test(value.closureDigest) ||
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.entries.length > MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS
  ) {
    return { success: false, message: "Proposal closure manifest identity is invalid." };
  }
  const entries: FlowcordiaProposalClosureEntry[] = [];
  const workflowIds = new Set<string>();
  for (const candidate of value.entries) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { success: false, message: "Proposal closure manifest entry is invalid." };
    }
    const entry = candidate as Record<string, unknown>;
    if (
      invalidObjectKeys(entry, [
        "workflowId",
        "baseBlobSha",
        "workflowSha256",
        "generatedArtifactSha256",
      ]) ||
      typeof entry.workflowId !== "string" ||
      !WORKFLOW_ID_PATTERN.test(entry.workflowId) ||
      (entry.baseBlobSha !== null &&
        (typeof entry.baseBlobSha !== "string" || !OBJECT_ID_PATTERN.test(entry.baseBlobSha))) ||
      typeof entry.workflowSha256 !== "string" ||
      !DIGEST_PATTERN.test(entry.workflowSha256) ||
      typeof entry.generatedArtifactSha256 !== "string" ||
      !DIGEST_PATTERN.test(entry.generatedArtifactSha256) ||
      workflowIds.has(entry.workflowId)
    ) {
      return { success: false, message: "Proposal closure manifest entry identity is invalid." };
    }
    workflowIds.add(entry.workflowId);
    entries.push({
      workflowId: entry.workflowId,
      baseBlobSha: entry.baseBlobSha as string | null,
      workflowSha256: entry.workflowSha256,
      generatedArtifactSha256: entry.generatedArtifactSha256,
    });
  }
  if (
    entries.some(
      (entry, index) => index > 0 && entries[index - 1]!.workflowId >= entry.workflowId
    ) ||
    !workflowIds.has(value.rootWorkflowId)
  ) {
    return { success: false, message: "Proposal closure manifest entries are not canonical." };
  }
  const identity = {
    schemaVersion: FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION,
    proposalId: value.proposalId,
    rootWorkflowId: value.rootWorkflowId,
    baseCommitSha: value.baseCommitSha,
    entries,
  };
  if (sha256(canonicalJson(identity)) !== value.closureDigest) {
    return { success: false, message: "Proposal closure manifest digest is invalid." };
  }
  return {
    success: true,
    manifest: { ...identity, closureDigest: value.closureDigest },
  };
}

export function flowcordiaProposalClosureManifestPath(proposalId: string): string {
  return `.flowcordia/proposals/${proposalId}.json`;
}

export function flowcordiaProposalClosureManifestEquals(
  left: FlowcordiaProposalClosureManifest,
  right: FlowcordiaProposalClosureManifest
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function flowcordiaProposalClosureSummary(
  manifest: FlowcordiaProposalClosureManifest
): JsonObject {
  return {
    schemaVersion: manifest.schemaVersion,
    rootWorkflowId: manifest.rootWorkflowId,
    workflowCount: manifest.entries.length,
    closureDigest: manifest.closureDigest,
  };
}
