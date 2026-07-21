# Flowcordia database backup and restore rehearsal

Flowcordia database recovery is accepted only when one versioned PostgreSQL custom archive is created from an exact release database and successfully restored into a disposable database that is destroyed afterward.

A dump command completing is not restore proof. A backup without a matching rehearsal remains unverified.

## Security boundary

The `.dump` archive contains application and customer data. Treat it as a production secret:

- write it only to encrypted storage outside the Git repository;
- restrict the backup directory to mode `0700` and files to `0600`;
- use storage-side encryption, access logging, retention, and deletion controls;
- never upload the archive to a public CI artifact, pull request, issue, chat, or release evidence branch;
- never print database URLs, passwords, archive contents, migration names, PostgreSQL stderr, or the disposable restore database name.

The backup manifest and restore evidence contain digests and fixed metadata only. They are designed for review, but operators must still apply their repository's evidence-retention policy.

## Supported PostgreSQL boundary

The current self-host development image uses PostgreSQL 14. Recovery tooling requires:

- `psql`, `pg_dump`, `pg_restore`, `createdb`, and `dropdb`;
- `pg_dump` and `pg_restore` major versions equal to the source server major;
- the disposable restore server major equal to the backup server major;
- a PostgreSQL custom archive with owner and privilege restoration disabled.

Use `--postgres-bin-dir` when the required client tools are not on `PATH`.

## Preconditions

1. Select one exact Flowcordia application commit and release ID.
2. Run installation preflight with profile `release`.
3. Run live dependency preflight with profile `release` and require `READY`.
4. Confirm the checked-out repository migration directories are the exact release artifact.
5. Select an encrypted backup directory outside the repository.
6. Configure `DATABASE_URL` for the source writer and `FLOWCORDIA_APPLICATION_COMMIT_SHA` for the exact deployed application.
7. Prepare a disposable PostgreSQL restore server or cluster. Its administrative connection must be configured separately as `FLOWCORDIA_RESTORE_ADMIN_URL` and must not identify the source database.

The restore account must be allowed to create and drop only rehearsal databases in the chosen disposable environment. Do not grant broader production authority merely to run this check.

## Create the backup

```bash
pnpm exec tsx scripts/flowcordia-database-backup.ts \
  --release-id release-2026.07.21 \
  --output-dir /secure/flowcordia-backups/release-2026.07.21 \
  --json
```

The command:

1. validates the release ID before constructing a path;
2. refuses to overwrite an existing archive or manifest;
3. verifies source PostgreSQL and client-tool major versions;
4. requires the database's complete migration state to match the checked-out repository exactly;
5. runs `pg_dump` in custom format without owner or privilege restoration;
6. validates the archive inventory with `pg_restore --list`;
7. requires table-data content including `_prisma_migrations`;
8. atomically publishes a mode-`0600` archive and manifest;
9. removes incomplete temporary artifacts on failure.

The manifest schema is `0.1` and records only:

- release ID and exact application commit;
- creation timestamp and PostgreSQL major;
- archive format, byte size, SHA-256, and inventory SHA-256;
- migration count and canonical digest;
- canonical manifest digest.

It does not contain paths, database identities, provider data, or values.

## Rehearse the restore

```bash
export FLOWCORDIA_RESTORE_ADMIN_URL='postgresql://.../postgres'

pnpm exec tsx scripts/flowcordia-database-restore-rehearsal.ts \
  --archive /secure/flowcordia-backups/release-2026.07.21/release-2026.07.21.dump \
  --manifest /secure/flowcordia-backups/release-2026.07.21/release-2026.07.21.backup.json \
  --evidence /secure/flowcordia-backups/release-2026.07.21/restore-evidence.json \
  --json
```

Before creating a database, the rehearsal verifies:

- the source and restore-admin database identities are distinct;
- the manifest schema and canonical digest;
- the archive size, SHA-256, and inventory SHA-256;
- the checked-out repository migration digest;
- `pg_restore` and disposable server major compatibility.

The command then:

1. creates one random, bounded disposable database;
2. restores with `--exit-on-error`, `--single-transaction`, `--no-owner`, and `--no-privileges`;
3. verifies the restored successful migration set exactly matches both the manifest and repository;
4. drops the disposable database with `--force` in a `finally` boundary;
5. writes READY evidence only after cleanup succeeds.

A restore failure still triggers cleanup. A cleanup failure prevents READY evidence and requires operator intervention on the disposable restore environment.

## Restore evidence

Schema `0.1` READY evidence contains:

- release and application identity;
- backup manifest and archive digests;
- PostgreSQL major and migration digest;
- fixed READY checks for archive integrity, tool compatibility, restore completion, migration parity, and cleanup;
- one canonical evidence digest.

It excludes archive contents, row counts, table names, migration names, database names, hosts, usernames, URLs, credentials, commands, provider output, raw errors, and stack traces.

## Verification boundary

The source implementation passed 23 focused recovery, installation-preflight, and live-dependency-preflight tests on one exact product branch. Those tests cover canonical manifests and evidence, tamper detection, PostgreSQL major compatibility, migration-state rejection, no-overwrite publication, credential redaction, disposable-database cleanup, restore-failure cleanup, and rejection of repository-local recovery artifact paths. Prisma generation and the complete monorepo typecheck also passed before all temporary validation tooling and diagnostics removed themselves.

That evidence proves the recovery contracts, command boundaries, and failure behavior. It does not claim that a configured production database has been backed up or restored. A real operator run against the exact release database and a disposable compatible restore environment remains mandatory before accepting database recovery evidence.

## Release decision

A release is blocked when:

- no recent backup exists for the exact release database;
- archive or manifest digests do not match;
- migration history is missing, failed, rolled back, extra, or older than the checked-out release;
- source, tool, backup, and disposable server majors are incompatible;
- the archive cannot restore in one transaction;
- restored migration parity fails;
- the disposable database cannot be destroyed;
- backup or restore evidence belongs to another application commit or release ID.

A passing rehearsal proves logical PostgreSQL archive recovery for that exact artifact. It does not prove object-storage recovery, point-in-time recovery, cross-region disaster recovery, encryption-key recovery, RPO/RTO objectives, or application-level connected acceptance.

## Retention and repetition

- Create a new backup manifest and restore rehearsal for every accepted release and before every migration-bearing upgrade.
- Rehearse restores on a schedule defined by the operator's recovery objectives, not only during incidents.
- Preserve manifests and READY rehearsal evidence according to release policy.
- Store and expire sensitive archives according to the organization's backup retention policy.
- Never reuse or edit an accepted manifest or rehearsal record. A changed archive, migration set, application commit, or release ID requires new evidence.
