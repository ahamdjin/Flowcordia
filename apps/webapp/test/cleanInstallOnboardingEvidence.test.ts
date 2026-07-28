import { describe, expect, it } from "vitest";
import {
  assembleFlowcordiaCleanInstallOnboardingEvidence,
  FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS,
  parseFlowcordiaCleanInstallOnboardingEvidence,
} from "../app/features/flowcordia/operations/clean-install-onboarding";

const sha = "0123456789abcdef0123456789abcdef01234567";
const digest = "0123456789abcdef".repeat(4);

function observations() {
  const startedAt = "2026-07-29T00:00:00.000Z";
  return {
    schemaVersion: "0.1",
    kind: "flowcordia-clean-install-onboarding-observations",
    workspaceId: "012345abcdef",
    startedAt,
    completedAt: "2026-07-29T00:14:00.000Z",
    release: {
      releaseId: "flowcordia-0.1.0-rc.2",
      version: "0.1.0-rc.2",
      applicationCommitSha: sha,
      imageDigest: digest,
      manifestSha256: digest,
      publicationEvidenceSha256: digest,
    },
    fixture: {
      githubAppIdSha256: digest,
      githubInstallationIdSha256: digest,
      referenceRepositorySha256: digest,
      referenceBranchSha256: digest,
      referenceCommitSha: sha,
      secondUserEmailSha256: digest,
    },
    deployment: {
      projectRefSha256: digest,
      deploymentVersionSha256: digest,
      sourceCommitSha: sha,
    },
    journey: FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS.map((key, index) => ({
      key,
      state: "READY" as const,
      observedAt: new Date(Date.parse(startedAt) + index * 60_000).toISOString(),
    })),
    teardown: {
      containersAbsent: true as const,
      networksAbsent: true as const,
      volumesAbsent: true as const,
      browserStateAbsent: true as const,
      mailboxAbsent: true as const,
      temporaryCredentialsAbsent: true as const,
    },
  };
}

describe("clean-install onboarding evidence", () => {
  it("assembles and verifies one exact READY journey", () => {
    const evidence = assembleFlowcordiaCleanInstallOnboardingEvidence({
      observations: observations(),
      checkedAt: "2026-07-29T00:15:00.000Z",
      repository: "ahamdjin/flowcordia",
      runId: "123456",
      runAttempt: 1,
      sourceCommitSha: sha,
    });

    expect(evidence.state).toBe("READY");
    expect(evidence.journey.map((step) => step.key)).toEqual(
      FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS
    );
    expect(parseFlowcordiaCleanInstallOnboardingEvidence(evidence)).toEqual(evidence);
  });

  it("rejects missing or reordered user-visible steps", () => {
    const value = observations();
    value.journey = value.journey.slice().reverse();

    expect(() =>
      assembleFlowcordiaCleanInstallOnboardingEvidence({
        observations: value,
        checkedAt: "2026-07-29T00:15:00.000Z",
        repository: "ahamdjin/flowcordia",
        runId: "123456",
        runAttempt: 1,
        sourceCommitSha: sha,
      })
    ).toThrow(/journey/i);
  });

  it("rejects incomplete teardown proof", () => {
    const value = observations() as ReturnType<typeof observations> & {
      teardown: Record<string, boolean>;
    };
    value.teardown.mailboxAbsent = false;

    expect(() =>
      assembleFlowcordiaCleanInstallOnboardingEvidence({
        observations: value,
        checkedAt: "2026-07-29T00:15:00.000Z",
        repository: "ahamdjin/flowcordia",
        runId: "123456",
        runAttempt: 1,
        sourceCommitSha: sha,
      })
    ).toThrow(/teardown/i);
  });

  it("rejects evidence bound to a different application revision", () => {
    expect(() =>
      assembleFlowcordiaCleanInstallOnboardingEvidence({
        observations: observations(),
        checkedAt: "2026-07-29T00:15:00.000Z",
        repository: "ahamdjin/flowcordia",
        runId: "123456",
        runAttempt: 1,
        sourceCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
      })
    ).toThrow(/exact workflow source/i);
  });

  it("rejects a modified evidence digest", () => {
    const evidence = assembleFlowcordiaCleanInstallOnboardingEvidence({
      observations: observations(),
      checkedAt: "2026-07-29T00:15:00.000Z",
      repository: "ahamdjin/flowcordia",
      runId: "123456",
      runAttempt: 1,
      sourceCommitSha: sha,
    });

    expect(() =>
      parseFlowcordiaCleanInstallOnboardingEvidence({
        ...evidence,
        evidenceSha256: "89abcdef".repeat(8),
      })
    ).toThrow(/digest/i);
  });
});
