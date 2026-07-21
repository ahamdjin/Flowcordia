from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


contract = "apps/webapp/app/features/flowcordia/operations/upgrade-preflight.ts"
replace_once(
    contract,
    'export type FlowcordiaUpgradeKind = "application_only" | "append_only_migrations";\n',
    'export type FlowcordiaUpgradeKind =\n  | "undetermined"\n  | "application_only"\n  | "append_only_migrations";\n',
)
replace_once(
    contract,
    '''    evidenceTime >= manifestTime &&
    evidenceTime <= now + MAX_CLOCK_SKEW_MS &&
    now - evidenceTime <= input.maxAgeMs;
''',
    '''    evidenceTime >= manifestTime &&
    manifestTime <= now + MAX_CLOCK_SKEW_MS &&
    evidenceTime <= now + MAX_CLOCK_SKEW_MS &&
    now - manifestTime <= input.maxAgeMs &&
    now - evidenceTime <= input.maxAgeMs;
''',
)
replace_once(
    contract,
    '''  const kind: FlowcordiaUpgradeKind =
    prefixReady && applied!.length < target!.length
      ? "append_only_migrations"
      : "application_only";
''',
    '''  const kind: FlowcordiaUpgradeKind = !prefixReady
    ? "undetermined"
    : applied!.length < target!.length
      ? "append_only_migrations"
      : "application_only";
''',
)
replace_once(
    contract,
    '''  const steps: FlowcordiaUpgradeStepKey[] = migrationUpgrade
    ? [
        "verify_candidate_configuration",
        "enter_maintenance_window",
        "verify_recovery_evidence",
        "apply_migrations_once",
        "deploy_worker",
        "verify_worker",
        "deploy_web",
        "verify_release",
        "connected_acceptance",
        "exit_maintenance_window",
      ]
    : [
        "verify_candidate_configuration",
        "deploy_worker",
        "verify_worker",
        "deploy_web",
        "verify_release",
        "connected_acceptance",
      ];
''',
    '''  const steps: FlowcordiaUpgradeStepKey[] =
    kind === "append_only_migrations"
      ? [
          "verify_candidate_configuration",
          "enter_maintenance_window",
          "verify_recovery_evidence",
          "apply_migrations_once",
          "deploy_worker",
          "verify_worker",
          "deploy_web",
          "verify_release",
          "connected_acceptance",
          "exit_maintenance_window",
        ]
      : kind === "application_only"
        ? [
            "verify_candidate_configuration",
            "deploy_worker",
            "verify_worker",
            "deploy_web",
            "verify_release",
            "connected_acceptance",
          ]
        : [];
''',
)

test = "apps/webapp/test/flowcordia/upgradePreflight.test.ts"
replace_once(
    test,
    '''function recoveryEvidence(input: {
  evidenceCheckedAt?: Date;
  applicationCommitSha?: string;
} = {}) {
''',
    '''function recoveryEvidence(input: {
  manifestCreatedAt?: Date;
  evidenceCheckedAt?: Date;
  applicationCommitSha?: string;
} = {}) {
''',
)
replace_once(
    test,
    '''    createdAt: new Date("2026-07-22T00:00:00.000Z"),
''',
    '''    createdAt: input.manifestCreatedAt ?? new Date("2026-07-22T00:00:00.000Z"),
''',
)
replace_once(
    test,
    '''    expect(rewritten.state).toBe("BLOCKED");
    expect(
      rewritten.checks.find((entry) => entry.key === "migration_compatibility")?.state
    ).toBe("BLOCKED");
''',
    '''    expect(rewritten.state).toBe("BLOCKED");
    expect(rewritten.kind).toBe("undetermined");
    expect(rewritten.steps).toEqual([]);
    expect(
      rewritten.checks.find((entry) => entry.key === "migration_compatibility")?.state
    ).toBe("BLOCKED");
''',
)
replace_once(
    test,
    '''    const stale = recoveryEvidence({
      evidenceCheckedAt: new Date("2026-07-20T00:15:00.000Z"),
    });
''',
    '''    const stale = recoveryEvidence({
      manifestCreatedAt: new Date("2026-07-20T00:00:00.000Z"),
      evidenceCheckedAt: new Date("2026-07-20T00:15:00.000Z"),
    });
''',
)
