from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one marker in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"Missing start marker in {path}: {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"Missing end marker in {path}: {end!r}")
    file.write_text(text[:start_index] + replacement + text[end_index:])


types = "apps/webapp/app/features/flowcordia/workflows/drafts/types.ts"
replace_once(
    types,
    '''  version: bigint;\n  createdByActorId: string;\n''',
    '''  version: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;\n  createdByActorId: string;\n''',
)
replace_once(
    types,
    '''    | "workflow_draft.edited"\n    | "workflow_draft.discarded";\n''',
    '''    | "workflow_draft.edited"\n    | "workflow_draft.undone"\n    | "workflow_draft.redone"\n    | "workflow_draft.discarded";\n''',
)

repository = "apps/webapp/app/features/flowcordia/workflows/drafts/repository.server.ts"
replace_once(
    repository,
    '''import { WorkflowDraftError } from "./errors";\n''',
    '''import { WorkflowDraftError } from "./errors";\nimport {\n  nextWorkflowDraftEditHistory,\n  targetWorkflowDraftHistoryRevision,\n  type WorkflowDraftHistoryDirection,\n} from "./history";\n''',
)
replace_once(
    repository,
    '''  version: bigint;\n  createdByActorId: string;\n''',
    '''  version: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;\n  createdByActorId: string;\n''',
)
replace_once(
    repository,
    '''    "version",\n    "created_by_actor_id" AS "createdByActorId",\n''',
    '''    "version",\n    "history_cursor" AS "historyCursor",\n    "history_max" AS "historyMax",\n    "created_by_actor_id" AS "createdByActorId",\n''',
)
replace_once(
    repository,
    '''    version: row.version,\n    createdByActorId: row.createdByActorId,\n''',
    '''    version: row.version,\n    historyCursor: row.historyCursor,\n    historyMax: row.historyMax,\n    createdByActorId: row.createdByActorId,\n''',
)
replace_once(
    repository,
    '''}\n\nasync function appendAudit(\n''',
    '''}\n\ninterface DraftRevisionRow {\n  id: string;\n  draftId: string;\n  revision: bigint;\n  draftVersion: bigint;\n  documentJson: unknown;\n  documentSha256: string;\n  commandSummary: unknown;\n  createdByActorId: string;\n  createdAt: Date;\n}\n\nfunction decodeRevision(row: DraftRevisionRow): WorkflowDefinition {\n  const validated = validateWorkflow(row.documentJson);\n  if (!validated.success) {\n    throw new WorkflowDraftError(\n      "corrupt_draft",\n      "A stored workflow draft revision no longer satisfies the canonical workflow contract."\n    );\n  }\n  if (workflowSha256(validated.workflow) !== row.documentSha256) {\n    throw new WorkflowDraftError(\n      "corrupt_draft",\n      "A stored workflow draft revision does not match its integrity hash."\n    );\n  }\n  return validated.workflow;\n}\n\nasync function selectActiveForUpdate(\n  tx: Prisma.TransactionClient,\n  scope: WorkflowDraftScope,\n  publicId: string\n): Promise<WorkflowDraftRecord | null> {\n  const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`\n    SELECT ${draftColumns()}\n    FROM "flowcordia"."workflow_draft"\n    WHERE ${scopePredicate(scope)}\n      AND "public_id" = ${publicId}\n      AND "status" = 'ACTIVE'\n    LIMIT 1\n    FOR UPDATE\n  `);\n  return rows[0] ? decodeDraft(rows[0]) : null;\n}\n\nasync function insertRevision(\n  tx: Prisma.TransactionClient,\n  input: {\n    draftId: string;\n    revision: bigint;\n    draftVersion: bigint;\n    workflow: WorkflowDefinition;\n    commandSummary: Record<string, unknown>;\n    actorId: string;\n    createdAt: Date;\n  }\n): Promise<void> {\n  const documentSha256 = workflowSha256(input.workflow);\n  await tx.$executeRaw(Prisma.sql`\n    INSERT INTO "flowcordia"."workflow_draft_revision" (\n      "id", "draft_id", "revision", "draft_version", "document_json",\n      "document_sha256", "command_summary", "created_by_actor_id", "created_at"\n    ) VALUES (\n      ${randomUUID()}, ${input.draftId}, ${input.revision}, ${input.draftVersion},\n      CAST(${JSON.stringify(input.workflow)} AS JSONB), ${documentSha256},\n      CAST(${JSON.stringify(input.commandSummary)} AS JSONB), ${input.actorId}, ${input.createdAt}\n    )\n  `);\n}\n\nasync function selectRevision(\n  tx: Prisma.TransactionClient,\n  draftId: string,\n  revision: bigint\n): Promise<WorkflowDefinition> {\n  const rows = await tx.$queryRaw<DraftRevisionRow[]>(Prisma.sql`\n    SELECT\n      "id",\n      "draft_id" AS "draftId",\n      "revision",\n      "draft_version" AS "draftVersion",\n      "document_json" AS "documentJson",\n      "document_sha256" AS "documentSha256",\n      "command_summary" AS "commandSummary",\n      "created_by_actor_id" AS "createdByActorId",\n      "created_at" AS "createdAt"\n    FROM "flowcordia"."workflow_draft_revision"\n    WHERE "draft_id" = ${draftId}\n      AND "revision" = ${revision}\n    LIMIT 1\n  `);\n  if (!rows[0]) {\n    throw new WorkflowDraftError(\n      "corrupt_draft",\n      "The requested workflow draft revision is missing."\n    );\n  }\n  return decodeRevision(rows[0]);\n}\n\nfunction assertExpectedVersion(\n  draft: WorkflowDraftRecord | null,\n  expectedVersion: bigint\n): WorkflowDraftRecord {\n  if (!draft) {\n    throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");\n  }\n  if (draft.version !== expectedVersion) {\n    throw new WorkflowDraftError(\n      "draft_conflict",\n      "The workflow draft changed in another session. Refresh before applying this operation."\n    );\n  }\n  return draft;\n}\n\nasync function appendAudit(\n''',
)
replace_once(
    repository,
    '''    await appendAudit(tx, input.scope, created.id, {\n''',
    '''    if (rows[0]) {\n      await insertRevision(tx, {\n        draftId: created.id,\n        revision: 1n,\n        draftVersion: created.version,\n        workflow: created.document,\n        commandSummary: { command: "history.start" },\n        actorId: input.actorId,\n        createdAt: now,\n      });\n    }\n\n    await appendAudit(tx, input.scope, created.id, {\n''',
)
replace_between(
    repository,
    "export async function updateWorkflowDraft(input: {",
    "export async function discardWorkflowDraft(input: {",
    '''export async function updateWorkflowDraft(input: {\n  scope: WorkflowDraftScope;\n  publicId: string;\n  expectedVersion: bigint;\n  workflow: WorkflowDefinition;\n  actorId: string;\n  correlationId: string;\n  commandSummary: Record<string, unknown>;\n  now?: Date;\n}): Promise<WorkflowDraftRecord> {\n  const now = input.now ?? new Date();\n  const documentSha256 = workflowSha256(input.workflow);\n  return prisma.$transaction(async (tx) => {\n    const current = assertExpectedVersion(\n      await selectActiveForUpdate(tx, input.scope, input.publicId),\n      input.expectedVersion\n    );\n    const history = nextWorkflowDraftEditHistory({\n      cursor: current.historyCursor,\n      max: current.historyMax,\n    });\n\n    await tx.$executeRaw(Prisma.sql`\n      DELETE FROM "flowcordia"."workflow_draft_revision"\n      WHERE "draft_id" = ${current.id}\n        AND "revision" > ${history.pruneAfter}\n    `);\n\n    const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`\n      UPDATE "flowcordia"."workflow_draft"\n      SET\n        "document_json" = CAST(${JSON.stringify(input.workflow)} AS JSONB),\n        "document_sha256" = ${documentSha256},\n        "version" = "version" + 1,\n        "history_cursor" = ${history.cursor},\n        "history_max" = ${history.max},\n        "updated_by_actor_id" = ${input.actorId},\n        "updated_at" = ${now}\n      WHERE ${scopePredicate(input.scope)}\n        AND "id" = ${current.id}\n        AND "status" = 'ACTIVE'\n        AND "version" = ${input.expectedVersion}\n      RETURNING ${draftColumns()}\n    `);\n    if (!rows[0]) {\n      throw new WorkflowDraftError(\n        "draft_conflict",\n        "The workflow draft changed in another session. Refresh before applying this edit."\n      );\n    }\n    const updated = decodeDraft(rows[0]);\n    await insertRevision(tx, {\n      draftId: updated.id,\n      revision: history.cursor,\n      draftVersion: updated.version,\n      workflow: updated.document,\n      commandSummary: input.commandSummary,\n      actorId: input.actorId,\n      createdAt: now,\n    });\n    await appendAudit(tx, input.scope, updated.id, {\n      eventType: "workflow_draft.edited",\n      actorId: input.actorId,\n      correlationId: input.correlationId,\n      dedupeKey: `workflow-draft:${updated.publicId}:edit:${input.correlationId}`,\n      payload: {\n        publicId: updated.publicId,\n        workflowId: updated.workflowId,\n        previousVersion: input.expectedVersion.toString(),\n        version: updated.version.toString(),\n        historyRevision: updated.historyCursor.toString(),\n        documentSha256: updated.documentSha256,\n        ...input.commandSummary,\n      },\n      occurredAt: now,\n    });\n    return updated;\n  });\n}\n\nexport async function restoreWorkflowDraftHistory(input: {\n  scope: WorkflowDraftScope;\n  publicId: string;\n  expectedVersion: bigint;\n  direction: WorkflowDraftHistoryDirection;\n  actorId: string;\n  correlationId: string;\n  now?: Date;\n}): Promise<WorkflowDraftRecord> {\n  const now = input.now ?? new Date();\n  return prisma.$transaction(async (tx) => {\n    const current = assertExpectedVersion(\n      await selectActiveForUpdate(tx, input.scope, input.publicId),\n      input.expectedVersion\n    );\n    const targetRevision = targetWorkflowDraftHistoryRevision({\n      state: { cursor: current.historyCursor, max: current.historyMax },\n      direction: input.direction,\n    });\n    if (targetRevision === null) {\n      throw new WorkflowDraftError(\n        "no_changes",\n        input.direction === "undo"\n          ? "There is no earlier visual workflow revision to restore."\n          : "There is no later visual workflow revision to restore."\n      );\n    }\n    const workflow = await selectRevision(tx, current.id, targetRevision);\n    const documentSha256 = workflowSha256(workflow);\n    const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`\n      UPDATE "flowcordia"."workflow_draft"\n      SET\n        "document_json" = CAST(${JSON.stringify(workflow)} AS JSONB),\n        "document_sha256" = ${documentSha256},\n        "version" = "version" + 1,\n        "history_cursor" = ${targetRevision},\n        "updated_by_actor_id" = ${input.actorId},\n        "updated_at" = ${now}\n      WHERE ${scopePredicate(input.scope)}\n        AND "id" = ${current.id}\n        AND "status" = 'ACTIVE'\n        AND "version" = ${input.expectedVersion}\n      RETURNING ${draftColumns()}\n    `);\n    if (!rows[0]) {\n      throw new WorkflowDraftError(\n        "draft_conflict",\n        "The workflow draft changed in another session. Refresh before restoring history."\n      );\n    }\n    const updated = decodeDraft(rows[0]);\n    await appendAudit(tx, input.scope, updated.id, {\n      eventType:\n        input.direction === "undo" ? "workflow_draft.undone" : "workflow_draft.redone",\n      actorId: input.actorId,\n      correlationId: input.correlationId,\n      dedupeKey: `workflow-draft:${updated.publicId}:${input.direction}:${input.correlationId}`,\n      payload: {\n        publicId: updated.publicId,\n        workflowId: updated.workflowId,\n        previousVersion: input.expectedVersion.toString(),\n        version: updated.version.toString(),\n        previousHistoryRevision: current.historyCursor.toString(),\n        historyRevision: updated.historyCursor.toString(),\n        documentSha256: updated.documentSha256,\n      },\n      occurredAt: now,\n    });\n    return updated;\n  });\n}\n\n''',
)

