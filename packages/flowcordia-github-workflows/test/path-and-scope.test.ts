import { describe, expect, it } from "vitest";

import {
  buildWorkflowCommitMessage,
  buildWorkflowPath,
  normalizeWorkflowRoot,
  validateAccessScope,
  validateMutationContext,
  validateRevision,
} from "../src/index.js";
import { createScope } from "./fixtures.js";

describe("repository path policy", () => {
  it("builds a deterministic human-readable workflow path", () => {
    expect(buildWorkflowPath("order_intake")).toBe(".flowcordia/workflows/order_intake.json");
    expect(buildWorkflowPath("order_intake", "automation/flowcordia")).toBe(
      "automation/flowcordia/order_intake.json"
    );
  });

  it("rejects traversal, absolute paths, and invalid workflow IDs", () => {
    expect(() => normalizeWorkflowRoot("../workflows")).toThrow(/unsafe/);
    expect(() => normalizeWorkflowRoot("/workflows")).toThrow(/relative/);
    expect(() => buildWorkflowPath("../../secrets")).toThrow(/invalid format/);
    expect(() => buildWorkflowPath("Order Intake")).toThrow(/invalid format/);
  });
});

describe("access and audit input", () => {
  it("accepts an installation-scoped repository target", () => {
    expect(validateAccessScope(createScope())).toEqual([]);
    expect(validateRevision("refs/pull/42/head")).toBeUndefined();
    expect(
      validateMutationContext({ actorId: "user_42", correlationId: "request:abc-123" })
    ).toEqual([]);
  });

  it("rejects unsafe branches and commit-message injection", () => {
    const scope = createScope();
    scope.repository.branch = "main..production";

    expect(validateAccessScope(scope)).toContain("Repository branch is not a valid Git ref name.");
    expect(
      validateMutationContext({ actorId: "user\nadmin", correlationId: "request_1" })
    ).toContain("Actor ID has an invalid format.");
    expect(() =>
      buildWorkflowCommitMessage("update", "order_intake", {
        actorId: "user_1",
        correlationId: "request_1",
        reason: "approved\nInjected-Trailer: true",
      })
    ).toThrow(/single line/);
  });

  it("creates an auditable commit message without tenant secrets", () => {
    const message = buildWorkflowCommitMessage("update", "order_intake", {
      actorId: "user_42",
      correlationId: "request_abc",
      reason: "Approved workflow change",
    });

    expect(message).toBe(
      "flowcordia: update workflow order_intake\n\n" +
        "Approved workflow change\n\n" +
        "Flowcordia-Actor: user_42\n" +
        "Flowcordia-Correlation: request_abc\n"
    );
  });
});
