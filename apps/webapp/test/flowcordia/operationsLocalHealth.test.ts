import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowcordiaOperationsLocalHealth } from "../../app/features/flowcordia/proposals/worker/local-health.server";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

function healthPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "flowcordia-operations-health-"));
  directories.push(directory);
  return join(directory, "health.json");
}

describe("Flowcordia operations local health", () => {
  it("writes one atomic owner-only readiness pulse before returning from start", () => {
    const path = healthPath();
    const health = createFlowcordiaOperationsLocalHealth({
      applicationCommitSha: APPLICATION_SHA,
      path,
      intervalMs: 60_000,
      now: () => new Date("2026-07-23T01:00:00.000Z"),
    });

    health.start();

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      schemaVersion: "0.1",
      state: "READY",
      applicationCommitSha: APPLICATION_SHA,
      checkedAt: "2026-07-23T01:00:00.000Z",
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.tmp-${process.pid}`)).toBe(false);
    health.stop();
  });

  it("is idempotent on repeated start and removes readiness on shutdown", () => {
    const path = healthPath();
    const health = createFlowcordiaOperationsLocalHealth({
      applicationCommitSha: APPLICATION_SHA,
      path,
      intervalMs: 60_000,
    });

    health.start();
    health.start();
    expect(existsSync(path)).toBe(true);

    health.stop();
    health.stop();
    expect(existsSync(path)).toBe(false);
  });

  it("rejects placeholder application identity before creating a health file", () => {
    const path = healthPath();

    expect(() =>
      createFlowcordiaOperationsLocalHealth({ applicationCommitSha: "a".repeat(40), path })
    ).toThrow("application revision is invalid");
    expect(existsSync(path)).toBe(false);
  });

  it("fails synchronously when the readiness timestamp is invalid", () => {
    const path = healthPath();
    const health = createFlowcordiaOperationsLocalHealth({
      applicationCommitSha: APPLICATION_SHA,
      path,
      now: () => new Date(Number.NaN),
    });

    expect(() => health.start()).toThrow("health time is invalid");
    expect(existsSync(path)).toBe(false);
  });
});
