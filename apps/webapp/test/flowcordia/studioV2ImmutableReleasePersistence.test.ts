import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const migrationPath =
  "internal-packages/database/prisma/migrations/20260731200000_flowcordia_studio_v2_immutable_release/migration.sql";
const repositoryPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/release-repository.server.ts";

describe("Studio V2 immutable release persistence", () => {
  const migration = readRepositoryFile(migrationPath);
  const repository = readRepositoryFile(repositoryPath);

  it("pins one release to one exact workspace version with tamper-evident hashes", () => {
    expect(migration).toContain('"workspace_id", "workspace_version"');
    expect(migration).toContain('"document_sha256"');
    expect(migration).toContain('"source_sha256"');
    expect(migration).toContain('"generated_source"');
    expect(migration).toContain('"studio_v2_release_snapshot_immutable"');
    expect(migration).toContain("Studio V2 release snapshots are immutable");
  });

  it("re-locks the tested workspace before inserting the release", () => {
    expect(repository).toContain('FROM "flowcordia"."studio_v2_workspace"');
    expect(repository).toContain("FOR UPDATE");
    expect(repository).toContain("locked.testedVersion !== locked.version");
    expect(repository).toContain("locked.lastTestSucceeded !== true");
  });

  it("keeps source, document, and credential values out of release audit events", () => {
    expect(repository).toContain("releasePublicId: release.publicId");
    expect(repository).toContain("sourceSha256: release.sourceSha256");
    expect(repository).not.toContain("generatedSource: release.generatedSource");
    expect(repository).not.toContain("document: release.document");
  });
});
