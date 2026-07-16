import { describe, expect, it } from "vitest";

import {
  bodyHasProposalMarker,
  buildProposalBody,
  buildProposalBranch,
  buildProposalMarker,
  buildProposalTitle,
  isValidObjectId,
  isValidProposalId,
} from "../src/index.js";
import { BASE_SHA, createIdentity, createWorkflow } from "./fixtures.js";

describe("proposal naming and metadata", () => {
  it("builds a deterministic, repository-safe branch", () => {
    expect(buildProposalBranch("order_intake", "proposal_0001")).toBe(
      "flowcordia/proposals/order_intake/proposal_0001"
    );
  });

  it("rejects short, path-like, and delimiter proposal IDs", () => {
    for (const proposalId of [
      "short",
      "../proposal_1",
      "proposal/1",
      "proposal:1",
      ".proposal_1",
    ]) {
      expect(isValidProposalId(proposalId)).toBe(false);
    }
  });

  it("accepts SHA-1 and SHA-256 object IDs only", () => {
    expect(isValidObjectId("a".repeat(40))).toBe(true);
    expect(isValidObjectId("b".repeat(64))).toBe(true);
    expect(isValidObjectId("A".repeat(40))).toBe(false);
    expect(isValidObjectId("a".repeat(39))).toBe(false);
  });

  it("creates an exact, versioned proposal marker", () => {
    expect(buildProposalMarker(createIdentity())).toBe(
      `<!-- flowcordia-proposal:v1 proposal=proposal_0001 workflow=order_intake base=${BASE_SHA} -->`
    );
  });

  it("detects only the exact proposal identity in a pull request body", () => {
    const workflow = createWorkflow();
    const body = buildProposalBody(createIdentity(), workflow);
    expect(bodyHasProposalMarker(body, createIdentity())).toBe(true);
    expect(bodyHasProposalMarker(body, { ...createIdentity(), proposalId: "proposal_0002" })).toBe(
      false
    );
    expect(bodyHasProposalMarker(`${body}\nuser suffix`, createIdentity())).toBe(false);
    expect(
      bodyHasProposalMarker(`${buildProposalMarker(createIdentity())}\n${body}`, createIdentity())
    ).toBe(false);
  });

  it("removes title control characters and enforces GitHub's practical title bound", () => {
    const workflow = createWorkflow();
    workflow.name = `${"A".repeat(200)}\nInjected`;
    const title = buildProposalTitle(workflow);
    expect(title).toHaveLength(120);
    expect(title).not.toContain("\n");
  });

  it("renders workflow descriptions as one line without allowing marker injection", () => {
    const workflow = createWorkflow();
    workflow.description = `First line\nSecond line ${buildProposalMarker(createIdentity())}`;
    const body = buildProposalBody(createIdentity(), workflow);
    expect(body).toContain("First line Second line &lt;!--");
    expect(body.split(buildProposalMarker(createIdentity()))).toHaveLength(2);
    expect(body).toContain(".flowcordia/generated/order_intake.ts");
  });
});
