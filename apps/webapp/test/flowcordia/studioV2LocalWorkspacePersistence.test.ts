import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const migrationPath =
  "internal-packages/database/prisma/migrations/20260730190000_flowcordia_studio_v2_local_workspace/migration.sql";
const repositoryPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/workspace-repository.server.ts";

describe("Studio V2 local workspace persistence boundary", () => {
  const migration = readRepositoryFile(migrationPath);
  const repository = readRepositoryFile(repositoryPath);

  it("scopes durable workspaces to organization, project, environment, and workspace key", () => {
    expect(migration).toContain('CREATE TABLE "flowcordia"."studio_v2_workspace"');
    expect(migration).toContain(
      '"organization_id", "project_id", "environment_id", "workspace_key"'
    );
    expect(migration).toContain('REFERENCES "public"."RuntimeEnvironment"("id")');
    expect(migration).toContain('"version" BIGINT NOT NULL DEFAULT 1');
    expect(migration).toContain('"tested_version" BIGINT');
  });

  it("does not bind local workspace rows to GitHub or repository identity", () => {
    for (const forbiddenColumn of [
      '"github_app_installation_id"',
      '"app_installation_id"',
      '"repository_id"',
      '"repository_github_id"',
      '"repository_owner"',
      '"repository_name"',
      '"branch"',
      '"base_commit_sha"',
      '"base_blob_sha"',
    ]) {
      expect(migration).not.toContain(forbiddenColumn);
      expect(repository).not.toContain(forbiddenColumn);
    }
  });

  it("requires exact optimistic versions and records metadata-only events", () => {
    expect(repository).toContain("existing.version !== input.expectedVersion");
    expect(repository).toContain('"version" = "version" + 1');
    expect(repository).toContain('"tested_version" = NULL');
    expect(repository).toContain("studio_v2_workspace.saved");
    expect(repository).toContain("documentSha256: workspace.documentSha256");
    expect(repository).not.toContain("payload: workspace.document");
    expect(repository).not.toContain("document: workspace.document");
  });
});
