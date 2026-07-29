import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow draft history persistence contract", () => {
  it("creates revision storage and bootstraps existing drafts", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "../../internal-packages/database/prisma/migrations/20260729010000_flowcordia_workflow_draft_history/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain('CREATE TABLE "flowcordia"."workflow_draft_revision"');
    expect(migration).toContain('ADD COLUMN "history_cursor" BIGINT');
    expect(migration).toContain('ADD COLUMN "history_max" BIGINT');
    expect(migration).toContain('UNIQUE ("draft_id", "revision")');
    expect(migration).toContain('"history_max" >= "history_cursor"');
    expect(migration).toContain("history.bootstrap");
    expect(migration).not.toContain("credential");
  });

  it("adds and initializes a durable lower bound for retained revisions", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "../../internal-packages/database/prisma/migrations/20260729023000_flowcordia_workflow_draft_history_retention/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain('ADD COLUMN "history_min" BIGINT');
    expect(migration).toContain('GREATEST(1, "history_cursor" - 199)');
    expect(migration).toContain('"history_max" = "history_cursor"');
    expect(migration).toContain('DELETE FROM "flowcordia"."workflow_draft_revision"');
    expect(migration).toContain('revision."revision" < draft."history_min"');
    expect(migration).toContain('revision."revision" > draft."history_max"');
    expect(migration).toContain('"history_min" <= "history_cursor"');
  });

  it("requires locked optimistic transitions, two-sided pruning, and integrity validation", () => {
    const repository = readFileSync(new URL("./repository.server.ts", import.meta.url), "utf8");

    expect(repository).toContain("FOR UPDATE");
    expect(repository).toContain('DELETE FROM "flowcordia"."workflow_draft_revision"');
    expect(repository).toContain('"revision" >');
    expect(repository).toContain('"revision" <');
    expect(repository).toContain('"history_min" =');
    expect(repository).toContain('"history_cursor" =');
    expect(repository).toContain('"history_max" =');
    expect(repository).toContain("prunedHistoryRevisionCount");
    expect(repository).toContain("validateWorkflow(row.documentJson)");
    expect(repository).toContain("workflowSha256(validated.workflow)");
    expect(repository).toContain('"workflow_draft.undone"');
    expect(repository).toContain('"workflow_draft.redone"');
  });
});
