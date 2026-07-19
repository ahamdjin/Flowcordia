import { describe, expect, it } from "vitest";
import { WorkflowCredentialReferencesCommand } from "../../app/features/flowcordia/workflows/drafts/command-contract";

describe("Flowcordia credential reference command contract", () => {
  it("accepts bounded reviewed references", () => {
    expect(WorkflowCredentialReferencesCommand.parse(["billing-api", "crm"])).toEqual([
      "billing-api",
      "crm",
    ]);
  });

  it("rejects invalid, duplicate, excessive, and unknown credential command data", () => {
    for (const candidate of [
      ["Billing"],
      ["billing_api"],
      ["billing", "billing"],
      Array.from({ length: 17 }, (_, index) => `credential-${index}`),
    ]) {
      expect(WorkflowCredentialReferencesCommand.safeParse(candidate).success).toBe(false);
    }
  });
});
