import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FlowcordiaCredentialWriteCommand,
  normalizeFlowcordiaCredentialHeaders,
} from "../../app/features/flowcordia/workflows/credentials/contract";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("Flowcordia credential management", () => {
  it("accepts one strict confirmed command for a reviewed reference", () => {
    const command = {
      operation: "store",
      workflowId: "order_intake",
      nodeId: "send_order",
      reference: "billing-api",
      confirmation: "STORE_FLOWCORDIA_CREDENTIAL",
      headers: [{ name: "Authorization", value: "Bearer secret" }],
    };
    expect(FlowcordiaCredentialWriteCommand.safeParse(command).success).toBe(true);
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

  it("normalizes, sorts, and serializes bounded headers deterministically", () => {
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
      serialized:
        '{"headers":{"authorization":"Bearer secret","x-tenant":"tenant-1"}}',
    });
  });

  it("rejects transport-owned, duplicate, multiline, empty, and excessive headers", () => {
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

  it("keeps environment reads status-only and values write-only", () => {
    const query = source(
      "../../app/features/flowcordia/workflows/credentials/query.server.ts"
    );
    expect(query).toContain("select: { isSecret: true, version: true }");
    expect(query).not.toContain("getSecretStore");
    expect(query).not.toContain("value: true");

    const commands = source(
      "../../app/features/flowcordia/workflows/credentials/commands.server.ts"
    );
    expect(commands).toContain("queryWorkflowStudio");
    expect(commands).toContain("node.credentialReferences.includes");
    expect(commands).toContain("EnvironmentVariablesRepository");
    expect(commands).toContain("isSecret: true");
    expect(commands).not.toContain("getEnvironmentVariables(");
    expect(commands).not.toContain("getEnvironmentWithRedactedSecrets(");
  });

  it("never hydrates stored values into the Studio manager", () => {
    const manager = source(
      "../../app/features/flowcordia/workflows/credentials/WorkflowStudioCredentialManager.tsx"
    );
    expect(manager).toContain('type="password"');
    expect(manager).toContain('autoComplete="new-password"');
    expect(manager).toContain("Values are write-only");
    expect(manager).not.toContain("process.env");
    expect(manager).not.toContain("defaultValue=");
    expect(manager).not.toContain("getEnvironmentVariables");
  });
});
