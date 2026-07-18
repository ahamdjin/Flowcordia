import { describe, expect, it } from "vitest";
import {
  defaultFlowcordiaProposalGovernanceProfile,
  effectiveFlowcordiaProposalPolicy,
  flowcordiaProposalGovernanceProfileDigest,
  parseFlowcordiaProposalGovernanceProfile,
} from "../src/index.js";

describe("Flowcordia proposal governance profile", () => {
  it("normalizes bounded checks and reviewer IDs deterministically", () => {
    const result = parseFlowcordiaProposalGovernanceProfile({
      schemaVersion: "0.1",
      minimumApprovals: 2,
      requiredCheckNames: [" Security ", "PR Checks"],
      requiredReviewerIds: ["202", "201"],
      allowedReviewerIds: ["203", "201", "202"],
    });

    expect(result).toEqual({
      success: true,
      profile: {
        schemaVersion: "0.1",
        minimumApprovals: 2,
        requiredCheckNames: ["PR Checks", "Security"],
        requiredReviewerIds: ["201", "202"],
        allowedReviewerIds: ["201", "202", "203"],
      },
      issues: [],
    });
  });

  it("keeps the enterprise floor immutable in the effective policy", () => {
    const profile = {
      ...defaultFlowcordiaProposalGovernanceProfile(),
      minimumApprovals: 3,
      requiredCheckNames: ["PR Checks"],
    };
    expect(effectiveFlowcordiaProposalPolicy(profile)).toEqual({
      minimumApprovals: 3,
      requiredCheckNames: ["PR Checks"],
      requiredReviewerIds: [],
      requireCurrentHeadApprovals: true,
      allowSelfApproval: false,
      blockChangesRequested: true,
    });
  });

  it("creates a deterministic full-profile digest", () => {
    const profile = defaultFlowcordiaProposalGovernanceProfile();
    expect(flowcordiaProposalGovernanceProfileDigest(profile)).toMatch(/^[0-9a-f]{64}$/);
    expect(flowcordiaProposalGovernanceProfileDigest({ ...profile })).toBe(
      flowcordiaProposalGovernanceProfileDigest(profile)
    );
    expect(
      flowcordiaProposalGovernanceProfileDigest({ ...profile, minimumApprovals: 2 })
    ).not.toBe(flowcordiaProposalGovernanceProfileDigest(profile));
  });

  it("rejects unknown, weakening, duplicated, and impossible configuration", () => {
    expect(
      parseFlowcordiaProposalGovernanceProfile({
        ...defaultFlowcordiaProposalGovernanceProfile(),
        allowSelfApproval: true,
      })
    ).toMatchObject({
      success: false,
      issues: ['Unknown proposal governance property "allowSelfApproval".'],
    });
    expect(
      parseFlowcordiaProposalGovernanceProfile({
        ...defaultFlowcordiaProposalGovernanceProfile(),
        minimumApprovals: 0,
      })
    ).toMatchObject({ success: false });
    expect(
      parseFlowcordiaProposalGovernanceProfile({
        ...defaultFlowcordiaProposalGovernanceProfile(),
        requiredCheckNames: ["PR Checks", "PR Checks"],
      })
    ).toMatchObject({
      success: false,
      issues: ["Required check names must not contain duplicates."],
    });
    expect(
      parseFlowcordiaProposalGovernanceProfile({
        ...defaultFlowcordiaProposalGovernanceProfile(),
        minimumApprovals: 2,
        allowedReviewerIds: ["201"],
      })
    ).toMatchObject({
      success: false,
      issues: ["Minimum approvals cannot exceed the allowed reviewer count."],
    });
  });
});
