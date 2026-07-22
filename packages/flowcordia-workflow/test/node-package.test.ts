import { describe, expect, it } from "vitest";
import {
  parseWorkflowNodePackageManifest,
  serializeWorkflowNodePackageManifest,
  validateWorkflowNodePackageManifest,
  workflowNodePackageDigest,
  type WorkflowNodePackageManifest,
} from "../src/node-package.js";

const objectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

function manifest(): WorkflowNodePackageManifest {
  return {
    schemaVersion: "0.1",
    package: {
      id: "com.acme.crm",
      version: "1.2.3",
      name: "Acme CRM",
      description: "Reviewed Acme CRM capabilities.",
    },
    publisher: {
      id: "acme",
      name: "Acme",
      url: "https://acme.example/",
    },
    operations: [
      {
        id: "contacts.create",
        catalogVersion: 1,
        label: "Create contact",
        description: "Create one reviewed contact through the Acme API.",
        category: "action",
        kind: "action",
        operation: "acme.contacts.create",
        runtime: {
          type: "repository",
          path: "src/flowcordia/contacts.ts",
          exportName: "createContact",
        },
        configurationSchema: objectSchema,
        inputSchema: objectSchema,
        outputSchema: objectSchema,
        capabilities: [
          "structural_preview",
          "live_execution",
          "credential_references",
          "governed_code_generation",
          "network_access",
        ],
        credentials: [
          {
            id: "acme-api",
            label: "Acme API",
            type: "api_key",
            scope: "project_environment",
          },
        ],
        network: { origins: ["https://api.acme.example"] },
      },
    ],
  };
}

describe("workflow node package manifest", () => {
  it("normalizes and accepts one exact reviewed package boundary", () => {
    const result = validateWorkflowNodePackageManifest(manifest());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.manifest.package.id).toBe("com.acme.crm");
    expect(result.manifest.operations[0]).toMatchObject({
      operation: "acme.contacts.create",
      runtime: { path: "src/flowcordia/contacts.ts", exportName: "createContact" },
      network: { origins: ["https://api.acme.example"] },
    });
  });

  it("produces one canonical digest independent of JSON object key order", () => {
    const first = validateWorkflowNodePackageManifest(manifest());
    const reordered = parseWorkflowNodePackageManifest(
      JSON.stringify({
        operations: manifest().operations,
        publisher: manifest().publisher,
        package: manifest().package,
        schemaVersion: "0.1",
      })
    );
    expect(first.success).toBe(true);
    expect(reordered.success).toBe(true);
    if (!first.success || !reordered.success) return;
    expect(serializeWorkflowNodePackageManifest(first.manifest)).toBe(
      serializeWorkflowNodePackageManifest(reordered.manifest)
    );
    expect(workflowNodePackageDigest(first.manifest)).toMatch(/^[0-9a-f]{64}$/);
    expect(workflowNodePackageDigest(first.manifest)).toBe(
      workflowNodePackageDigest(reordered.manifest)
    );
  });

  it("rejects unknown fields, duplicate identities, and unsafe runtime source", () => {
    const value = manifest() as unknown as Record<string, unknown>;
    value.secret = "not allowed";
    const operations = value.operations as Array<Record<string, unknown>>;
    operations.push({
      ...operations[0],
      runtime: { type: "repository", path: "trigger/flowcordia/injected.ts", exportName: "run" },
    });
    const result = validateWorkflowNodePackageManifest(value);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_property", path: ["secret"] }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["operations", 1, "runtime", "path"],
        }),
        expect.objectContaining({ code: "duplicate_id" }),
      ])
    );
  });

  it("requires capabilities to agree with credential and network declarations", () => {
    const value = manifest();
    value.operations[0]!.capabilities = ["structural_preview", "live_execution"];
    const result = validateWorkflowNodePackageManifest(value);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.filter((entry) => entry.code === "capability_mismatch")).toHaveLength(2);
  });

  it.each([
    "http://api.acme.example",
    "https://user:password@api.acme.example",
    "https://api.acme.example/v1",
    "https://api.acme.example?token=value",
    "https://api.acme.example#fragment",
  ])("rejects unsafe network origin %s", (origin) => {
    const value = manifest();
    value.operations[0]!.network = { origins: [origin] };
    const result = validateWorkflowNodePackageManifest(value);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: ["operations", 0, "network", "origins", 0],
        }),
      ])
    );
  });

  it("rejects categories that lie about their workflow node kind", () => {
    const value = manifest();
    value.operations[0]!.category = "trigger";
    const result = validateWorkflowNodePackageManifest(value);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: ["operations", 0, "kind"],
        }),
      ])
    );
  });

  it("returns bounded invalid JSON evidence without attempting partial recovery", () => {
    expect(parseWorkflowNodePackageManifest('{"schemaVersion":')).toEqual({
      success: false,
      issues: [
        {
          code: "invalid_json",
          message: "Node package manifest is not valid JSON.",
          path: [],
        },
      ],
    });
  });
});