service = "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts"
replace_once(
    service,
    '''  getActiveWorkflowDraftByPublicId,\n  updateWorkflowDraft,\n''',
    '''  getActiveWorkflowDraftByPublicId,\n  restoreWorkflowDraftHistory as restoreWorkflowDraftHistoryRecord,\n  updateWorkflowDraft,\n''',
)
replace_once(
    service,
    '''import type { WorkflowDraftEditCommand, WorkflowDraftRecord, WorkflowDraftScope } from "./types";\n''',
    '''import type { WorkflowDraftHistoryDirection } from "./history";\nimport type { WorkflowDraftEditCommand, WorkflowDraftRecord, WorkflowDraftScope } from "./types";\n''',
)
replace_once(
    service,
    '''}\n\nasync function assertWorkflowDocumentDependencies(\n''',
    '''}\n\nexport async function restoreWorkflowDraftHistory(input: {\n  scope: WorkflowDraftScope;\n  publicId: string;\n  expectedVersion: bigint;\n  direction: WorkflowDraftHistoryDirection;\n  actorId: string;\n  correlationId?: string;\n}): Promise<WorkflowDraftRecord> {\n  const draft = await getActiveWorkflowDraftByPublicId(input.scope, input.publicId);\n  if (!draft) {\n    throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");\n  }\n  const entry = await getWorkflowIndexEntry(input.scope, draft.workflowId);\n  if (!entry || !matchesBase(draft, entry)) {\n    throw new WorkflowDraftError(\n      "stale_source",\n      "The repository workflow changed after this draft started. Discard the draft and start from the latest source."\n    );\n  }\n  return restoreWorkflowDraftHistoryRecord({\n    scope: input.scope,\n    publicId: input.publicId,\n    expectedVersion: input.expectedVersion,\n    direction: input.direction,\n    actorId: input.actorId,\n    correlationId: input.correlationId ?? randomUUID(),\n  });\n}\n\nasync function assertWorkflowDocumentDependencies(\n''',
)

