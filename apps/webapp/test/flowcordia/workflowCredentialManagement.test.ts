import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateFlowcordiaCredentialBinding } from "../../app/features/flowcordia/workflows/credentials/binding";
import {
  credentialEnvironmentName,
  FlowcordiaCredentialWriteCommand,
  normalizeFlowcordiaCredentialHeaders,
  normalizeFlowcordiaWebhookSecret,
} from "../../app/features/flowcordia/workflows/credentials/contract";
import {
  buildWorkflowStudioCredentialReferences,
  createWorkflowStudioCredentialReferencesDraft,
} from "../../app/features/flowcordia/workflows/studio/credential-references";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function graph() {
  return {
    workflowId: "order_intake",
    nodes: [
      {
        id: "send_order",
        operation: "action.http",
        ownership: "visual",
        credentialReferences: ["billing-api"],
      },
      {
        id: "orders_webhook",
        operation: "trigger.webhook",
        ownership: "visual",
        credentialReferences: ["orders-webhook"],
      },
      {
        id: "developer_call",
        operation: "code.task",
        ownership: "developer",
        credentialReferences: [],
      },
    ],
  } as unknown as Parameters<typeof validateFlowcordiaCredentialBinding>[0]["graph"];
}

function conflictingGraph() {
  const value = graph();
  value.nodes[1]!.credentialReferences = ["billing-api"];
  return value;
}

