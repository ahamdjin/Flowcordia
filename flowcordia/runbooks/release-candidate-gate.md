# Release-candidate evidence gate

This gate binds the existing live dependency, PostgreSQL backup, isolated restore, and controlled-upgrade evidence into one exact release-candidate decision before connected acceptance begins.

It does not run the underlying probes. Operators must first produce their native redacted JSON evidence through the existing commands, then validate that every result belongs to the same release lineage.

## Required order

1. Deploy or identify the current application revision.
2. Check out the exact candidate revision that will be released.
3. Run the release-profile live dependency preflight.
4. Create a PostgreSQL custom archive and versioned backup manifest for the current revision.
5. Restore the archive into a disposable database and preserve the READY rehearsal evidence.
6. Run the controlled upgrade preflight from the current revision to the candidate revision, supplying the backup and restore evidence when migrations are pending.
7. Run the release-candidate gate.
8. Begin the protected connected browser, GitHub, preview, production, webhook, and rollback acceptance chain only after the gate reports READY.

## Produce bounded evidence

Write all evidence outside the Git repository. The commands reject repository paths because recovery artifacts may contain production data or operational details that must never enter Git history.

```bash
private_root="$(mktemp -d /secure/flowcordia-release.XXXXXX)"
chmod 700 "$private_root"

pnpm flowcordia:preflight:live --profile release --json \
  > "$private_root/live-dependency.json"

pnpm flowcordia:db:backup \
  --release-id "$FLOWCORDIA_RELEASE_ID" \
  --output-dir "$private_root/recovery" \
  --json \
  > "$private_root/backup-result.json"

pnpm flowcordia:db:restore-rehearsal \
  --archive "$private_root/recovery/database.dump" \
  --manifest "$private_root/recovery/manifest.json" \
  --evidence "$private_root/recovery/restore-evidence.json" \
  --json \
  > "$private_root/restore-result.json"

pnpm flowcordia:upgrade:preflight \
  --current-application-sha "$FLOWCORDIA_CURRENT_APPLICATION_COMMIT_SHA" \
  --backup-manifest "$private_root/recovery/manifest.json" \
  --restore-evidence "$private_root/recovery/restore-evidence.json" \
  --confirm-migration-review \
  --confirm-maintenance-window \
  --confirm-restore-rollback \
  --json \
  > "$private_root/upgrade.json"
```

Use the exact archive and manifest paths emitted by the backup command. The example names illustrate the boundary and are not inferred by the gate.

## Validate the release candidate

```bash
pnpm exec tsx scripts/flowcordia-release-candidate-gate.ts \
  --release-id "$FLOWCORDIA_RELEASE_ID" \
  --current-application-sha "$FLOWCORDIA_CURRENT_APPLICATION_COMMIT_SHA" \
  --target-application-sha "$FLOWCORDIA_APPLICATION_COMMIT_SHA" \
  --live-dependency "$private_root/live-dependency.json" \
  --backup-manifest "$private_root/recovery/manifest.json" \
  --restore-evidence "$private_root/recovery/restore-evidence.json" \
  --upgrade-evidence "$private_root/upgrade.json" \
  --json \
  > "$private_root/release-candidate.json"
```

The command exits non-zero and emits only a fixed failure message when evidence is malformed, stale, blocked, unavailable, mismatched, or tampered.

## READY requirements

The decision is READY only when:

- the release ID and current/target application revisions are exact and non-placeholder;
- release-profile configuration and all live dependency checks are READY;
- the backup manifest belongs to the exact current application and release;
- the isolated restore evidence matches the archive, manifest, PostgreSQL major version, and migration inventory;
- every recovery check is READY and the evidence digest matches its canonical contents;
- the controlled upgrade decision belongs to the exact current and target revisions;
- migration counts and upgrade kind agree;
- migration-bearing upgrades bind the exact backup and restore evidence;
- all upgrade acknowledgements and checks are READY;
- dependency, backup, restore, and upgrade evidence are fresh and chronologically valid;
- the controlled upgrade sequence includes protected connected acceptance.

The default freshness window is 24 hours. Operators may select 1–168 hours with `--max-age-hours`, but the chosen policy must be justified for the supported release mode.

## What this gate does not prove

This gate does not deploy code, apply migrations, switch traffic, exercise providers, inspect an inbox, consume queued alerts, execute a workflow, verify a signed public webhook, revoke or replace an endpoint, promote a release, or perform rollback. Those remain separate protected acceptance stages.

A READY result is necessary but not sufficient for release. Repository CI, provider readiness, alert readiness, connected execution, production proof, webhook incident operations, and rollback evidence must still enter the immutable release dossier.
