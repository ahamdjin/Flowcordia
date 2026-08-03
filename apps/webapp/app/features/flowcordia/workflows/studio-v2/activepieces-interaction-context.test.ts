import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "activepieces-interaction-context.server.ts"),
  "utf8"
);
const simulationIngress = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../routes/api.v1.flowcordia.studio-v2.activepieces-trigger-simulations.$environmentId.$simulationId.ts"
  ),
  "utf8"
);

describe("Studio V2 Activepieces interaction context", () => {
  it("runs Builder piece interactions as native Trigger.dev tasks", () => {
    expect(source).toContain('"flowcordia-studio-activepieces-interaction"');
    expect(source).toContain("executeFlowcordiaActivepiecesProperty");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerTest");
    expect(source).toContain("executeFlowcordiaActivepiecesAction");
    expect(source).toContain('import { metadata, task, wait } from "@trigger.dev/sdk"');
    expect(source).toContain('runtime: "node-22"');
  });

  it("runs Activepieces simulation hooks around a Trigger.dev wait token", () => {
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerEnable");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerRun");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerDisable");
    expect(source).toContain("await wait.createToken");
    expect(source).toContain("FlowcordiaActivepiecesTriggerPayload");
    expect(source).toContain(".forToken<");
    expect(source).toContain('status: "ARMING"');
    expect(source).toContain('status: "ARMED"');
    expect(source).toContain('status: "CANCELED"');
    expect(source).toContain("waitTokenUrl: token.url");
    expect(source).toContain("await metadata.flush()");
    expect(source).toContain("__flowcordiaActivepiecesSimulationCancel");
    expect(source).not.toContain("WorkerJobType");
    expect(source).not.toContain("jobQueue");
  });

  it("publishes a bounded callback ingress before Activepieces subscribes", () => {
    expect(simulationIngress).toContain("export async function loader");
    expect(simulationIngress).toContain("export async function action");
    expect(simulationIngress).toContain("MAX_INLINE_BODY_BYTES = 1024 * 1024");
    expect(simulationIngress).toContain('simulation.status !== "ARMING"');
    expect(simulationIngress).toContain('simulation.status !== "ARMED"');
    expect(simulationIngress).toContain('redirect: "error"');
    expect(simulationIngress).toContain("activepieces_simulation_multipart_pending");
    expect(simulationIngress).toContain("activepieces_simulation_binary_pending");
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