commands = "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts"
replace_once(
    commands,
    '''import {\n  WorkflowDuplicateSubgraphCommand,\n  WorkflowMoveNodesCommand,\n} from "./selection-command-contract";\n''',
    '''import {\n  WorkflowDuplicateSubgraphCommand,\n  WorkflowMoveNodesCommand,\n} from "./selection-command-contract";\nimport { WorkflowDraftRedoCommand, WorkflowDraftUndoCommand } from "./history-command-contract";\n''',
)
replace_once(
    commands,
    '''  editWorkflowDraft,\n  previewWorkflowDraft,\n  startWorkflowDraft,\n''',
    '''  editWorkflowDraft,\n  previewWorkflowDraft,\n  restoreWorkflowDraftHistory,\n  startWorkflowDraft,\n''',
)
replace_once(
    commands,
    '''const DraftCommand = z.discriminatedUnion("operation", [\n''',
    '''export const WorkflowDraftCommand = z.discriminatedUnion("operation", [\n''',
)
replace_once(
    commands,
    '''  z\n    .object({\n      operation: z.literal("discard"),\n''',
    '''  WorkflowDraftUndoCommand,\n  WorkflowDraftRedoCommand,\n  z\n    .object({\n      operation: z.literal("discard"),\n''',
)
replace_once(commands, "  const parsed = DraftCommand.safeParse(body);\n", "  const parsed = WorkflowDraftCommand.safeParse(body);\n")
replace_once(
    commands,
    '''function presentSource(source: WorkflowDraftSourceFileRecord) {\n''',
    '''function presentDraftMutation(draft: WorkflowDraftRecord, stale = false) {\n  return {\n    publicId: draft.publicId,\n    version: draft.version.toString(),\n    documentSha256: draft.documentSha256,\n    stale,\n    canUndo: draft.historyCursor > 1n,\n    canRedo: draft.historyCursor < draft.historyMax,\n  };\n}\n\nfunction presentSource(source: WorkflowDraftSourceFileRecord) {\n''',
)
replace_once(
    commands,
    '''import type { WorkflowDraftEditCommand } from "./types";\n''',
    '''import type { WorkflowDraftEditCommand, WorkflowDraftRecord } from "./types";\n''',
)
replace_once(
    commands,
    '''        draft: {\n          publicId: result.draft.publicId,\n          version: result.draft.version.toString(),\n          documentSha256: result.draft.documentSha256,\n          stale: result.stale,\n        },\n''',
    '''        draft: presentDraftMutation(result.draft, result.stale),\n''',
)
replace_once(
    commands,
    '''        draft: {\n          publicId: draft.publicId,\n          version: draft.version.toString(),\n          documentSha256: draft.documentSha256,\n          stale: false,\n        },\n      });\n    }\n\n    if (command.operation === "test") {\n''',
    '''        draft: presentDraftMutation(draft),\n      });\n    }\n\n    if (command.operation === "undo" || command.operation === "redo") {\n      const draft = await restoreWorkflowDraftHistory({\n        scope,\n        publicId: command.draftId,\n        expectedVersion: BigInt(command.expectedVersion),\n        direction: command.operation,\n        actorId: input.userId,\n      });\n      return json({\n        ok: true,\n        status: command.operation === "undo" ? "undone" : "redone",\n        draft: presentDraftMutation(draft),\n      });\n    }\n\n    if (command.operation === "test") {\n''',
)
replace_once(
    commands,
    '''      draft: {\n        publicId: draft.publicId,\n        version: draft.version.toString(),\n        documentSha256: draft.documentSha256,\n        stale: false,\n      },\n''',
    '''      draft: presentDraftMutation(draft),\n''',
)

