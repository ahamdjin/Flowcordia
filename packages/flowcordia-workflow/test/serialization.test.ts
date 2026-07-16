import { describe, expect, it } from "vitest";

import { cloneWorkflow, parseWorkflowDocument, serializeWorkflow } from "../src/index.js";
import { createValidWorkflow } from "./fixtures.js";

describe("workflow serialization", () => {
  it("round-trips through the validator", () => {
    const workflow = createValidWorkflow();
    const parsed = parseWorkflowDocument(serializeWorkflow(workflow));

    expect(parsed).toEqual({ success: true, workflow, issues: [] });
  });

  it("sorts object keys recursively and ends with a newline", () => {
    const workflow = createValidWorkflow();
    workflow.nodes[0]!.configuration = {
      zebra: true,
      Alpha: "first by code point",
      alpha: { z: 1, a: 2 },
    };

    const serialized = serializeWorkflow(workflow);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.indexOf('"Alpha"')).toBeLessThan(serialized.indexOf('"alpha"'));
    expect(serialized.indexOf('"alpha"')).toBeLessThan(serialized.indexOf('"zebra"'));
    expect(serialized.indexOf('"a": 2')).toBeLessThan(serialized.indexOf('"z": 1'));
    expect(serializeWorkflow(cloneWorkflow(workflow))).toBe(serialized);
  });
});
