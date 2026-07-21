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
    '''  const migrationUpgrade = kind === "append_only_migrations";

  const recovery = migrationUpgrade
    ? validRecoveryEvidence({
''',
    '''  const migrationUpgrade = kind === "append_only_migrations";
  const compatibilityDetermined = kind !== "undetermined";

  const recovery = !compatibilityDetermined
    ? { ready: false }
    : migrationUpgrade
      ? validRecoveryEvidence({
''',
)
replace_once(
    contract,
    '''        maxAgeMs: recoveryMaxAgeMs,
      })
    : { ready: true };
''',
    '''          maxAgeMs: recoveryMaxAgeMs,
        })
      : { ready: true };
''',
)
replace_once(
    contract,
    '''      "Fresh matching backup and isolated restore evidence is required for a migration-bearing upgrade."
    ),
    check(
      "migration_review",
      !migrationUpgrade || input.confirmMigrationReview === true,
      migrationUpgrade
        ? "An operator confirmed review of the candidate migration SQL and data-transition plan."
        : "No candidate migration SQL requires upgrade review.",
      "A migration-bearing upgrade requires explicit operator review of SQL and data-transition behavior."
    ),
    check(
      "maintenance_window",
      !migrationUpgrade || input.confirmMaintenanceWindow === true,
      migrationUpgrade
        ? "An operator accepted a controlled maintenance window for the schema transition."
        : "The application-only rollout does not require this gate's schema-maintenance window.",
      "A migration-bearing upgrade requires an explicit controlled maintenance-window acknowledgement."
    ),
    check(
      "rollback_acceptance",
      !migrationUpgrade || input.confirmRestoreRollback === true,
      migrationUpgrade
        ? "An operator accepted restore-based recovery because backward application compatibility is not proven."
        : "The prior application revision remains the bounded rollback target for this application-only rollout.",
      "A migration-bearing upgrade requires explicit acceptance of restore-based recovery when backward compatibility is unproven."
    ),
''',
    '''      compatibilityDetermined
        ? "Fresh matching backup and isolated restore evidence is required for a migration-bearing upgrade."
        : "Recovery evidence cannot be evaluated until migration compatibility is established."
    ),
    check(
      "migration_review",
      kind === "application_only" ||
        (migrationUpgrade && input.confirmMigrationReview === true),
      migrationUpgrade
        ? "An operator confirmed review of the candidate migration SQL and data-transition plan."
        : "No candidate migration SQL requires upgrade review.",
      compatibilityDetermined
        ? "A migration-bearing upgrade requires explicit operator review of SQL and data-transition behavior."
        : "Migration review cannot be evaluated until migration compatibility is established."
    ),
    check(
      "maintenance_window",
      kind === "application_only" ||
        (migrationUpgrade && input.confirmMaintenanceWindow === true),
      migrationUpgrade
        ? "An operator accepted a controlled maintenance window for the schema transition."
        : "The application-only rollout does not require this gate's schema-maintenance window.",
      compatibilityDetermined
        ? "A migration-bearing upgrade requires an explicit controlled maintenance-window acknowledgement."
        : "Maintenance requirements cannot be evaluated until migration compatibility is established."
    ),
    check(
      "rollback_acceptance",
      kind === "application_only" ||
        (migrationUpgrade && input.confirmRestoreRollback === true),
      migrationUpgrade
        ? "An operator accepted restore-based recovery because backward application compatibility is not proven."
        : "The prior application revision remains the bounded rollback target for this application-only rollout.",
      compatibilityDetermined
        ? "A migration-bearing upgrade requires explicit acceptance of restore-based recovery when backward compatibility is unproven."
        : "Rollback requirements cannot be evaluated until migration compatibility is established."
    ),
''',
)

test = "apps/webapp/test/flowcordia/upgradePreflight.test.ts"
replace_once(
    test,
    '''    expect(rewritten.kind).toBe("undetermined");
    expect(rewritten.steps).toEqual([]);
    expect(
      rewritten.checks.find((entry) => entry.key === "migration_compatibility")?.state
    ).toBe("BLOCKED");
''',
    '''    expect(rewritten.kind).toBe("undetermined");
    expect(rewritten.steps).toEqual([]);
    expect(
      rewritten.checks.find((entry) => entry.key === "migration_compatibility")?.state
    ).toBe("BLOCKED");
    expect(
      rewritten.checks
        .filter((entry) =>
          [
            "recovery_evidence",
            "migration_review",
            "maintenance_window",
            "rollback_acceptance",
          ].includes(entry.key)
        )
        .every((entry) => entry.state === "BLOCKED")
    ).toBe(true);
''',
)