presentation = "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts"
replace_once(
    presentation,
    '''  updatedAt: string;\n  stale: boolean;\n''',
    '''  updatedAt: string;\n  stale: boolean;\n  canUndo: boolean;\n  canRedo: boolean;\n''',
)
replace_once(
    presentation,
    '''    updatedAt: draft.updatedAt.toISOString(),\n    stale,\n''',
    '''    updatedAt: draft.updatedAt.toISOString(),\n    stale,\n    canUndo: draft.historyCursor > 1n,\n    canRedo: draft.historyCursor < draft.historyMax,\n''',
)

shortcuts = "apps/webapp/app/features/flowcordia/workflows/studio/history-shortcuts.ts"
replace_once(
    shortcuts,
    '''export function isWorkflowStudioHistoryTextEntry(target: EventTarget | null): boolean {\n  if (!(target instanceof HTMLElement)) return false;\n''',
    '''export function isWorkflowStudioHistoryTextEntry(target: EventTarget | null): boolean {\n  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;\n''',
)

header = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioHeader.tsx"
replace_once(
    header,
    '''import { CircleDotIcon, GitBranchIcon, GitPullRequestIcon, ShieldCheckIcon } from "lucide-react";\n''',
    '''import {\n  CircleDotIcon,\n  GitBranchIcon,\n  GitPullRequestIcon,\n  Redo2Icon,\n  ShieldCheckIcon,\n  Undo2Icon,\n} from "lucide-react";\n''',
)
replace_once(
    header,
    '''  previewState,\n  proposalPath,\n}: {\n''',
    '''  previewState,\n  proposalPath,\n  canUndo,\n  canRedo,\n  historyBusy,\n  onUndo,\n  onRedo,\n}: {\n''',
)
replace_once(
    header,
    '''  previewState: FlowcordiaPreviewProjection["state"];\n  proposalPath: string;\n}) {\n''',
    '''  previewState: FlowcordiaPreviewProjection["state"];\n  proposalPath: string;\n  canUndo: boolean;\n  canRedo: boolean;\n  historyBusy: boolean;\n  onUndo: () => void;\n  onRedo: () => void;\n}) {\n''',
)
replace_once(
    header,
    '''      <div className="flex shrink-0 items-center gap-2">\n        <span\n''',
    '''      <div className="flex shrink-0 items-center gap-2">\n        <div className="flex items-center rounded-md border border-white/10 bg-white/[0.035] p-0.5">\n          <button\n            type="button"\n            data-testid="flowcordia-studio-undo"\n            aria-label="Undo last visual workflow edit"\n            title="Undo (Ctrl/Command+Z)"\n            disabled={!canUndo || historyBusy}\n            className="grid size-8 place-items-center rounded text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-700 focus-custom"\n            onClick={onUndo}\n          >\n            <Undo2Icon className="size-3.5" aria-hidden="true" />\n          </button>\n          <button\n            type="button"\n            data-testid="flowcordia-studio-redo"\n            aria-label="Redo last visual workflow edit"\n            title="Redo (Ctrl/Command+Shift+Z or Ctrl+Y)"\n            disabled={!canRedo || historyBusy}\n            className="grid size-8 place-items-center rounded text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-700 focus-custom"\n            onClick={onRedo}\n          >\n            <Redo2Icon className="size-3.5" aria-hidden="true" />\n          </button>\n        </div>\n        <span\n''',
)

