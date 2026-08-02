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

  it("keeps Secure Exec external and adds only release-selected Activepieces piece packages", () => {
    expect(source).toContain('"secure-exec"');
    expect(source).toContain('"@secure-exec/typescript"');
    expect(source).toContain("collectFlowcordiaActivepiecesPieceDependencies(release.document)");
    expect(source).toContain("...piecePackages");
    expect(source).toContain("external: ${JSON.stringify(externalPackages)}");
    expect(source).not.toContain('"@activepieces/piece-slack"');
    expect(source).not.toContain('"@activepieces/piece-gmail"');
  });

  it("bundles the pinned Activepieces formula source instead of depending on an unpublished core package", () => {
    expect(source).toContain(
      '"studio-v2/activepieces-core-nodes/packages/core/formula/src"'
    );
    expect(source).toContain('"@activepieces/core-formula": "workspace:*"');
    expect(source).toContain('name: "@activepieces/core-formula"');
    expect(source).toContain('main: "./src/index.ts"');
    expect(source).toContain('dayjs: "1.11.9"');
    expect(source).toContain('"expr-eval": "2.0.2"');
    expect(source).toContain('tslib: "2.6.2"');
    expect(source).toContain("ACTIVEPIECES_FORMULA_SOURCE_DIRECTORY");
    expect(source).not.toContain(
      '...(piecePackages.length > 0 ? ["@activepieces/core-formula"] : [])'
    );
  });

  it("pins Activepieces piece dependencies in the immutable deployment manifest", () => {
    expect(source).toContain("...pieceDependencies");
    expect(source).toContain('const ACTIVEPIECES_FORMULA_VERSION = "0.2.0"');
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
