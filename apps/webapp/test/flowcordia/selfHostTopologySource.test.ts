import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia production self-host application plane", () => {
  it("uses one immutable image for migration, web, and operations roles", () => {
    const compose = source("docker/flowcordia-self-host.yml");

    expect(compose.match(/image: \$\{FLOWCORDIA_IMAGE_REFERENCE/g)).toHaveLength(1);
    expect(compose).toContain("FLOWCORDIA_PROCESS_ROLE: migration");
    expect(compose).toContain("FLOWCORDIA_PROCESS_ROLE: web");
    expect(compose).toContain("FLOWCORDIA_PROCESS_ROLE: operations");
    expect(compose).toContain("FLOWCORDIA_RELEASE_COMPONENT: web");
    expect(compose).toContain("FLOWCORDIA_RELEASE_COMPONENT: operations_worker");
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose).toContain("FLOWCORDIA_MIGRATION_CONFIRM");
    expect(compose).not.toMatch(/\n  (db|postgres|redis|clickhouse|electric):\n/);
    expect(compose).not.toContain(":latest");
  });

  it("keeps long-running replicas immutable, least-privileged, and migration-disabled", () => {
    const compose = source("docker/flowcordia-self-host.yml");

    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("- ALL");
    expect(compose).toContain("/tmp:rw,noexec,nosuid,nodev");
    expect(compose).toContain('SKIP_POSTGRES_MIGRATIONS: "1"');
    expect(compose).toContain('SKIP_DASHBOARD_AGENT_MIGRATIONS: "1"');
    expect(compose).toContain('SKIP_CLICKHOUSE_MIGRATIONS: "1"');
    expect(compose).toContain("host_ip: ${FLOWCORDIA_HTTP_BIND:-127.0.0.1}");
    expect(compose).not.toContain("privileged: true");
    expect(compose).not.toContain("docker.sock");
  });

  it("provides real web and operations readiness contracts", () => {
    const compose = source("docker/flowcordia-self-host.yml");
    const lifecycle = source(
      "apps/webapp/app/features/flowcordia/proposals/worker/lifecycle.server.ts"
    );

    expect(compose).toContain("http://127.0.0.1:3000/healthcheck");
    expect(compose).toContain("./scripts/flowcordia-operations-health.mjs");
    expect(lifecycle).toContain("createFlowcordiaOperationsLocalHealth");
    expect(lifecycle).toContain("localHealth.start()");
    expect(lifecycle).toContain("localHealth.stop()");
    expect(lifecycle.indexOf("heartbeat.start()")).toBeLessThan(
      lifecycle.indexOf("localHealth.start()")
    );
  });

  it("pins every build base and packages immutable Prisma runtime artifacts", () => {
    const dockerfile = source("docker/Dockerfile");
    const entrypoint = source("docker/scripts/entrypoint.sh");

    expect(dockerfile).toContain("ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:");
    expect(dockerfile).toContain("ARG GO_IMAGE=golang:1.26-alpine@sha256:");
    expect(dockerfile).toContain("FROM ${GO_IMAGE} AS goose_builder");
    expect(dockerfile).toContain("/triggerdotdev/apps/webapp/prisma/schema.prisma");
    expect(dockerfile).toContain("node_modules/@prisma/engines/*.node");
    expect(dockerfile).toContain("flowcordia-release-migrate.sh");
    expect(dockerfile).toContain("flowcordia-release-verify.mjs");
    expect(dockerfile).toContain("flowcordia-operations-health.mjs");
    expect(entrypoint).toContain('FLOWCORDIA_PROCESS_ROLE:-}" = "migration"');
    expect(entrypoint).toContain(
      "Published Flowcordia application replicas must not execute migrations"
    );
    expect(entrypoint).toContain("FLOWCORDIA_IMMUTABLE_ROOTFS");
    expect(entrypoint).not.toContain("set -xe");
  });

  it("runs every owned migration once and preserves bounded completion evidence", () => {
    const migration = source("docker/scripts/flowcordia-release-migrate.sh");

    expect(migration).toContain("flowcordia-release-verify.mjs migration");
    expect(migration).toContain("FLOWCORDIA_MIGRATION_CONFIRM");
    expect(migration).toContain("@trigger.dev/database db:migrate:deploy");
    expect(migration).toContain("prisma migrate status");
    expect(migration).toContain("@internal/dashboard-agent-db db:migrate:deploy");
    expect(migration).toContain("@internal/dashboard-agent-db db:migrate:status");
    expect(migration).toContain("/usr/local/bin/goose validate");
    expect(migration).toContain("/usr/local/bin/goose up");
    expect(migration).toContain("FLOWCORDIA_MIGRATION_EVIDENCE_DIR");
    expect(migration).toContain('"schemaVersion":"0.1"');
    expect(migration).not.toContain("set -x");
  });

  it("keeps configuration, secrets, and release identity as separate host inputs", () => {
    const compose = source("docker/flowcordia-self-host.yml");
    const validator = source("scripts/flowcordia-self-host-validate.ts");
    const secrets = source("docker/flowcordia-self-host.secrets.example");

    expect(compose).toContain("FLOWCORDIA_CONFIG_FILE");
    expect(compose).toContain("FLOWCORDIA_SECRETS_FILE");
    expect(compose).toContain("FLOWCORDIA_RELEASE_MANIFEST_FILE");
    expect(validator).toContain("must not be readable or writable by group or other users");
    expect(validator).toContain("must not define the same key");
    expect(validator).toContain("must be stored outside the repository");
    expect(secrets).not.toContain("postgres:postgres");
    expect(secrets).not.toContain("minioadmin");
  });

  it("validates the topology and builds the actual image in non-mutating CI", () => {
    const workflow = source(".github/workflows/flowcordia-self-host-topology.yml");

    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("pnpm flowcordia:release:manifest");
    expect(workflow).toContain("pnpm flowcordia:self-host:validate");
    expect(workflow).toContain("docker compose");
    expect(workflow).toContain("config --quiet");
    expect(workflow).toContain("operationsLocalHealth.test.ts");
    expect(workflow).toContain("selfHostReleaseScripts.test.ts");
    expect(workflow).toContain("selfHostTopology.test.ts");
    expect(workflow).toContain("selfHostTopologySource.test.ts");
    expect(workflow).toContain("build-image:");
    expect(workflow).toContain("--load");
    expect(workflow).toContain("docker image inspect");
    expect(workflow).toContain("test -f ./apps/webapp/prisma/schema.prisma");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("docker compose up");
    expect(workflow).not.toContain("--push");
  });
});