studio = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
replace_once(
    studio,
    '''import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";\n''',
    '''import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";\n''',
)
replace_once(
    studio,
    '''import { WorkflowStudioNodeConfigurationEditor } from "./WorkflowStudioNodeConfigurationEditor";\n''',
    '''import { WorkflowStudioNodeConfigurationEditor } from "./WorkflowStudioNodeConfigurationEditor";\nimport {\n  isWorkflowStudioHistoryTextEntry,\n  resolveWorkflowStudioHistoryShortcut,\n} from "./history-shortcuts";\n''',
)
replace_once(
    studio,
    '''  status?: "started" | "resumed" | "saved" | "discarded" | "published";\n''',
    '''  status?:\n    | "started"\n    | "resumed"\n    | "saved"\n    | "undone"\n    | "redone"\n    | "discarded"\n    | "published";\n''',
)
replace_once(
    studio,
    '''    stale: boolean;\n  };\n''',
    '''    stale: boolean;\n    canUndo: boolean;\n    canRedo: boolean;\n  };\n''',
)
replace_between(
    studio,
    "  const submitDraft = (",
    "  const submitEdit = (command: WorkflowStudioEditCommand) => {",
    '''  const submitDraft = useCallback(\n    (\n      payload:\n        | { operation: "start"; workflowId: string }\n        | {\n            operation: "edit";\n            draftId: string;\n            expectedVersion: string;\n            command: WorkflowStudioEditCommand;\n          }\n        | { operation: "undo" | "redo"; draftId: string; expectedVersion: string }\n        | { operation: "discard"; draftId: string; expectedVersion: string }\n        | { operation: "publish"; draftId: string; expectedVersion: string }\n    ) => {\n      if (!canWrite || draftBusy) return;\n      draftSubmitted.current = true;\n      draftFetcher.submit(payload, {\n        method: "POST",\n        action: draftCommandPath,\n        encType: "application/json",\n      });\n    },\n    [canWrite, draftBusy, draftCommandPath, draftFetcher]\n  );\n\n''',
)
replace_once(
    studio,
    '''  const addFunctionNode = () => {\n''',
    '''  const restoreDraftHistory = useCallback(\n    (operation: "undo" | "redo") => {\n      if (!draft || !editable) return;\n      if (operation === "undo" && !draft.canUndo) return;\n      if (operation === "redo" && !draft.canRedo) return;\n      pendingCreatedNodeIds.current = null;\n      submitDraft({\n        operation,\n        draftId: draft.publicId,\n        expectedVersion: draft.version,\n      });\n    },\n    [draft, editable, submitDraft]\n  );\n\n  useEffect(() => {\n    const handleHistoryShortcut = (event: KeyboardEvent) => {\n      if (isWorkflowStudioHistoryTextEntry(event.target)) return;\n      const action = resolveWorkflowStudioHistoryShortcut(event);\n      if (!action || draftBusy) return;\n      if (action === "undo" && !draft?.canUndo) return;\n      if (action === "redo" && !draft?.canRedo) return;\n      event.preventDefault();\n      event.stopPropagation();\n      restoreDraftHistory(action);\n    };\n    window.addEventListener("keydown", handleHistoryShortcut);\n    return () => window.removeEventListener("keydown", handleHistoryShortcut);\n  }, [draft?.canRedo, draft?.canUndo, draftBusy, restoreDraftHistory]);\n\n  const addFunctionNode = () => {\n''',
)
replace_once(
    studio,
    '''        proposalPath={proposalPath}\n      />\n''',
    '''        proposalPath={proposalPath}\n        canUndo={Boolean(editable && draft?.canUndo)}\n        canRedo={Boolean(editable && draft?.canRedo)}\n        historyBusy={draftBusy}\n        onUndo={() => restoreDraftHistory("undo")}\n        onRedo={() => restoreDraftHistory("redo")}\n      />\n''',
)
replace_once(
    studio,
    '''        data-draft-version={draft?.version ?? ""}\n''',
    '''        data-draft-version={draft?.version ?? ""}\n        data-can-undo={draft?.canUndo ? "true" : "false"}\n        data-can-redo={draft?.canRedo ? "true" : "false"}\n''',
)
