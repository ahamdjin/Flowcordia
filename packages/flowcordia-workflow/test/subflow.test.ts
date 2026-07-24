import { describe, expect, it } from "vitest";
import { flowcordiaSubflowTaskId, parseFlowcordiaSubflowConfiguration } from "../src/subflow.js";

describe("Flowcordia subflow configuration", () => {
  it("normalizes single and bounded batch invocation", () => {
    expect(
      parseFlowcordiaSubflowConfiguration({ workflowId: " child-order ", mode: "single" })
    ).toEqual({
      success: true,
      configuration: { workflowId: "child-order", mode: "single" },
    });
    expect(
      parseFlowcordiaSubflowConfiguration({
        workflowId: "child-order",
        mode: "batch",
        itemsPath: " orders ",
        maxItems: 25,
      })
    ).toEqual({
      success: true,
      configuration: {
        workflowId: "child-order",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 25,
      },
    });
    expect(flowcordiaSubflowTaskId("child-order")).toBe("flowcordia-child-order");
  });

  it("rejects unbounded, malformed, and ambiguous configuration", () => {
    expect(
      parseFlowcordiaSubflowConfiguration({
        workflowId: "child-order",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 101,
      }).success
    ).toBe(false);
    expect(
      parseFlowcordiaSubflowConfiguration({ workflowId: "child/order", mode: "single" }).success
    ).toBe(false);
    expect(
      parseFlowcordiaSubflowConfiguration({
        workflowId: "child-order",
        mode: "single",
        maxItems: 5,
      }).success
    ).toBe(false);
    expect(
      parseFlowcordiaSubflowConfiguration({
        workflowId: "child-order",
        mode: "batch",
        itemsPath: "orders..items",
        maxItems: 5,
      }).success
    ).toBe(false);
    expect(
      parseFlowcordiaSubflowConfiguration({
        workflowId: "child-order",
        mode: "batch",
        itemsPath: "orders.__proto__",
        maxItems: 5,
      }).success
    ).toBe(false);
  });
});
