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
const webhookConverter = readFileSync(
  resolve(import.meta.dirname, "activepieces-webhook-request.server.ts"),
  "utf8"
);
const stepFiles = readFileSync(
  resolve(import.meta.dirname, "activepieces-step-files.server.ts"),
  "utf8"
);
const appEventIngress = readFileSync(
  resolve(import.meta.dirname, "../../../../routes/api.v1.app-events.$pieceUrl.ts"),
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

  it("uses Trigger.dev runtime routing while keeping provider callback URLs public", () => {
    expect(source).toContain("const origin = process.env.TRIGGER_API_URL");
    expect(source).toContain("const token = process.env.TRIGGER_SECRET_KEY");
    expect(source).toContain("serverApiUrl: process.env.TRIGGER_API_URL");
    expect(source).toContain("serverPublicUrl: payload.serverPublicUrl");
    expect(source).toContain("serverPublicUrl\n  ).toString()");
    expect(source).not.toContain("process.env.APP_ORIGIN");
  });

  it("routes exact Activepieces webhook hooks through the pinned Trigger.dev task", () => {
    expect(source).toContain("inspectFlowcordiaActivepiecesWebhookTrigger");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerHandshake");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerRenew");
    expect(source).toContain('kind: "trigger_webhook_inspect"');
    expect(source).toContain('kind: "trigger_handshake"');
    expect(source).toContain('kind: "trigger_renew"');
    expect(source).toContain('kind: "app_event_parse"');
    expect(source).toContain('case "app_event_parse":');
  });

  it("re-arms Trigger.dev simulation after an exact Activepieces handshake", () => {
    expect(source).toContain("FlowcordiaActivepiecesSimulationWakePayload");
    expect(source).toContain("isFlowcordiaActivepiecesHandshakeRequest");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerEnable");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerRun");
    expect(source).toContain("executeFlowcordiaActivepiecesTriggerDisable");
    expect(source).toContain("createSimulationToken");
    expect(source).toContain("tokenSequence++");
    expect(source).toContain(".forToken<FlowcordiaActivepiecesSimulationWakePayload>");
    expect(source).toContain('wakePayload.kind === "CANCEL"');
    expect(source).toContain('kind: "HANDSHAKE"');
    expect(source).toContain('kind: "EVENT_ACCEPTED"');
    expect(source).toContain("callbackResult");
    expect(source).toContain('status: "ARMING"');
    expect(source).toContain('status: "ARMED"');
    expect(source).toContain('status: "CANCELED"');
    expect(source).toContain("waitTokenUrl: token.url");
    expect(source).toContain("await metadata.flush()");
    expect(source).not.toContain("__flowcordiaActivepiecesSimulationCancel");
    expect(source).not.toContain("WorkerJobType");
    expect(source).not.toContain("jobQueue");
  });

  it("publishes a correlated synchronous simulation callback ingress", () => {
    expect(simulationIngress).toContain("export async function loader");
    expect(simulationIngress).toContain("export async function action");
    expect(simulationIngress).toContain('kind: "CALLBACK"');
    expect(simulationIngress).toContain("callbackRequestId");
    expect(simulationIngress).toContain("waitForCallbackResult");
    expect(simulationIngress).toContain('kind: "HANDSHAKE"');
    expect(simulationIngress).toContain('kind: "EVENT_ACCEPTED"');
    expect(simulationIngress).toContain('redirect: "error"');
    expect(simulationIngress).toContain("convertStudioV2ActivepiecesWebhookRequest(request, {");
  });

  it("maps binary and multipart webhooks to durable Activepieces step-file URLs", () => {
    expect(webhookConverter).toContain("AP_MAX_WEBHOOK_PAYLOAD_SIZE_MB");
    expect(webhookConverter).toContain("DEFAULT_ACTIVEPIECES_WEBHOOK_PAYLOAD_SIZE_MB = 25");
    expect(webhookConverter).toContain("parsedRequest.formData()");
    expect(webhookConverter).toContain("value.stream()");
    expect(webhookConverter).toContain("saveStudioV2ActivepiecesStepFile");
    expect(webhookConverter).toContain("body: { fileUrl: saved.readUrl }");
    expect(webhookConverter).not.toContain("activepieces_webhook_multipart_pending");
    expect(webhookConverter).not.toContain("activepieces_webhook_binary_pending");

    expect(stepFiles).toContain("uploadPacketToObjectStore");
    expect(stepFiles).toContain("generatePresignedUrl");
    expect(stepFiles).toContain("AP_MAX_FILE_SIZE_MB");
    expect(stepFiles).toContain("DEFAULT_ACTIVEPIECES_FILE_SIZE_MB = 25");
    expect(stepFiles).toContain("AP_EXECUTION_DATA_RETENTION_DAYS");
    expect(stepFiles).toContain("DEFAULT_ACTIVEPIECES_RETENTION_DAYS = 30");
    expect(stepFiles).toContain('fileType: "FLOW_STEP_FILE"');
    expect(stepFiles).toContain('metadata: { stepName: "trigger", flowId: input.workflowId }');
  });

  it("routes exact Activepieces APP_WEBHOOK events without an Activepieces queue", () => {
    expect(appEventIngress).toContain('slack: "@activepieces/piece-slack"');
    expect(appEventIngress).toContain('square: "@activepieces/piece-square"');
    expect(appEventIngress).toContain('"facebook-leads": "@activepieces/piece-facebook-leads"');
    expect(appEventIngress).toContain('intercom: "@activepieces/piece-intercom"');
    expect(appEventIngress).toContain('kind: "app_event_parse"');
    expect(appEventIngress).toContain("listStudioV2ActivepiecesSimulationAppListeners");
    expect(appEventIngress).toContain("publicOrigin: new URL(request.url).origin");
    expect(appEventIngress).toContain("Promise.allSettled");
    expect(appEventIngress).not.toContain("jobQueue");
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