describe("Flowcordia credential management", () => {
  it("keeps the existing HTTP command strict and backward compatible", () => {
    const command = {
      operation: "store",
      workflowId: "order_intake",
      nodeId: "send_order",
      reference: "billing-api",
      confirmation: "STORE_FLOWCORDIA_CREDENTIAL",
      headers: [{ name: "Authorization", value: "Bearer secret" }],
    };
    const parsed = FlowcordiaCredentialWriteCommand.safeParse(command);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.credentialType).toBe("http_headers");
    expect(FlowcordiaCredentialWriteCommand.safeParse({ ...command, extra: true }).success).toBe(
      false
    );
    expect(
      FlowcordiaCredentialWriteCommand.safeParse({ ...command, confirmation: "STORE" }).success
    ).toBe(false);
    expect(
      FlowcordiaCredentialWriteCommand.safeParse({ ...command, reference: "billing_api" }).success
    ).toBe(false);
  });

  it("accepts only a discriminated write-only webhook HMAC command", () => {
    const command = {
      operation: "store",
      credentialType: "webhook_hmac",
      workflowId: "order_intake",
      nodeId: "orders_webhook",
      reference: "orders-webhook",
      confirmation: "STORE_FLOWCORDIA_CREDENTIAL",
      secret: "s".repeat(32),
    };
    expect(FlowcordiaCredentialWriteCommand.safeParse(command).success).toBe(true);
    expect(
      FlowcordiaCredentialWriteCommand.safeParse({ ...command, credentialType: "http_headers" })
        .success
    ).toBe(false);
    expect(FlowcordiaCredentialWriteCommand.safeParse({ ...command, headers: [] }).success).toBe(
      false
    );
    expect(FlowcordiaCredentialWriteCommand.safeParse({ ...command, extra: true }).success).toBe(
      false
    );
  });

  it("preserves the deployed HTTP serialization contract", () => {
    expect(
      normalizeFlowcordiaCredentialHeaders([
        { name: "X-Tenant", value: "tenant-1" },
        { name: " Authorization ", value: "Bearer secret" },
      ])
    ).toEqual({
      success: true,
      headers: [
        { name: "authorization", value: "Bearer secret" },
        { name: "x-tenant", value: "tenant-1" },
      ],
      serialized: '{"headers":{"authorization":"Bearer secret","x-tenant":"tenant-1"}}',
    });
  });

  it("uses separate deterministic environment namespaces by credential type", () => {
    expect(credentialEnvironmentName("billing-api", "http_headers")).toBe(
      "FLOWCORDIA_CREDENTIAL_BILLING_API"
    );
    expect(credentialEnvironmentName("billing-api", "webhook_hmac")).toBe(
      "FLOWCORDIA_WEBHOOK_HMAC_BILLING_API"
    );
  });

  it("rejects transport-owned, duplicate, multiline, empty, and excessive HTTP headers", () => {
    expect(normalizeFlowcordiaCredentialHeaders([])).toMatchObject({ success: false });
    expect(
      normalizeFlowcordiaCredentialHeaders([{ name: "host", value: "example.com" }])
    ).toMatchObject({ success: false });
    expect(
      normalizeFlowcordiaCredentialHeaders([
        { name: "Authorization", value: "one" },
        { name: "authorization", value: "two" },
      ])
    ).toMatchObject({ success: false });
    expect(
      normalizeFlowcordiaCredentialHeaders([{ name: "authorization", value: "a\r\nb" }])
    ).toMatchObject({ success: false });
    expect(
      normalizeFlowcordiaCredentialHeaders(
        Array.from({ length: 33 }, (_, index) => ({ name: `x-${index}`, value: "value" }))
      )
    ).toMatchObject({ success: false });
  });

  it("preserves exact webhook secret bytes while enforcing safe bounds", () => {
    expect(normalizeFlowcordiaWebhookSecret("s".repeat(32))).toEqual({
      success: true,
      serialized: `{"type":"webhook_hmac","secret":"${"s".repeat(32)}"}`,
      byteLength: 32,
    });
    expect(normalizeFlowcordiaWebhookSecret(" short but not trimmed ")).toMatchObject({
      success: false,
    });
    expect(normalizeFlowcordiaWebhookSecret(`${"s".repeat(32)}\n`)).toMatchObject({
      success: false,
    });
    expect(normalizeFlowcordiaWebhookSecret("é".repeat(16))).toMatchObject({
      success: true,
      byteLength: 32,
    });
  });

  it("requires exact workflow, node, credential type, and bound reference ownership", () => {
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "order_intake",
        nodeId: "send_order",
        reference: "billing-api",
        credentialType: "http_headers",
      })
    ).toEqual({ success: true, credentialType: "http_headers" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "order_intake",
        nodeId: "orders_webhook",
        reference: "orders-webhook",
        credentialType: "webhook_hmac",
      })
    ).toEqual({ success: true, credentialType: "webhook_hmac" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "other_workflow",
        nodeId: "send_order",
        reference: "billing-api",
        credentialType: "http_headers",
      })
    ).toMatchObject({ success: false, code: "workflow_mismatch" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "order_intake",
        nodeId: "missing_node",
        reference: "billing-api",
        credentialType: "http_headers",
      })
    ).toMatchObject({ success: false, code: "node_not_found" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "order_intake",
        nodeId: "developer_call",
        reference: "billing-api",
        credentialType: "http_headers",
      })
    ).toMatchObject({ success: false, code: "node_not_supported" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: graph(),
        workflowId: "order_intake",
        nodeId: "orders_webhook",
        reference: "orders-webhook",
        credentialType: "http_headers",
      })
    ).toMatchObject({ success: false, code: "credential_type_mismatch" });
    expect(
      validateFlowcordiaCredentialBinding({
        graph: conflictingGraph(),
        workflowId: "order_intake",
        nodeId: "orders_webhook",
        reference: "billing-api",
        credentialType: "webhook_hmac",
      })
    ).toMatchObject({ success: false, code: "reference_type_conflict" });
  });

  it("allows one visual webhook reference and rejects multiple references", () => {
    const webhookNode = graph().nodes[1]!;
    expect(createWorkflowStudioCredentialReferencesDraft(webhookNode)).toEqual({
      kind: "editable",
      references: ["orders-webhook"],
    });
    expect(buildWorkflowStudioCredentialReferences(["orders-webhook"], "trigger.webhook")).toEqual({
      success: true,
      references: ["orders-webhook"],
    });
    expect(
      buildWorkflowStudioCredentialReferences(
        ["orders-webhook", "second-webhook"],
        "trigger.webhook"
      )
    ).toMatchObject({ success: false });
  });

  it("keeps environment reads type-and-status-only and values write-only", () => {
    const query = source("../../app/features/flowcordia/workflows/credentials/query.server.ts");
    expect(query).toContain("select: { isSecret: true, version: true }");
    expect(query).toContain("projectedEnvironmentName");
    expect(query).toContain(
      "credentialEnvironmentName(reference.reference, reference.credentialType)"
    );
    expect(query).toContain('reference.credentialType === "conflict"');
    expect(query).not.toContain("getSecretStore");
    expect(query).not.toContain("value: true");

    const commands = source(
      "../../app/features/flowcordia/workflows/credentials/commands.server.ts"
    );
    expect(commands).toContain("queryWorkflowStudio");
    expect(commands).toContain("validateFlowcordiaCredentialBinding");
    expect(commands).toContain("normalizeFlowcordiaWebhookSecret");
    expect(commands).toContain("credentialEnvironmentName(");
    expect(commands).toContain("binding.credentialType");
    expect(commands).toContain("EnvironmentVariablesRepository");
    expect(commands).toContain("isSecret: true");
    expect(commands).not.toContain("getEnvironmentVariables(");
    expect(commands).not.toContain("getEnvironmentWithRedactedSecrets(");
  });

  it("integrates HTTP and webhook credentials through server-owned Studio identity", () => {
    const route = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );
    expect(route).toContain("queryFlowcordiaCredentialWorkspace");
    expect(route).toContain("resolveFlowcordiaCredentialEnvironment");
    expect(route).toContain("canReadCredentials");
    expect(route).toContain("canManageCredentials");
    expect(route).toContain("credentialCommandPath");

    const resource = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflow-credentials/route.ts"
    );
    expect(resource).toContain('ability.can("write", { type: "envvars"');

    const studio = source("../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx");
    expect(studio).toContain("supportsManagedCredentialNode");
    expect(studio).toContain("WorkflowStudioCredentialManager");
    expect(studio).toContain("credentialWorkspace.bindings");
    expect(studio).toContain("canManageCredentials");

    const references = source(
      "../../app/features/flowcordia/workflows/studio/WorkflowStudioCredentialReferencesEditor.tsx"
    );
    expect(references).toContain(
      "projectWorkflowStudioCredentialBindings(references, node.operation)"
    );
  });

  it("never hydrates stored values into the Studio manager", () => {
    const manager = source(
      "../../app/features/flowcordia/workflows/credentials/WorkflowStudioCredentialManager.tsx"
    );
    expect(manager).toContain('aria-label="Webhook HMAC secret"');
    expect(manager).toContain('type="password"');
    expect(manager).toContain('autoComplete="new-password"');
    expect(manager).toContain("Values are write-only");
    expect(manager).toContain("Use distinct HTTP and webhook references");
    expect(manager).not.toContain("process.env");
    expect(manager).not.toContain("defaultValue=");
    expect(manager).not.toContain("getEnvironmentVariables");
  });
});
