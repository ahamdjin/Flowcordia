import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia webhook operations projection", () => {
  it("projects only bounded server-hashed delivery evidence", () => {
    const query = source("../../app/features/flowcordia/workflows/webhook/binding-query.server.ts");
    expect(query).toContain('createHash("sha256")');
    expect(query).toContain("webhookEndpointId");
    expect(query).toContain("take: 5");
    expect(query).toContain('status === "TRIGGERED"');
    expect(query).toContain('status === "FAILED"');
    expect(query).toContain("deliveryReference(endpoint.id, delivery.deliveryId)");
    expect(query).toContain("reference:");
    expect(query).not.toContain("payloadHash: true");
    expect(query).not.toContain("runFriendlyId: true");
    expect(query).not.toContain("leaseToken: true");
  });

  it("renders permanent revocation and recent outcomes without secret or run controls", () => {
    const panel = source(
      "../../app/features/flowcordia/workflows/webhook/WorkflowProductionWebhookPanel.tsx"
    );
    const studioRoute = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );

    expect(panel).toContain("FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION");
    expect(panel).toContain('variant="danger/small"');
    expect(panel).toContain("Revoke endpoint");
    expect(panel).toContain("recentDeliveries");
    expect(panel).toContain("binding.revocation");
    expect(panel).not.toContain("runFriendlyId");
    expect(panel).not.toContain("payloadHash");
    expect(panel).not.toContain("secret");
    expect(studioRoute).toContain("webhookRevocationCommandPath");
    expect(studioRoute).toContain("revocationCommandPath={webhookRevocationCommandPath}");
    expect(studioRoute).toContain("canRevoke={data.canRevokeWebhooks}");
  });
});
