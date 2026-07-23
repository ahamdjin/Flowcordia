import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia release runtime wiring", () => {
  it("verifies release identity during bootstrap module evaluation before workers start", () => {
    const bootstrap = source("apps/webapp/app/bootstrap.ts");
    const entry = source("apps/webapp/app/entry.server.tsx");

    expect(bootstrap).toContain(
      'import { initializeFlowcordiaReleaseRuntimeIdentity } from "./features/flowcordia/operations/release-runtime.server";'
    );
    expect(bootstrap.indexOf("initializeFlowcordiaReleaseRuntimeIdentity();")).toBeLessThan(
      bootstrap.indexOf("export async function bootstrap()")
    );
    expect(entry).toContain('import { bootstrap } from "./bootstrap";');
    expect(entry.indexOf("bootstrap().catch")).toBeGreaterThan(
      entry.indexOf("initFlowcordiaProposalOperationsWorker();")
    );
  });

  it("keeps readiness tied to the cached immutable release identity", () => {
    const healthcheck = source("apps/webapp/app/routes/healthcheck.tsx");

    expect(healthcheck).toContain("assertFlowcordiaReleaseRuntimeIdentity();");
    expect(healthcheck.indexOf("assertFlowcordiaReleaseRuntimeIdentity();")).toBeLessThan(
      healthcheck.indexOf("await rbac.isUsingPlugin();")
    );
    expect(healthcheck.indexOf("assertFlowcordiaReleaseRuntimeIdentity();")).toBeLessThan(
      healthcheck.indexOf("SELECT 1")
    );
  });

  it("documents exact web and operations-worker process modes", () => {
    const environment = source(".env.example");
    const server = source("apps/webapp/server.ts");

    for (const key of [
      "FLOWCORDIA_RELEASE_RUNTIME_REQUIRED",
      "FLOWCORDIA_RELEASE_MANIFEST_PATH",
      "FLOWCORDIA_RELEASE_MANIFEST_SHA256",
      "FLOWCORDIA_RELEASE_COMPONENT",
      "FLOWCORDIA_IMAGE_DIGEST",
    ]) {
      expect(environment).toContain(key);
    }
    expect(environment).toContain("FLOWCORDIA_RELEASE_COMPONENT=operations_worker");
    expect(environment).toContain("HTTP_SERVER_DISABLED=true");
    expect(server).toContain('process.env.HTTP_SERVER_DISABLED !== "true"');
  });
});
