import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFlowcordiaWebhookActivationCommand,
  FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/webhook/activation-command";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia production webhook activation command", () => {
  it("submits only public exact-binding identity", () => {
    expect(
      buildFlowcordiaWebhookActivationCommand({
        workflowId: "order_fulfillment",
        nodeId: "receive-order",
        expectedProposalId: "proposal_123",
        expectedMergeCommitSha: "a".repeat(40),
      })
    ).toEqual({
      operation: "activate_webhook",
      confirmation: FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION,
      workflowId: "order_fulfillment",
      nodeId: "receive-order",
      expectedProposalId: "proposal_123",
      expectedMergeCommitSha: "a".repeat(40),
    });
  });

  it("uses the existing authenticated project and task authorization boundary", () => {
    const command = source(
      "../../app/features/flowcordia/workflows/webhook/activation-commands.server.ts"
    );
    const route = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.workflow-webhook-activation/route.ts"
    );

    expect(command).toContain("MAX_REQUEST_BYTES = 16 * 1024");
    expect(command).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(command).toContain(".strict()");
    expect(command).toContain('input.ability.can("trigger"');
    expect(command).toContain("resolveWorkflowIndexScope");
    expect(command).toContain("activateFlowcordiaProductionWebhook");
    expect(command).not.toContain("credentialEnvironmentName");
    expect(command).not.toContain("secret");
    expect(route).toContain('authorization: { action: "write", resource: { type: "github" } }');
    expect(route).toContain("canAccessFlowcordiaStudio");
  });

  it("projects durable status without credential metadata or internal IDs", () => {
    const query = source("../../app/features/flowcordia/workflows/webhook/binding-query.server.ts");
    const panel = source(
      "../../app/features/flowcordia/workflows/webhook/WorkflowProductionWebhookPanel.tsx"
    );
    const studioRoute = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );

    expect(query).toContain('type: "PRODUCTION"');
    expect(query).toContain("activeRevision.nodeId === endpoint.nodeId");
    expect(query).not.toContain("credentialReference");
    expect(query).not.toContain("credentialEnvironmentName");
    expect(query).not.toContain("credentialVersion");
    expect(panel).toContain("WorkflowProductionWebhookPanel");
    expect(panel).toContain("FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION");
    expect(panel).toContain('node.operation === "trigger.webhook"');
    expect(panel).not.toContain("secret");
    expect(studioRoute).toContain("queryFlowcordiaProductionWebhookBindings");
    expect(studioRoute).toContain("<WorkflowProductionWebhookPanel");
    expect(studioRoute).toContain("webhookActivationCommandPath");
  });
});
