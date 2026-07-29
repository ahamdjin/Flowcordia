from pathlib import Path


def patch(path_text: str, replacements: list[tuple[str, str, str]]) -> None:
    path = Path(path_text)
    text = path.read_text()
    for old, new, label in replacements:
        if new in text:
            continue
        count = text.count(old)
        if count != 1:
            raise RuntimeError(f"{path_text}: {label}: expected one marker, found {count}")
        text = text.replace(old, new, 1)
    path.write_text(text)


patch(
    "apps/webapp/app/features/flowcordia/workflows/drafts/types.ts",
    [
        (
            "  version: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;",
            "  version: bigint;\n  historyMin: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;",
            "draft history lower-bound type",
        )
    ],
)

patch(
    "apps/webapp/app/features/flowcordia/workflows/drafts/repository.server.ts",
    [
        (
            "  version: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;",
            "  version: bigint;\n  historyMin: bigint;\n  historyCursor: bigint;\n  historyMax: bigint;",
            "draft row history lower bound",
        ),
        (
            '    "version",\n    "history_cursor" AS "historyCursor",',
            '    "version",\n    "history_min" AS "historyMin",\n    "history_cursor" AS "historyCursor",',
            "draft history lower-bound column",
        ),
        (
            "    version: row.version,\n    historyCursor: row.historyCursor,",
            "    version: row.version,\n    historyMin: row.historyMin,\n    historyCursor: row.historyCursor,",
            "decode history lower bound",
        ),
        (
            "    const history = nextWorkflowDraftEditHistory({\n      cursor: current.historyCursor,\n      max: current.historyMax,\n    });",
            "    const history = nextWorkflowDraftEditHistory({\n      min: current.historyMin,\n      cursor: current.historyCursor,\n      max: current.historyMax,\n    });",
            "bounded edit transition",
        ),
        (
            '''      WHERE "draft_id" = ${current.id}
        AND "revision" > ${history.pruneAfter}''',
            '''      WHERE "draft_id" = ${current.id}
        AND (
          "revision" > ${history.pruneAfter}
          OR "revision" < ${history.pruneBefore}
        )''',
            "two-sided revision pruning",
        ),
        (
            '        "version" = "version" + 1,\n        "history_cursor" = ${history.cursor},',
            '        "version" = "version" + 1,\n        "history_min" = ${history.min},\n        "history_cursor" = ${history.cursor},',
            "persist history lower bound",
        ),
        (
            "        historyRevision: updated.historyCursor.toString(),\n        documentSha256: updated.documentSha256,",
            "        retainedHistoryMin: updated.historyMin.toString(),\n        historyRevision: updated.historyCursor.toString(),\n        prunedHistoryRevisionCount: history.prunedRevisionCount.toString(),\n        documentSha256: updated.documentSha256,",
            "audit retention metrics",
        ),
        (
            "      state: { cursor: current.historyCursor, max: current.historyMax },",
            "      state: {\n        min: current.historyMin,\n        cursor: current.historyCursor,\n        max: current.historyMax,\n      },",
            "restore retained range",
        ),
    ],
)

for path_text in [
    "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts",
    "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts",
]:
    path = Path(path_text)
    text = path.read_text()
    old = "draft.historyCursor > 1n"
    new = "draft.historyCursor > draft.historyMin"
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path_text}: history availability: expected one marker, found {count}")
    path.write_text(text.replace(old, new, 1))
