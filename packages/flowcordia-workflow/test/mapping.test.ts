import { describe, expect, it } from "vitest";
import {
  applyFlowcordiaMapping,
  parseFlowcordiaMappingConfiguration,
} from "../src/index.js";

describe("Flowcordia data mapping", () => {
  it("maps source paths and scalar literals into deterministic nested output", () => {
    const parsed = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [
        { target: "customer.email", source: "contact.email", required: true },
        { target: "customer.plan", value: "pro" },
        { target: "firstItem", source: "items.0" },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      applyFlowcordiaMapping(parsed.configuration, {
        contact: { email: "person@example.com" },
        items: [{ id: "item_1" }],
      })
    ).toEqual({
      success: true,
      value: {
        customer: { email: "person@example.com", plan: "pro" },
        firstItem: { id: "item_1" },
      },
    });
  });

  it("merges object input without mutating it", () => {
    const input = { customer: { id: "cus_1" }, keep: true };
    const parsed = parseFlowcordiaMappingConfiguration({
      mode: "merge",
      entries: [{ target: "customer.email", source: "email", required: true }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(applyFlowcordiaMapping(parsed.configuration, { ...input, email: "a@example.com" })).toEqual({
      success: true,
      value: {
        customer: { id: "cus_1", email: "a@example.com" },
        keep: true,
        email: "a@example.com",
      },
    });
    expect(input).toEqual({ customer: { id: "cus_1" }, keep: true });
  });

  it("distinguishes optional and required missing sources", () => {
    const optional = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [{ target: "customer.email", source: "email" }],
    });
    const required = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [{ target: "customer.email", source: "email", required: true }],
    });
    expect(optional.success).toBe(true);
    expect(required.success).toBe(true);
    if (!optional.success || !required.success) return;
    expect(applyFlowcordiaMapping(optional.configuration, {})).toEqual({ success: true, value: {} });
    expect(applyFlowcordiaMapping(required.configuration, {})).toEqual({
      success: false,
      message: 'Required mapping source "email" is unavailable.',
    });
  });

  it("rejects prototype paths, target conflicts, ambiguous entries, and oversized maps", () => {
    const unsafe = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [{ target: "customer.__proto__.admin", value: true }],
    });
    const conflicting = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [
        { target: "customer", source: "customer" },
        { target: "customer.email", source: "email" },
      ],
    });
    const ambiguous = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: [{ target: "customer", source: "customer", value: null }],
    });
    const oversized = parseFlowcordiaMappingConfiguration({
      mode: "replace",
      entries: Array.from({ length: 65 }, (_, index) => ({ target: `field_${index}`, value: index })),
    });
    expect(unsafe).toMatchObject({ success: false, issues: [expect.objectContaining({ code: "unsafe_path" })] });
    expect(conflicting).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "conflicting_target" })],
    });
    expect(ambiguous).toMatchObject({ success: false, issues: [expect.objectContaining({ code: "invalid_entry" })] });
    expect(oversized).toMatchObject({ success: false, issues: [expect.objectContaining({ code: "invalid_entries" })] });
  });

  it("requires object input for merge mode", () => {
    const parsed = parseFlowcordiaMappingConfiguration({
      mode: "merge",
      entries: [{ target: "value", source: "" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(applyFlowcordiaMapping(parsed.configuration, "text")).toEqual({
      success: false,
      message: "Merge mapping requires an object input.",
    });
  });
});
