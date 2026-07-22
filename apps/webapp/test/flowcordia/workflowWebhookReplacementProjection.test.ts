import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia webhook replacement projection", () => {
  it("selects only the current endpoint generation", () => {
    const query = source("../../app/features/flowcordia/workflows/webhook/binding-query.server.ts");
    expect(query).toContain("supersededAt: null");
    expect(query).toContain("generation: true");
    expect(query).toContain("replacesEndpoint");
    expect(query).toContain("replacesPublicId");
    expect(query).not.toContain("replacementCreatedByUserId: true");
  });

  it("renders explicit replacement before normal exact activation", () => {
    const panel = source(
      "../../app/features/flowcordia/workflows/webhook/WorkflowProductionWebhookPanel.tsx"
    );
    const studioRoute = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );

    expect(panel).toContain("FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION");
    expect(panel).toContain("Create replacement");
    expect(panel).toContain("replacementCommandPath");
    expect(panel).toContain("binding.generation");
    expect(panel).toContain("binding.replacesPublicId");
    expect(panel).not.toContain("replacementCreatedByUserId");
    expect(studioRoute).toContain("webhookReplacementCommandPath");
    expect(studioRoute).toContain("replacementCommandPath={webhookReplacementCommandPath}");
    expect(studioRoute).toContain("canReplace={data.canReplaceWebhooks}");
  });
});
