import { describe, expect, it } from "vitest";
import {
  assembleFlowcordiaLaunchManifest,
  FlowcordiaWebhookReleaseEvidenceError,
} from "../../app/features/flowcordia/acceptance/release-launch-manifest.server";
import {
  applicationCommitSha,
  assembledAt,
  proposalId,
  releaseId,
  workflowId,
} from "./releaseEvidenceFixture";
import {
  launchEvidenceSources,
  webhookReleaseEvidence,
  webhookReleaseSource,
} from "./releaseLaunchEvidenceFixture";

function assemble(sources = launchEvidenceSources()) {
  return assembleFlowcordiaLaunchManifest({
    releaseId,
    applicationCommitSha,
    workflowId,
    proposalId,
    assembledAt,
    sources,
  });
}

describe("Flowcordia webhook-bound launch manifest", () => {
  it("wraps the accepted seven-source release with one exact webhook source", () => {
    const manifest = assemble();
    expect(manifest.schemaVersion).toBe("0.4");
    expect(manifest.result).toBe("ACCEPTED");
    expect(manifest.sourceRuns).toHaveLength(8);
    expect(manifest.sourceRuns.map((source) => source.stage)).toEqual([
      "provider",
      "alert",
      "preview",
      "promotion",
      "production",
      "webhook_production",
      "rollback_proposal",
      "rollback_production",
    ]);
    expect(manifest.webhook).toEqual({
      originalGeneration: 1,
      originalRevision: 2,
      firstDeliveryStatus: 202,
      replayStatus: 200,
      invalidSignatureStatus: 401,
      revokedPredecessorStatus: 404,
      replacementGeneration: 2,
      replacementRevision: 1,
      successorDeliveryStatus: 202,
      predecessorAfterSuccessorStatus: 404,
    });
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires exactly one production webhook artifact", () => {
    expect(() =>
      assemble(launchEvidenceSources().filter((source) => source.stage !== "webhook_production"))
    ).toThrow(FlowcordiaWebhookReleaseEvidenceError);
    expect(() => assemble([...launchEvidenceSources(), webhookReleaseSource()])).toThrow(
      /exactly eight source artifacts/
    );
  });

  it("rejects sensitive endpoint identity in webhook evidence", () => {
    const evidence = webhookReleaseEvidence();
    (evidence.webhook as Record<string, unknown>).publicId = "unsafe-public-id";
    const sources = launchEvidenceSources().filter(
      (source) => source.stage !== "webhook_production"
    );
    expect(() => assemble([...sources, webhookReleaseSource(evidence)])).toThrow(/forbidden field/);
  });

  it("requires the successor to be exactly the next generation", () => {
    const evidence = webhookReleaseEvidence();
    (evidence.webhook as Record<string, unknown>).replacementGeneration = 4;
    const sources = launchEvidenceSources().filter(
      (source) => source.stage !== "webhook_production"
    );
    expect(() => assemble([...sources, webhookReleaseSource(evidence)])).toThrow(
      /next endpoint generation/
    );
  });

  it("requires webhook acceptance after production and before rollback", () => {
    const evidence = webhookReleaseEvidence();
    evidence.startedAt = "2026-07-20T15:03:30.000Z";
    evidence.completedAt = "2026-07-20T15:04:30.000Z";
    const sources = launchEvidenceSources().filter(
      (source) => source.stage !== "webhook_production"
    );
    expect(() => assemble([...sources, webhookReleaseSource(evidence)])).toThrow(
      /before production acceptance completed/
    );
  });

  it("requires the webhook workflow commit to equal the release application", () => {
    const source = webhookReleaseSource();
    source.workflowCommitSha = "9".repeat(40);
    const sources = launchEvidenceSources().filter(
      (candidate) => candidate.stage !== "webhook_production"
    );
    expect(() => assemble([...sources, source])).toThrow(/workflowCommitSha/);
  });
});
