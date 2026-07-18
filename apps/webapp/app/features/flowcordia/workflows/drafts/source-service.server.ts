import { createHash, randomUUID } from "node:crypto";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import {
  validateGitHubRepositorySourcePatches,
  type GitHubRepositorySourcePatch,
} from "@flowcordia/github-workflows";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import { getWorkflowIndexEntry } from "../index/repository.server";
import { WorkflowDraftError } from "./errors";
import { getActiveWorkflowDraftByPublicId } from "./repository.server";
import {
  createOrResumeWorkflowDraftSourceFile,
  getChangedWorkflowDraftSourceFiles,
  getWorkflowDraftSourceFileByPublicId,
  getWorkflowDraftSourceFiles,
  resetWorkflowDraftSourceFile,
  updateWorkflowDraftSourceFile,
} from "./source-repository.server";
import type { WorkflowDraftSourceFileRecord } from "./source-types";
import { isWorkflowDraftSourceChanged } from "./source-types";
import type { WorkflowDraftRecord, WorkflowDraftScope } from "./types";

function normalizedSourcePath(path: string): string {
  return path.replace(/^\.\//, "");
}

function assertDraftBase(draft: WorkflowDraftRecord, sourceCommitSha: string): void {
  if (draft.baseCommitSha !== sourceCommitSha) {
    throw new WorkflowDraftError(
      "stale_source",
      "The repository source no longer matches this workflow draft's exact base revision."
    );
  }
}

async function getCurrentDraft(input: {
  scope: WorkflowDraftScope;
  draftPublicId: string;
}): Promise<WorkflowDraftRecord> {
  const draft = await getActiveWorkflowDraftByPublicId(input.scope, input.draftPublicId);
  if (!draft) {
    throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");
  }
  const entry = await getWorkflowIndexEntry(input.scope, draft.workflowId);
  if (
    !entry ||
    entry.status !== "VALID" ||
    entry.sourceCommitSha !== draft.baseCommitSha ||
    entry.sourceBlobSha !== draft.baseBlobSha ||
    entry.canonicalSha256 !== draft.baseCanonicalSha256
  ) {
    throw new WorkflowDraftError(
      "stale_source",
      "The repository workflow changed after this draft started. Restart from the latest source."
    );
  }
  return draft;
}

export async function startWorkflowDraftSource(input: {
  scope: WorkflowDraftScope;
  draftPublicId: string;
  nodeId: string;
  actorId: string;
  correlationId?: string;
}): Promise<{ source: WorkflowDraftSourceFileRecord; created: boolean }> {
  const draft = await getCurrentDraft(input);
  const node = draft.document.nodes.find((candidate) => candidate.id === input.nodeId);
  const functionId = node?.configuration?.functionId;
  if (
    !node ||
    node.operation !== "code.task" ||
    !node.codeReference ||
    typeof functionId !== "string"
  ) {
    throw new WorkflowDraftError(
      "invalid_input",
      "The selected node is not a repository-owned typed function."
    );
  }

  const { functionCatalog, sourcePatchStore } = await createWorkflowIndexGitHubGateway(input.scope);
  const catalog = await functionCatalog.read({ scope: input.scope, revision: draft.baseCommitSha });
  if (!catalog.success) {
    throw new WorkflowDraftError(
      catalog.error.retryable ? "draft_unavailable" : "unsupported_edit",
      catalog.error.catalogIssues?.[0]?.message ?? catalog.error.message,
      catalog.error.retryable
    );
  }
  assertDraftBase(draft, catalog.value.source.commitSha);
  const definition = catalog.value.catalog.functions.find(
    (candidate) => candidate.id === functionId
  );
  if (!definition) {
    throw new WorkflowDraftError(
      "unsupported_edit",
      `Function "${functionId}" is not available at this draft's exact repository revision.`
    );
  }
  const sourcePath = normalizedSourcePath(definition.codeReference.path);
  if (
    normalizedSourcePath(node.codeReference.path) !== sourcePath ||
    node.codeReference.exportName !== definition.codeReference.exportName
  ) {
    throw new WorkflowDraftError(
      "stale_source",
      "The workflow function reference no longer matches the exact repository catalog."
    );
  }

  const source = await sourcePatchStore.read({
    scope: input.scope,
    path: sourcePath,
    revision: draft.baseCommitSha,
  });
  if (!source.success) {
    throw new WorkflowDraftError(
      source.error.retryable ? "draft_unavailable" : "unsupported_edit",
      source.error.message,
      source.error.retryable
    );
  }
  if (
    source.value.commitSha !== draft.baseCommitSha ||
    source.value.path !== sourcePath ||
    source.value.requestedRevision !== draft.baseCommitSha
  ) {
    throw new WorkflowDraftError(
      "stale_source",
      "The function source could not be proven at the workflow draft's exact revision."
    );
  }

  return createOrResumeWorkflowDraftSourceFile({
    scope: input.scope,
    draft,
    identity: {
      functionId,
      sourcePath,
      exportName: definition.codeReference.exportName,
      baseCommitSha: source.value.commitSha,
      baseBlobSha: source.value.blobSha,
    },
    sourceText: source.value.sourceText,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
  });
}

export async function editWorkflowDraftSource(input: {
  scope: WorkflowDraftScope;
  sourcePublicId: string;
  expectedVersion: bigint;
  sourceText: string;
  actorId: string;
  correlationId?: string;
}): Promise<WorkflowDraftSourceFileRecord> {
  const current = await getWorkflowDraftSourceFileByPublicId(input.scope, input.sourcePublicId);
  if (!current) {
    throw new WorkflowDraftError(
      "draft_not_found",
      "The active repository source buffer was not found."
    );
  }
  const validation = validateGitHubRepositorySourcePatches([
    {
      path: current.sourcePath,
      sourceText: input.sourceText,
      expectedBlobSha: current.baseBlobSha,
    },
  ]);
  if (!validation.success) {
    throw new WorkflowDraftError(
      "invalid_input",
      validation.issues[0]?.message ?? "The repository source edit is invalid."
    );
  }
  const patch = validation.patches[0];
  if (!patch) {
    throw new WorkflowDraftError("invalid_input", "The repository source edit is missing.");
  }
  return updateWorkflowDraftSourceFile({
    scope: input.scope,
    publicId: input.sourcePublicId,
    expectedVersion: input.expectedVersion,
    sourceText: patch.sourceText,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
  });
}

export async function resetWorkflowDraftSource(input: {
  scope: WorkflowDraftScope;
  sourcePublicId: string;
  expectedVersion: bigint;
  actorId: string;
  correlationId?: string;
}): Promise<WorkflowDraftSourceFileRecord> {
  return resetWorkflowDraftSourceFile({
    scope: input.scope,
    publicId: input.sourcePublicId,
    expectedVersion: input.expectedVersion,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
  });
}

export async function getWorkflowDraftSourcesForStudio(input: {
  scope: WorkflowDraftScope;
  draftPublicId: string;
}): Promise<WorkflowDraftSourceFileRecord[]> {
  await getCurrentDraft(input);
  return getWorkflowDraftSourceFiles(input.scope, input.draftPublicId);
}

export async function getPublishableWorkflowDraftSourcePatches(input: {
  scope: WorkflowDraftScope;
  draftPublicId: string;
}): Promise<{
  sources: WorkflowDraftSourceFileRecord[];
  patches: GitHubRepositorySourcePatch[];
  digest: string;
}> {
  const draft = await getCurrentDraft(input);
  const sources = await getChangedWorkflowDraftSourceFiles(input.scope, input.draftPublicId);
  for (const source of sources) {
    if (source.draftId !== draft.id || source.baseCommitSha !== draft.baseCommitSha) {
      throw new WorkflowDraftError(
        "stale_source",
        "A repository source buffer is not bound to this workflow draft's exact base revision."
      );
    }
    if (!isWorkflowDraftSourceChanged(source)) {
      throw new WorkflowDraftError(
        "corrupt_draft",
        "An unchanged repository source was projected as a publishable change."
      );
    }
  }
  const validation = validateGitHubRepositorySourcePatches(
    sources.map((source) => ({
      path: source.sourcePath,
      sourceText: source.sourceText,
      expectedBlobSha: source.baseBlobSha,
    }))
  );
  if (!validation.success) {
    throw new WorkflowDraftError(
      "corrupt_draft",
      validation.issues[0]?.message ?? "The repository source buffers cannot be published safely."
    );
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        validation.patches.map((patch) => ({
          path: patch.path,
          expectedBlobSha: patch.expectedBlobSha,
          sourceSha256: createHash("sha256").update(patch.sourceText, "utf8").digest("hex"),
        }))
      ),
      "utf8"
    )
    .digest("hex");
  return { sources, patches: [...validation.patches], digest };
}

export async function getPublishableWorkflowDraftWithSourceChanges(input: {
  scope: WorkflowDraftScope;
  draftPublicId: string;
  expectedVersion: bigint;
  sourcePatchCount: number;
}): Promise<WorkflowDraftRecord> {
  const draft = await getCurrentDraft(input);
  if (draft.version !== input.expectedVersion) {
    throw new WorkflowDraftError(
      "draft_conflict",
      "The workflow draft changed in another session. Refresh before publishing it."
    );
  }
  if (input.sourcePatchCount === 0 && draft.documentSha256 === draft.baseCanonicalSha256) {
    throw new WorkflowDraftError(
      "no_changes",
      "This draft has no workflow or repository source changes to publish."
    );
  }
  const compilation = compileWorkflowToTriggerTask(draft.document);
  if (!compilation.success) {
    throw new WorkflowDraftError(
      "compilation_failed",
      compilation.issues[0]?.message ?? "The draft cannot be compiled safely yet."
    );
  }
  return draft;
}
