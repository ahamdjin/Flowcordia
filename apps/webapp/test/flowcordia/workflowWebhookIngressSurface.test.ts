import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Flowcordia public webhook ingress surface", () => {
  it("keeps both root and splat routes on the dedicated HMAC boundary", () => {
    for (const path of [
      "app/routes/api.v1.flowcordia.webhooks.$publicId/route.ts",
      "app/routes/api.v1.flowcordia.webhooks.$publicId.$/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain("handleFlowcordiaPublicWebhookIngress");
      expect(route).not.toContain("apiBuilder");
      expect(route).not.toContain("dashboardLoader");
    }
  });

  it("keeps request ordering in a host-independent state machine", () => {
    const handler = source("app/features/flowcordia/workflows/webhook/ingress-handler.ts");
    expect(handler).toContain("verifyFlowcordiaWebhookSignature");
    expect(handler).toContain("isFlowcordiaPublicWebhookJsonContentType");
    expect(handler).toContain("findExistingRun");
    expect(handler).toContain("endpointId: binding.endpointStorageId");
    expect(handler).not.toContain("~/db.server");
    expect(handler).not.toContain("RateLimiter");
    expect(handler).not.toContain("TriggerTaskService");
  });

  it("uses exact-key host secret reads and exact task-version execution", () => {
    const host = source("app/features/flowcordia/workflows/webhook/ingress.server.ts");
    expect(host).toContain("getVariableValuesForKeys");
    expect(host).toContain("binding.credentialVersion");
    expect(host).toContain("lockToVersion: binding.workerVersion");
    expect(host).toContain("findExistingRun");
    expect(host).toContain("errorName: error instanceof Error ? error.name");
    expect(host).not.toContain("getEnvironmentVariables(");
    expect(host).not.toContain("getProject(");
    expect(host).not.toContain("request.headers.entries");
    expect(host).not.toContain("error.message");
  });

  it("publishes the callable URL only from the active immutable projection", () => {
    const query = source("app/features/flowcordia/workflows/webhook/binding-query.server.ts");
    const panel = source(
      "app/features/flowcordia/workflows/webhook/WorkflowProductionWebhookPanel.tsx"
    );
    expect(query).toContain("flowcordiaPublicWebhookUrl");
    expect(query).toContain("publicUrl");
    expect(panel).toContain("binding.activeRevision.publicUrl");
    expect(panel).toContain("data-public-url");
  });
});
