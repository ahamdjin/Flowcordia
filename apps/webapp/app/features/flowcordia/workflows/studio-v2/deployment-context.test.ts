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

  it("keeps Secure Exec external and adds only release-selected Activepieces packages", () => {
    expect(source).toContain('"secure-exec"');
    expect(source).toContain('"@secure-exec/typescript"');
    expect(source).toContain("collectFlowcordiaActivepiecesPieceDependencies(release.document)");
    expect(source).toContain('piecePackages.length > 0 ? ["@activepieces/core-formula"] : []');
    expect(source).toContain("...piecePackages");
    expect(source).toContain("external: ${JSON.stringify(externalPackages)}");
    expect(source).not.toContain('"@activepieces/piece-slack"');
    expect(source).not.toContain('"@activepieces/piece-gmail"');
  });

  it("pins Activepieces dependencies in the immutable deployment manifest", () => {
    expect(source).toContain('"@activepieces/core-formula": ACTIVEPIECES_FORMULA_VERSION');
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
