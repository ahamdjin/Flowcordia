import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFlowcordiaWebhookReplacementCommand,
  FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/webhook/replacement-command";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia production webhook replacement command", () => {
  it("submits only the exact revoked public identity", () => {
    expect(
      buildFlowcordiaWebhookReplacementCommand({
        workflowId: "order_fulfillment",
        nodeId: "receive-order",
        expectedRevokedPublicId: "WebhookPublicIdentity12345",
      })
    ).toEqual({
      operation: "replace_revoked_webhook",
      confirmation: FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION,
      workflowId: "order_fulfillment",
      nodeId: "receive-order",
      expectedRevokedPublicId: "WebhookPublicIdentity12345",
    });
  });

  it("uses authenticated project, task, and server actor boundaries", () => {
    const command = source(
      "../../app/features/flowcordia/workflows/webhook/replacement-commands.server.ts"
    );
    const service = source("../../app/features/flowcordia/workflows/webhook/replacement.server.ts");
    const route = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.workflow-webhook-replacement/route.ts"
    );

    expect(command).toContain("MAX_REQUEST_BYTES = 16 * 1024");
    expect(command).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(command).toContain(".strict()");
    expect(command).toContain('input.ability.can("trigger"');
    expect(command).toContain("actorId: input.actorId");
    expect(command).not.toContain("proposedPublicId");
    expect(service).toContain('randomBytes(24).toString("base64url")');
    expect(service).toContain("replaceRevoked");
    expect(route).toContain('authorization: { action: "write", resource: { type: "github" } }');
    expect(route).toContain("canAccessFlowcordiaStudio");
    expect(route).toContain("actorId: user.id");
  });
});
