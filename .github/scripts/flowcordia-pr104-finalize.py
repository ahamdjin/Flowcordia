from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(
            f"{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}"
        )
    file.write_text(text.replace(old, new))


manifest = "apps/webapp/app/features/flowcordia/acceptance/release-manifest.server.ts"
replace(
    manifest,
    '''function validateVerifiedRun(value: unknown, label: string) {
  const run = exactObject(value, label, ["friendlyId", "status", "proof"]);
  exact(run.status, "COMPLETED_SUCCESSFULLY", `${label}.status`);
  exact(run.proof, "VERIFIED", `${label}.proof`);
  return {
    friendlyId: boundedString(run.friendlyId, `${label}.friendlyId`, PUBLIC_NAME),
  };
}

function sourceIdentity''',
    '''function validateVerifiedRun(value: unknown, label: string) {
  const run = exactObject(value, label, ["friendlyId", "status", "proof"]);
  exact(run.status, "COMPLETED_SUCCESSFULLY", `${label}.status`);
  exact(run.proof, "VERIFIED", `${label}.proof`);
  return {
    friendlyId: boundedString(run.friendlyId, `${label}.friendlyId`, PUBLIC_NAME),
  };
}

function validateClosureProof(value: unknown, label: string): void {
  const closure = exactObject(value, label, [
    "state",
    "digest",
    "expectedCount",
    "installedCount",
  ]);
  exact(closure.state, "READY", `${label}.state`);
  sha256(closure.digest, `${label}.digest`);
  const expectedCount = positiveInteger(closure.expectedCount, `${label}.expectedCount`);
  if (expectedCount > 100) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      `${label}.expectedCount exceeds the supported closure ceiling.`
    );
  }
  exact(closure.installedCount, expectedCount, `${label}.installedCount`);
}

function sourceIdentity''',
)
replace(
    manifest,
    '''    mode: "production",
    workflowId,
    applicationCommitSha,
  });''',
    '''    mode: "production",
    workflowId,
    applicationCommitSha,
    schemaVersion: "0.2",
  });''',
)
replace(
    manifest,
    '''    "deploymentVersion",
    "run",
  ]);
  exact(productionProof.expectedHeadSha''',
    '''    "deploymentVersion",
    "closure",
    "run",
  ]);
  exact(productionProof.expectedHeadSha''',
)
replace(
    manifest,
    '''  const productionRun = validateVerifiedRun(productionProof.run, "production.production.run");''',
    '''  validateClosureProof(productionProof.closure, "production.production.closure");
  const productionRun = validateVerifiedRun(productionProof.run, "production.production.run");''',
)
replace(
    manifest,
    '''    mode: "rollback_production",
    workflowId,
    applicationCommitSha,
  });''',
    '''    mode: "rollback_production",
    workflowId,
    applicationCommitSha,
    schemaVersion: "0.2",
  });''',
)
replace(
    manifest,
    '''      "deploymentVersion",
      "run",
    ]
  );
  exact(
    rollbackProductionProof.expectedHeadSha''',
    '''      "deploymentVersion",
      "closure",
      "run",
    ]
  );
  exact(
    rollbackProductionProof.expectedHeadSha''',
)
replace(
    manifest,
    '''  const rollbackRun = validateVerifiedRun(
    rollbackProductionProof.run,''',
    '''  validateClosureProof(
    rollbackProductionProof.closure,
    "rollback_production.production.closure"
  );
  const rollbackRun = validateVerifiedRun(
    rollbackProductionProof.run,''',
)

fixture = "apps/webapp/test/flowcordia/releaseEvidenceFixture.ts"
replace(
    fixture,
    '''    production: {
      ...common,
      mode: "production",''',
    '''    production: {
      ...common,
      schemaVersion: "0.2",
      mode: "production",''',
)
replace(
    fixture,
    '''        deploymentVersion: "20260720.1",
        run: {''',
    '''        deploymentVersion: "20260720.1",
        closure: {
          state: "READY",
          digest: "6".repeat(64),
          expectedCount: 2,
          installedCount: 2,
        },
        run: {''',
)
replace(
    fixture,
    '''    rollback_production: {
      ...common,
      mode: "rollback_production",''',
    '''    rollback_production: {
      ...common,
      schemaVersion: "0.2",
      mode: "rollback_production",''',
)
replace(
    fixture,
    '''        deploymentVersion: "20260720.2",
        run: {''',
    '''        deploymentVersion: "20260720.2",
        closure: {
          state: "READY",
          digest: "7".repeat(64),
          expectedCount: 2,
          installedCount: 2,
        },
        run: {''',
)

