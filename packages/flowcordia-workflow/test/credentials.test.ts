import { describe, expect, it } from "vitest";
import {
  flowcordiaCredentialEnvironmentName,
  isFlowcordiaCredentialReference,
  validateFlowcordiaCredentialReferences,
} from "../src/index.js";

describe("Flowcordia credential references", () => {
  it("accepts a bounded lowercase slug and derives one deterministic environment key", () => {
    expect(isFlowcordiaCredentialReference("billing-api")).toBe(true);
    expect(flowcordiaCredentialEnvironmentName("billing-api")).toBe(
      "FLOWCORDIA_CREDENTIAL_BILLING_API"
    );
    expect(validateFlowcordiaCredentialReferences(["billing-api", "crm"])).toEqual([]);
  });

  it("rejects ambiguous, oversized, duplicate, and excessive references", () => {
    for (const reference of [
      "",
      "Billing",
      "billing_api",
      "billing--api",
      "1billing",
      `${"a".repeat(65)}`,
    ]) {
      expect(isFlowcordiaCredentialReference(reference)).toBe(false);
    }
    expect(validateFlowcordiaCredentialReferences(["billing", "billing"])).toEqual([
      {
        code: "duplicate_reference",
        index: 1,
        message: 'Credential reference "billing" is duplicated.',
      },
    ]);
    expect(
      validateFlowcordiaCredentialReferences(
        Array.from({ length: 17 }, (_, index) => `credential-${index}`)
      )[0]
    ).toMatchObject({ code: "too_many_references" });
  });
});
