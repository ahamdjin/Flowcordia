import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "activepieces-interaction-context.server.ts"),
  "utf8"
);

describe("Studio V2 Activepieces interaction context", () => {
  it("runs Builder piece interactions as native Trigger.dev tasks", () => {
    expect(source).toContain('"flowcordia-studio-activepieces-interaction"');
    expect(source).toContain("executeFlowcordiaActivepiecesProperty");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerTest");
    expect(source).toContain("executeFlowcordiaActivepiecesAction");
    expect(source).toContain('import { metadata, task } from "@trigger.dev/sdk"');
    expect(source).toContain('runtime: "node-22"');
  });

  it("pins exactly the selected Activepieces package and formula source", () => {
    expect(source).toContain("[pieceName]: pieceVersion");
    expect(source).toContain('"@activepieces/core-formula": "workspace:*"');
    expect(source).toContain('"@flowcordia/workflow": "workspace:*"');
    expect(source).toContain('"studio-v2/activepieces-core-nodes/packages/core/formula/src"');
    expect(source).not.toContain('"@activepieces/piece-slack"');
    expect(source).not.toContain('"@activepieces/piece-gmail"');
  });

  it("resolves encrypted Flowcordia connection bindings only inside the runtime", () => {
    expect(source).toContain("FLOWCORDIA_AP_CONNECTION_");
    expect(source).toContain("process.env[environmentName]");
    expect(source).not.toContain("credentialValues");
  });

  it("bounds interaction results and deployment artifacts", () => {
    expect(source).toContain("64 * 1024");
    expect(source).toContain("100 * 1024 * 1024");
    expect(source).toContain("Buffer.byteLength");
    expect(source).toContain("archive.size > MAX_DEPLOYMENT_CONTEXT_BYTES");
  });
});