manifest_test = "apps/webapp/test/flowcordia/releaseEvidenceManifest.test.ts"
replace(
    manifest_test,
    '''  it("binds rollback creation to the exact production being rolled back", () => {''',
    '''  it("requires complete production and rollback-production closure proof", () => {
    for (const stage of ["production", "rollback_production"] as const) {
      const legacy = sources();
      const legacyEvidence = legacy.find((entry) => entry.stage === stage)!.evidence;
      legacyEvidence.schemaVersion = "0.1";
      delete (legacyEvidence.production as Record<string, unknown>).closure;
      expect(() => assemble(legacy)).toThrow(`${stage}.schemaVersion`);

      const waiting = sources();
      const waitingClosure = (
        waiting.find((entry) => entry.stage === stage)!.evidence.production as Record<
          string,
          unknown
        >
      ).closure as Record<string, unknown>;
      waitingClosure.state = "WAITING";
      expect(() => assemble(waiting)).toThrow(`${stage}.production.closure.state`);

      const incomplete = sources();
      const incompleteClosure = (
        incomplete.find((entry) => entry.stage === stage)!.evidence.production as Record<
          string,
          unknown
        >
      ).closure as Record<string, unknown>;
      incompleteClosure.installedCount = 1;
      expect(() => assemble(incomplete)).toThrow(
        `${stage}.production.closure.installedCount`
      );

      const invalidDigest = sources();
      const invalidClosure = (
        invalidDigest.find((entry) => entry.stage === stage)!.evidence.production as Record<
          string,
          unknown
        >
      ).closure as Record<string, unknown>;
      invalidClosure.digest = "not-a-digest";
      expect(() => assemble(invalidDigest)).toThrow(`${stage}.production.closure.digest`);
    }
  });

  it("binds rollback creation to the exact production being rolled back", () => {''',
)

harness_doc = "flowcordia/testing/production-acceptance-harness.md"
replace(
    harness_doc,
    '''- authoritative production deployment version;
- mode-specific destructive confirmation.''',
    '''- authoritative production deployment version;
- immutable promoted closure digest;
- exact promoted closure workflow count between 1 and 100;
- mode-specific destructive confirmation.''',
)
replace(
    harness_doc,
    '''- the same authoritative deployment commit and version;
- terminal status `COMPLETED_SUCCESSFULLY`;''',
    '''- the same authoritative deployment commit and version;
- closure state `READY` before and after execution;
- the exact immutable closure digest;
- installed task count equal to the expected closure workflow count;
- terminal status `COMPLETED_SUCCESSFULLY`;''',
)
replace(
    harness_doc,
    '''Schema `0.1` evidence contains only immutable application, proposal, deployment, and public run identity.''',
    '''Schema `0.2` evidence contains only immutable application, proposal, deployment, closure state/digest/counts, and public run identity.''',
)

registry_doc = "flowcordia/testing/release-evidence-registry.md"
replace(
    registry_doc,
    '''- production deployment and verified execution to the promoted merge;''',
    '''- production deployment, complete immutable closure installation, and verified execution to the promoted merge;''',
)
replace(
    registry_doc,
    '''- rollback proposal and rollback production to new, distinct proposal, merge, deployment, and run identities;''',
    '''- rollback proposal and rollback production to new, distinct proposal, merge, deployment, complete closure, and run identities;''',
)
replace(
    registry_doc,
    '''Any missing/duplicate source, reused run, unofficial workflow, stale or expired artifact, invalid archive/evidence digest, lifecycle target mismatch, lifecycle chronology violation, sensitive key, malformed webhook status, nonconsecutive generation, connected chronology violation, existing branch, or existing manifest path stops assembly.''',
    '''Any missing/duplicate source, reused run, unofficial workflow, stale or expired artifact, invalid archive/evidence digest, lifecycle target mismatch, lifecycle chronology violation, sensitive key, incomplete production closure, malformed webhook status, nonconsecutive generation, connected chronology violation, existing branch, or existing manifest path stops assembly.''',
)
