import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "app/features/flowcordia/workflows/studio-v2/deployment-context.server.ts"
  ),
  "utf8"
);

describe("Studio V2 native deployment context", () => {
  it("packages the immutable generated task with the Flowcordia runtime sources", () => {
    expect(source).toContain('join(contextDirectory, "trigger", "flowcordia.ts")');
    expect(source).toContain("input.release.generatedSource");
    expect(source).toContain('"packages/flowcordia-foundation"');
    expect(source).toContain('"packages/flowcordia-workflow"');
    expect(source).toContain('"packages/flowcordia-runtime"');
    expect(source).toContain('dirs: ["./trigger"]');
    expect(source).toContain('runtime: "node-22"');
  });

  it("externalizes Secure Exec native packages for the Trigger.dev builder", () => {
    expect(source).toContain('external: ["secure-exec", "@secure-exec/typescript"]');
  });

  it("enforces the same 100 MB deployment context boundary as the artifact service", () => {
    expect(source).toContain("100 * 1024 * 1024");
    expect(source).toContain("archive.size > MAX_DEPLOYMENT_CONTEXT_BYTES");
  });

  it("does not package credentials, environment values, or GitHub state", () => {
    expect(source).not.toContain("credentialValues");
    expect(source).not.toContain("process.env[");
    expect(source.toLowerCase()).not.toContain("github");
  });
});
