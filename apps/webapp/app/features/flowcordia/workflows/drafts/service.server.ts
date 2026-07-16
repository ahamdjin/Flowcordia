import { randomUUID } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import { applyWorkflowEdit, type WorkflowEditCommand } from "@flowcordia/workflow";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import { getWorkflowIndexEntry } from "../index/repository.server";
import type { WorkflowIndexEntryRecord } from "../index/types";
import { WorkflowDraftError } from "./errors";
import {
  createOrResumeWorkflowDraft,
  discardWorkflowDraft,
  getActiveWorkflowDraft,
  getActiveWorkflowDraftByPublicId,
  updateWorkflowDraft,
} from "./repository.server";
import type { WorkflowDraftRecord, WorkflowDraftScope } from "./types";
import { summarizeWorkflowEdit } from "./types";

function assertValidIndexEntry(entry: WorkflowIndexEntryRecord | null): WorkflowIndexEntryRecord {
  if (!entry || entry.status !== "VALID" || !entry.canonicalSha256) {
    throw new WorkflowDraftError(
      "draft_not_found",
      "A valid indexed workflow is required before Studio can create a draft."
    );
  }
  return entry;
}

function matchesBase(draft: WorkflowDraftRecord, entry: WorkflowIndexEntryRecord): boolean {
  return (
    entry.status === "VALID" &&
    entry.canonicalSha256 !== null &&
    draft.workflowId === entry.workflowId &&
    draft.workflowPath === entry.workflowPath &&
    draft.baseCommitSha === entry.sourceCommitSha &&
    draft.baseBlobSha === entry.sourceBlobSha &&
    draft.baseCanonicalSha256 === entry.canonicalSha256
  );
}

export function isWorkflowDraftStale(
  draft: WorkflowDraftRecord,
  entry: WorkflowIndexEntryRecord | null
): boolean {
  return !entry || !matchesBase(draft, entry);
}

async function readExactIndexedWorkflow(
  scope: WorkflowDraftScope,
  entry: WorkflowIndexEntryRecord
) {
  const { workflowStore } = await createWorkflowIndexGitHubGateway(scope);
  const result = await workflowStore.read({
    scope,
    workflowId: entry.workflowId,
    revision: entry.sourceCommitSha,
  });
  if (!result.success) {
    throw new WorkflowDraftError(
      result.error.retryable ? "draft_unavailable" : "stale_source",
      result.error.retryable
        ? "The indexed workflow source is temporarily unavailable."
        : "The indexed workflow source can no longer be proven against GitHub.",
      result.error.retryable
    );
  }
  if (
    result.value.source.commitSha !== entry.sourceCommitSha ||
    result.value.source.blobSha !== entry.sourceBlobSha ||
    result.value.source.path !== entry.workflowPath ||
    result.value.workflow.id !== entry.workflowId ||
    workflowSha256(result.value.workflow) !== entry.canonicalSha256
  ) {
    throw new WorkflowDraftError(
      "stale_source",
      "The indexed workflow no longer matches its exact GitHub source identity. Synchronize before editing."
    );
  }
  return result.value.workflow;
}

export async function getWorkflowDraftForStudio(input: {
  scope: WorkflowDraftScope;
  workflowId: string;
}): Promise<{ draft: WorkflowDraftRecord | null; stale: boolean }> {
  const [draft, entry] = await Promise.all([
    getActiveWorkflowDraft(input.scope, input.workflowId),
    getWorkflowIndexEntry(input.scope, input.workflowId),
  ]);
  return { draft, stale: draft ? isWorkflowDraftStale(draft, entry) : false };
}

export async function startWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  workflowId: string;
  actorId: string;
  correlationId?: string;
}): Promise<{ draft: WorkflowDraftRecord; created: boolean; stale: boolean }> {
  const correlationId = input.correlationId ?? randomUUID();
  const existing = await getActiveWorkflowDraft(input.scope, input.workflowId);
  if (existing) {
    const entry = await getWorkflowIndexEntry(input.scope, input.workflowId);
    const resumed = await createOrResumeWorkflowDraft({
      scope: input.scope,
      source: {
        workflowId: existing.workflowId,
        workflowPath: existing.workflowPath,
        baseCommitSha: existing.baseCommitSha,
        baseBlobSha: existing.baseBlobSha,
        baseCanonicalSha256: existing.baseCanonicalSha256,
      },
      workflow: existing.document,
      actorId: input.actorId,
      correlationId,
    });
    return { ...resumed, stale: isWorkflowDraftStale(resumed.draft, entry) };
  }

  const entry = assertValidIndexEntry(await getWorkflowIndexEntry(input.scope, input.workflowId));
  const workflow = await readExactIndexedWorkflow(input.scope, entry);
  const result = await createOrResumeWorkflowDraft({
    scope: input.scope,
    source: {
      workflowId: entry.workflowId,
      workflowPath: entry.workflowPath,
      baseCommitSha: entry.sourceCommitSha,
      baseBlobSha: entry.sourceBlobSha,
      baseCanonicalSha256: entry.canonicalSha256!,
    },
    workflow,
    actorId: input.actorId,
    correlationId,
  });
  return { ...result, stale: false };
}

export async function editWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  command: WorkflowEditCommand;
  actorId: string;
  correlationId?: string;
}): Promise<WorkflowDraftRecord> {
  const draft = await getActiveWorkflowDraftByPublicId(input.scope, input.publicId);
  if (!draft) {
    throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");
  }
  const entry = await getWorkflowIndexEntry(input.scope, draft.workflowId);
  if (!entry || !matchesBase(draft, entry)) {
    throw new WorkflowDraftError(
      "stale_source",
      "The repository workflow changed after this draft started. Discard the draft and start from the latest source."
    );
  }
  const edited = applyWorkflowEdit(draft.document, input.command);
  if (!edited.success) {
    throw new WorkflowDraftError("unsupported_edit", edited.message);
  }
  return updateWorkflowDraft({
    scope: input.scope,
    publicId: input.publicId,
    expectedVersion: input.expectedVersion,
    workflow: edited.workflow,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
    commandSummary: summarizeWorkflowEdit(input.command),
  });
}

export async function discardActiveWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  actorId: string;
  correlationId?: string;
}): Promise<WorkflowDraftRecord> {
  return discardWorkflowDraft({
    scope: input.scope,
    publicId: input.publicId,
    expectedVersion: input.expectedVersion,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
  });
}
