import { describe, expect, it } from "vitest";
import { sameFlowcordiaProposalRepositoryScope, sameFlowcordiaRepositoryScope } from "./scope";

const base = {
  tenantId: "org_1",
  projectId: "project_1",
  installationId: 12345,
  repository: { owner: "flowcordia", name: "workflows", branch: "main" },
};

describe("Flowcordia GitHub repository scope", () => {
  it("keeps ordinary repository access pinned to the configured branch", () => {
    expect(sameFlowcordiaRepositoryScope(base, base)).toBe(true);
    expect(
      sameFlowcordiaRepositoryScope(base, {
        ...base,
        repository: { ...base.repository, branch: "feature/untrusted" },
      })
    ).toBe(false);
  });

  it("allows only canonical proposal branches for proposal operations", () => {
    expect(
      sameFlowcordiaProposalRepositoryScope(base, {
        ...base,
        repository: {
          ...base.repository,
          branch: "flowcordia/proposals/manual_echo/studio-v2-workspace123-v3",
        },
      })
    ).toBe(true);
    for (const branch of [
      "feature/untrusted",
      "flowcordia/proposals/manual_echo",
      "flowcordia/proposals/../proposal_123456",
      "flowcordia/proposals/manual_echo/short",
      "flowcordia/proposals/manual_echo/proposal_123456/extra",
    ]) {
      expect(
        sameFlowcordiaProposalRepositoryScope(base, {
          ...base,
          repository: { ...base.repository, branch },
        })
      ).toBe(false);
    }
  });

  it("never permits a proposal branch to change repository identity", () => {
    expect(
      sameFlowcordiaProposalRepositoryScope(base, {
        ...base,
        repository: {
          owner: "attacker",
          name: base.repository.name,
          branch: "flowcordia/proposals/manual_echo/proposal_123456",
        },
      })
    ).toBe(false);
  });
});
