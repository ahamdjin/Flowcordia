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
const dockerfile = readFileSync(resolve(process.cwd(), "../../docker/Dockerfile"), "utf8");
const vendorSource = readFileSync(
  resolve(
    process.cwd(),
    "app/features/flowcordia/workflows/studio-v2/activepieces-vendor.server.ts"
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
    expect(source).toContain('"dist", "src", "index.js"');
    expect(source).not.toContain('"/dist/"');
    expect(source).toContain('dirs: ["./trigger"]');
    expect(source).toContain('runtime: "node-22"');
    expect(source).toContain("maxDuration: 300");
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

  it("bundles each selected piece and recursive Activepieces workspace dependencies", () => {
    expect(source).toContain("copyVendoredActivepiecesPiece");
    expect(source).toContain("pieceName: dependency.packageName");
    expect(source).toContain("pieceVersion: dependency.version");
    expect(source).toContain('"@activepieces/core-formula": "workspace:*"');
    expect(vendorSource).toContain('const queue = [input.pieceName, "@activepieces/core-formula"]');
    expect(vendorSource).toContain('next.main = "./src/index.ts"');
    expect(vendorSource).toContain('join(destination, "LICENSE")');
    expect(vendorSource).toContain("workspaceDependencies(candidate.manifest)");
  });

  it("carries the pinned catalog, CE pieces, framework, and license in the self-host image", () => {
    expect(dockerfile).toContain("/triggerdotdev/studio-v2/activepieces-catalog");
    expect(dockerfile).toContain(
      "/triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/community"
    );
    expect(dockerfile).toContain(
      "/triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/framework"
    );
    expect(dockerfile).toContain("/triggerdotdev/studio-v2/activepieces-core-nodes/LICENSE");
    expect(dockerfile).toContain(
      "COPY --chown=node:node studio-v2/activepieces-core-nodes/LICENSE ./studio-v2/activepieces-core-nodes/LICENSE"
    );
    expect(dockerfile).toContain("COPY --from=pruner --chown=node:node");
  });

  it("pins Activepieces piece dependencies in the immutable deployment manifest", () => {
    expect(source).toContain("...pieceDependencies");
    expect(source).toContain('[packageName, "workspace:*"]');
    expect(vendorSource).toContain("piece.version === input.pieceVersion");
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
