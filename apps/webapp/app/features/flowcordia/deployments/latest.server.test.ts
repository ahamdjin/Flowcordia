import { describe, expect, it } from "vitest";
import {
  deriveFlowcordiaLatestDeploymentProjection,
  isFlowcordiaExpectedCommitCurrent,
} from "./latest.server";

const base = {
  repository: { fullName: "acme/workflows", htmlUrl: "https://github.com/acme/workflows" },
  branch: "main",
  commitSha: "b".repeat(40),
  environmentType: "PRODUCTION" as const,
};

describe("latest connected deployment projection", () => {
  it("marks an exact active deployment as deploying", () => {
    expect(
      deriveFlowcordiaLatestDeploymentProjection({
        ...base,
        exactDeployment: { commitSHA: base.commitSha, version: "20260727.1", status: "BUILDING" },
        currentDeployment: { commitSHA: "a".repeat(40), version: "20260726.1", status: "DEPLOYED" },
      }).state
    ).toBe("DEPLOYING");
  });

  it("requires the current promotion to match the latest commit", () => {
    expect(
      deriveFlowcordiaLatestDeploymentProjection({
        ...base,
        exactDeployment: { commitSHA: base.commitSha, version: "20260727.1", status: "DEPLOYED" },
        currentDeployment: { commitSHA: "a".repeat(40), version: "20260726.1", status: "DEPLOYED" },
      }).state
    ).toBe("READY");

    expect(
      deriveFlowcordiaLatestDeploymentProjection({
        ...base,
        exactDeployment: { commitSHA: base.commitSha, version: "20260727.1", status: "DEPLOYED" },
        currentDeployment: { commitSHA: base.commitSha, version: "20260727.1", status: "DEPLOYED" },
      }).state
    ).toBe("CURRENT");
  });

  it("marks a newer repository head as outdated without stopping the current deployment", () => {
    const result = deriveFlowcordiaLatestDeploymentProjection({
      ...base,
      exactDeployment: null,
      currentDeployment: { commitSHA: "a".repeat(40), version: "20260726.1", status: "DEPLOYED" },
    });

    expect(result).toMatchObject({
      state: "OUTDATED",
      deployedCommitSha: "a".repeat(40),
      commitSha: base.commitSha,
    });
  });

  it("rejects a stale commit shown by an older page load", () => {
    const result = deriveFlowcordiaLatestDeploymentProjection({
      ...base,
      exactDeployment: null,
      currentDeployment: null,
    });

    expect(isFlowcordiaExpectedCommitCurrent(result, base.commitSha)).toBe(true);
    expect(isFlowcordiaExpectedCommitCurrent(result, "c".repeat(40))).toBe(false);
    expect(isFlowcordiaExpectedCommitCurrent({ ...result, commitSha: null }, base.commitSha)).toBe(
      false
    );
  });
});
