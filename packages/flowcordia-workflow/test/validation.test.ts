import { describe, expect, it } from "vitest";

import { formatWorkflowIssuePath, parseWorkflowDocument, validateWorkflow } from "../src/index.js";
import { createValidWorkflow } from "./fixtures.js";

describe("validateWorkflow", () => {
  it("accepts a valid workflow", () => {
    const workflow = createValidWorkflow();

    expect(validateWorkflow(workflow)).toEqual({ success: true, workflow, issues: [] });
  });

  it("reports duplicate IDs, duplicate connections, and missing endpoints", () => {
    const workflow = createValidWorkflow();
    workflow.nodes.push({ ...workflow.nodes[0]!, position: { x: 20, y: 20 } });
    workflow.edges.push(
      { ...workflow.edges[0]!, id: "duplicate_route" },
      { id: "missing_route", source: "missing_node", target: "notify_team" }
    );

    const result = validateWorkflow(workflow);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate_id", "duplicate_connection", "missing_reference"])
    );
  });

  it("rejects unknown properties and keeps entity-aware paths", () => {
    const workflow = createValidWorkflow() as unknown as Record<string, unknown>;
    const nodes = workflow.nodes as Array<Record<string, unknown>>;
    nodes[1]!.surprise = true;

    const result = validateWorkflow(workflow);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toContainEqual({
      code: "unknown_property",
      message: 'Unknown property "surprise".',
      path: ["nodes", 1, "surprise"],
      entity: { type: "node", id: "notify_team" },
    });
    expect(formatWorkflowIssuePath(["nodes", 1, "surprise-value"])).toBe(
      '$.nodes[1]["surprise-value"]'
    );
  });

  it("rejects values that cannot be represented as JSON", () => {
    const workflow = createValidWorkflow() as unknown as Record<string, unknown>;
    const nodes = workflow.nodes as Array<Record<string, unknown>>;
    nodes[0]!.configuration = { invalid: undefined };

    const result = validateWorkflow(workflow);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_type",
        path: ["nodes", 0, "configuration", "invalid"],
      })
    );
  });
});

describe("parseWorkflowDocument", () => {
  it("returns a structured issue for malformed JSON", () => {
    const result = parseWorkflowDocument('{"schemaVersion":');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]).toEqual(
      expect.objectContaining({ code: "invalid_json", path: [], entity: { type: "workflow" } })
    );
  });
});

describe("Ajv-backed workflow contract", () => {
  it("preserves schema and domain policy issue identities", () => {
    const workflow = createValidWorkflow() as unknown as Record<string, unknown>;
    workflow.schemaVersion = "9.9";
    workflow.labels = ["beta", "beta"];
    const nodes = workflow.nodes as Array<Record<string, unknown>>;
    nodes[0]!.runtime = {
      retry: { minTimeoutMs: 5000, maxTimeoutMs: 1000 },
    };
    const edges = workflow.edges as Array<Record<string, unknown>>;
    edges[0]!.sourceHandle = "";

    const result = validateWorkflow(workflow);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: ["schemaVersion"],
          message: 'Unsupported schema version "9.9".',
        }),
        expect.objectContaining({ code: "duplicate_id", path: ["labels"] }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["nodes", 0, "runtime", "retry", "maxTimeoutMs"],
        }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["edges", 0, "sourceHandle"],
        }),
      ])
    );
  });

  it("fails closed for circular and non-plain configuration values", () => {
    const circular = createValidWorkflow() as unknown as Record<string, unknown>;
    const circularNodes = circular.nodes as Array<Record<string, unknown>>;
    const configuration: Record<string, unknown> = {};
    configuration.self = configuration;
    circularNodes[0]!.configuration = configuration;

    expect(validateWorkflow(circular)).toMatchObject({
      success: false,
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: ["nodes", 0, "configuration", "self"],
        }),
      ],
    });

    const nonPlain = createValidWorkflow() as unknown as Record<string, unknown>;
    const nonPlainNodes = nonPlain.nodes as Array<Record<string, unknown>>;
    nonPlainNodes[0]!.configuration = { createdAt: new Date(0) };
    expect(validateWorkflow(nonPlain)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_type",
          path: ["nodes", 0, "configuration", "createdAt"],
        }),
      ]),
    });
  });
});
