import { describe, expect, it, vi } from "vitest";
import { presentFlowcordiaDependencyPreflight } from "../../app/features/flowcordia/operations/dependency-preflight";
import {
  evaluateFlowcordiaMigrationRows,
  evaluateFlowcordiaWorkerHeartbeat,
  probeFlowcordiaGitHubApp,
  runFlowcordiaDependencyProbes,
  type FlowcordiaDependencyDatabase,
} from "../../app/features/flowcordia/operations/dependency-preflight.server";

const now = new Date("2026-07-21T18:00:00.000Z");
const migrations = ["20260720000000_first", "20260721000000_second"];
const privateKey = `-----BEGIN RSA PRIVATE KEY-----\n${"MIIE".repeat(80)}\n-----END RSA PRIVATE KEY-----`;

function successfulRows() {
  return migrations.map((migration_name) => ({
    migration_name,
    finished_at: new Date("2026-07-21T17:00:00.000Z"),
    rolled_back_at: null,
  }));
}

function database(input: {
  queryError?: boolean;
  migrationRows?: ReturnType<typeof successfulRows>;
  heartbeat?: { observedAt: Date; healthyUntil: Date } | null;
  heartbeatError?: boolean;
} = {}): FlowcordiaDependencyDatabase {
  return {
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      if (input.queryError) throw new Error("private database error");
      if (query.startsWith("SELECT 1")) return [{ value: 1 }] as T;
      return (input.migrationRows ?? successfulRows()) as T;
    },
    flowcordiaOperationsWorkerHeartbeat: {
      async findUnique() {
        if (input.heartbeatError) throw new Error("private heartbeat error");
        return (
          input.heartbeat ?? {
            observedAt: new Date("2026-07-21T17:59:30.000Z"),
            healthyUntil: new Date("2026-07-21T18:01:00.000Z"),
          }
        );
      },
    },
  };
}

describe("Flowcordia live dependency preflight", () => {
  it("projects fixed release checks without provider values", () => {
    const projection = presentFlowcordiaDependencyPreflight({
      profile: "release",
      checkedAt: now,
      observation: {
        databaseConnection: "READY",
        databaseMigrations: "READY",
        githubApp: "READY",
        workerHeartbeat: "READY",
      },
    });

    expect(projection).toMatchObject({
      schemaVersion: "0.1",
      profile: "release",
      state: "READY",
      checkedAt: now.toISOString(),
    });
    expect(projection.checks.map((check) => check.key)).toEqual([
      "database_connection",
      "database_migrations",
      "github_app",
      "worker_heartbeat",
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/postgresql:|api\.github|Bearer|PRIVATE KEY/);
  });

  it("gives BLOCKED precedence over unavailable evidence", () => {
    const projection = presentFlowcordiaDependencyPreflight({
      profile: "web",
      checkedAt: now,
      observation: {
        databaseConnection: "UNAVAILABLE",
        databaseMigrations: "BLOCKED",
        githubApp: "READY",
      },
    });
    expect(projection.state).toBe("BLOCKED");
    expect(projection.checks.map((check) => check.key)).not.toContain("worker_heartbeat");
  });

  it("requires heartbeat evidence for worker and release profiles", () => {
    expect(() =>
      presentFlowcordiaDependencyPreflight({
        profile: "worker",
        checkedAt: now,
        observation: {
          databaseConnection: "READY",
          databaseMigrations: "READY",
          githubApp: "READY",
        },
      })
    ).toThrow("worker dependency evidence is required");
  });

  it("requires an exact successful migration set", () => {
    expect(
      evaluateFlowcordiaMigrationRows({ repositoryMigrationNames: migrations, rows: successfulRows() })
    ).toBe("READY");

    expect(
      evaluateFlowcordiaMigrationRows({
        repositoryMigrationNames: migrations,
        rows: successfulRows().slice(0, 1),
      })
    ).toBe("BLOCKED");

    expect(
      evaluateFlowcordiaMigrationRows({
        repositoryMigrationNames: migrations,
        rows: [
          ...successfulRows(),
          {
            migration_name: "20260722000000_newer_database",
            finished_at: new Date("2026-07-21T17:30:00.000Z"),
            rolled_back_at: null,
          },
        ],
      })
    ).toBe("BLOCKED");

    expect(
      evaluateFlowcordiaMigrationRows({
        repositoryMigrationNames: migrations,
        rows: [
          ...successfulRows(),
          {
            migration_name: "20260721010000_failed",
            finished_at: null,
            rolled_back_at: null,
          },
        ],
      })
    ).toBe("BLOCKED");
  });

  it("accepts only a current, ordered worker heartbeat", () => {
    expect(
      evaluateFlowcordiaWorkerHeartbeat(
        {
          observedAt: new Date("2026-07-21T17:59:30.000Z"),
          healthyUntil: new Date("2026-07-21T18:01:00.000Z"),
        },
        now
      )
    ).toBe("READY");
    expect(
      evaluateFlowcordiaWorkerHeartbeat(
        {
          observedAt: new Date("2026-07-21T17:50:00.000Z"),
          healthyUntil: new Date("2026-07-21T17:55:00.000Z"),
        },
        now
      )
    ).toBe("BLOCKED");
    expect(
      evaluateFlowcordiaWorkerHeartbeat(
        {
          observedAt: new Date("2026-07-21T18:10:00.000Z"),
          healthyUntil: new Date("2026-07-21T18:11:00.000Z"),
        },
        now
      )
    ).toBe("BLOCKED");
  });

  it("classifies GitHub authentication without retaining response data", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      expect(authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
      expect(authorization).not.toContain(privateKey);
      return new Response("private-provider-body", { status: 200 });
    });

    await expect(
      probeFlowcordiaGitHubApp({
        config: { appId: "123456", privateKey },
        now,
        fetch: fetchMock,
      })
    ).resolves.toBe("READY");
    await expect(
      probeFlowcordiaGitHubApp({
        config: { appId: "123456", privateKey },
        now,
        fetch: async () => new Response(null, { status: 401 }),
      })
    ).resolves.toBe("BLOCKED");
    await expect(
      probeFlowcordiaGitHubApp({
        config: { appId: "123456", privateKey },
        now,
        fetch: async () => new Response(null, { status: 503 }),
      })
    ).resolves.toBe("UNAVAILABLE");
    await expect(
      probeFlowcordiaGitHubApp({
        config: { appId: "invalid", privateKey },
        now,
        fetch: fetchMock,
      })
    ).resolves.toBe("BLOCKED");
  });

  it("runs database, migration, GitHub, and heartbeat probes through one bounded observation", async () => {
    const observation = await runFlowcordiaDependencyProbes({
      profile: "release",
      database: database(),
      migrationNames: migrations,
      githubApp: { appId: "123456", privateKey },
      now,
      fetch: async () => new Response(null, { status: 200 }),
    });
    expect(observation).toEqual({
      databaseConnection: "READY",
      databaseMigrations: "READY",
      githubApp: "READY",
      workerHeartbeat: "READY",
    });

    const unavailable = await runFlowcordiaDependencyProbes({
      profile: "release",
      database: database({ queryError: true }),
      migrationNames: migrations,
      githubApp: { appId: "123456", privateKey },
      now,
      fetch: async () => {
        throw new Error("private network failure");
      },
    });
    expect(unavailable).toEqual({
      databaseConnection: "UNAVAILABLE",
      databaseMigrations: "UNAVAILABLE",
      githubApp: "UNAVAILABLE",
      workerHeartbeat: "UNAVAILABLE",
    });
  });
});
