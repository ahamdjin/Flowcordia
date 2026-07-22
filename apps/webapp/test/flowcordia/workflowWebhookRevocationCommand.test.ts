import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFlowcordiaWebhookRevocationCommand,
  FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/webhook/revocation-command";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia production webhook revocation command", () => {
  it("submits only exact public endpoint identity and a fixed reason", () => {
    expect(
      buildFlowcordiaWebhookRevocationCommand({
        workflowId: "order_fulfillment",
        nodeId: "receive-order",
        expectedPublicId: "WebhookPublicIdentity12345",
        reason: "credential_compromise",
      })
    ).toEqual({
      operation: "revoke_webhook",
      confirmation: FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION,
      workflowId: "order_fulfillment",
      nodeId: "receive-order",
      expectedPublicId: "WebhookPublicIdentity12345",
      reason: "credential_compromise",
    });
  });

  it("uses authenticated project write, exact task permission, and server actor identity", () => {
    const command = source(
      "../../app/features/flowcordia/workflows/webhook/revocation-commands.server.ts"
    );
    const route = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.workflow-webhook-revocation/route.ts"
    );

    expect(command).toContain("MAX_REQUEST_BYTES = 16 * 1024");
    expect(command).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(command).toContain(".strict()");
    expect(command).toContain('input.ability.can("trigger"');
    expect(command).toContain("revokeFlowcordiaProductionWebhook");
    expect(command).not.toContain("resolveWorkflowIndexScope");
    expect(command).not.toContain("credentialEnvironmentName");
    expect(command).not.toContain("secret");
    expect(route).toContain('authorization: { action: "write", resource: { type: "github" } }');
    expect(route).toContain("canAccessFlowcordiaStudio");
    expect(route).toContain("actorId: user.id");
  });

  it("keeps emergency revocation independent from GitHub and deployment discovery", () => {
    const service = source("../../app/features/flowcordia/workflows/webhook/revocation.server.ts");
    expect(service).toContain('type: "PRODUCTION"');
    expect(service).toContain("ProductionWebhookBindingService");
    expect(service).not.toContain("createWorkflowIndexGitHubGateway");
    expect(service).not.toContain("findLatestMergedFlowcordiaProposal");
    expect(service).not.toContain("workerDeployment");
    expect(service).not.toContain("environmentVariable");
  });
});
