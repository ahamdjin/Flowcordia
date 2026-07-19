import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioCredentialReferences,
  createWorkflowStudioCredentialReferencesDraft,
  projectWorkflowStudioCredentialBindings,
} from "../../app/features/flowcordia/workflows/studio/credential-references";
import type { WorkflowStudioNode } from "../../app/features/flowcordia/workflows/studio/presentation";

function httpNode(overrides: Partial<WorkflowStudioNode> = {}): WorkflowStudioNode {
  return {
    id: "notify",
    name: "Notify billing",
    kind: "action",
    operation: "action.http",
    ownership: "visual",
    position: { x: 0, y: 0 },
    configurationKeys: ["method", "url"],
    editableConfiguration: { method: "POST", url: "https://api.example.com" },
    functionId: null,
    inputSchema: null,
    outputSchema: null,
    credentialReferences: [],
    runtime: null,
    codeReference: null,
    ...overrides,
  };
}

describe("Flowcordia Studio credential references", () => {
  it("hydrates visual HTTP references and projects names only", () => {
    const node = httpNode({ credentialReferences: ["billing-api", "crm"] });
    expect(createWorkflowStudioCredentialReferencesDraft(node)).toEqual({
      kind: "editable",
      references: ["billing-api", "crm"],
    });
    expect(projectWorkflowStudioCredentialBindings(node.credentialReferences)).toEqual([
      {
        reference: "billing-api",
        environmentName: "FLOWCORDIA_CREDENTIAL_BILLING_API",
      },
      { reference: "crm", environmentName: "FLOWCORDIA_CREDENTIAL_CRM" },
    ]);
  });

  it("normalizes whitespace and rejects invalid or duplicate names", () => {
    expect(buildWorkflowStudioCredentialReferences([" billing-api "])).toEqual({
      success: true,
      references: ["billing-api"],
    });
    expect(buildWorkflowStudioCredentialReferences(["Billing"])).toMatchObject({
      success: false,
    });
    expect(buildWorkflowStudioCredentialReferences(["billing", "billing"])).toEqual({
      success: false,
      message: 'Credential reference "billing" is duplicated.',
    });
  });

  it("fails closed for non-HTTP, developer-owned, and legacy invalid bindings", () => {
    expect(
      createWorkflowStudioCredentialReferencesDraft(httpNode({ operation: "control.wait" }))
    ).toMatchObject({ kind: "blocked" });
    expect(
      createWorkflowStudioCredentialReferencesDraft(httpNode({ ownership: "developer" }))
    ).toMatchObject({ kind: "blocked" });
    expect(
      createWorkflowStudioCredentialReferencesDraft(
        httpNode({ credentialReferences: ["Legacy_Key"] })
      )
    ).toMatchObject({ kind: "blocked" });
  });

  it("keeps secret values out of Studio source and composes one HTTP-only editor", () => {
    const studioSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );
    const editorSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioCredentialReferencesEditor.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(studioSource).toContain("<WorkflowStudioCredentialReferencesEditor");
    expect(studioSource).toContain('node.operation === "action.http"');
    expect(editorSource).toContain("Studio never requests or displays that");
    expect(editorSource).not.toContain("process.env");
    expect(editorSource).not.toContain("secretValue");
  });
});
