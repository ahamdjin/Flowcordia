# Flowcordia controlled upgrades

A Flowcordia upgrade is accepted only after one read-only preflight binds the live application revision, candidate application revision, live Prisma migration history, candidate migration artifacts, recovery evidence, and operator acknowledgements into a deterministic rollout decision.

The preflight never applies a migration, deploys an image, changes traffic, pauses a worker, creates a backup, or performs a rollback. It decides whether the documented mutation sequence may begin.

## Upgrade classes

### Application-only

The live and candidate migration histories have the same ordered names and exact Prisma checksums.

The bounded sequence is:

1. verify candidate release configuration;
2. deploy the dedicated proposal worker;
3. require worker live-dependency and operations readiness;
4. deploy request-serving web replicas;
5. require release live-dependency, provider-readiness, repository-readiness, and operations-readiness checks;
6. complete connected acceptance.

The previous application image remains the bounded rollback target because no new database migration is planned by this gate.

### Append-only migration

Every live applied migration is an exact ordered prefix of the candidate repository, including its checksum, and the candidate adds one or more new migrations without rewriting or removing history.

The bounded sequence is:

1. verify candidate release configuration;
2. enter a controlled maintenance window;
3. re-verify release-bound backup and isolated restore evidence;
4. apply migrations once through the documented migration owner;
5. deploy the dedicated proposal worker;
6. require worker live-dependency and operations readiness;
7. deploy request-serving web replicas;
8. require release live-dependency, provider-readiness, repository-readiness, and operations-readiness checks;
9. complete connected acceptance;
10. exit the maintenance window.

Flowcordia does not infer backward compatibility from migration SQL. Until an explicit compatibility contract exists, a migration-bearing transition requires operator acceptance that recovery may require restoring the verified backup rather than simply redeploying the previous application image.

## Preconditions

1. Check out the exact candidate commit.
2. Configure the candidate release environment and set `FLOWCORDIA_APPLICATION_COMMIT_SHA` to that candidate commit.
3. Preserve the exact current deployed application commit separately.
4. Run the release installation preflight and resolve every blocked check.
5. Keep `DATABASE_URL` pointed at the current writer database. The upgrade command uses one bounded read-only connection.
6. For a migration-bearing upgrade, create a versioned backup and complete its isolated restore rehearsal against the current application/database state.
7. Review every pending `migration.sql` file and the data-transition procedure outside the preflight command.

## Run the preflight

Application-only candidate:

```bash
pnpm run flowcordia:upgrade:preflight -- \
  --current-application-sha <current-40-character-commit> \
  --json
```

Migration-bearing candidate:

```bash
pnpm run flowcordia:upgrade:preflight -- \
  --current-application-sha <current-40-character-commit> \
  --backup-manifest /secure/flowcordia-backups/<release>/<release>.backup.json \
  --restore-evidence /secure/flowcordia-backups/<release>/restore-evidence.json \
  --confirm-migration-review \
  --confirm-maintenance-window \
  --confirm-restore-rollback \
  --json
```

Recovery evidence paths must remain outside the repository. The default maximum restore-evidence age is 24 hours. Operators may set a bounded policy from 1 to 168 hours with `--max-recovery-age-hours`.

`--allow-global-studio` has the same narrow meaning as installation preflight: it acknowledges candidate configuration only and does not bypass organization rollout, authorization, repository readiness, operations readiness, recovery, or connected acceptance.

## What the command verifies

### Candidate configuration

The complete `release` installation profile must be `READY`, including the pinned runtime, database URL shape, exact candidate application revision, GitHub App shape, web secrets, origins, Studio rollout, dedicated worker, event delivery, and bounded worker timings.

### Live database history

The command reads only:

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY migration_name
```

It requires:

- at least one migration;
- valid unique timestamped names;
- lowercase SHA-256 checksums;
- every row finished successfully;
- no rolled-back row;
- exact ascending order.

### Candidate repository history

Every candidate migration directory must be a valid timestamped directory containing a non-empty `migration.sql`. The command hashes the exact file bytes with SHA-256.

The live history must be an exact checksum-bound prefix of the candidate history. An applied migration that was edited, removed, renamed, reordered, duplicated, failed, or rolled back blocks the upgrade before mutation.

### Recovery evidence

A migration-bearing upgrade requires schema `0.1` backup and restore-rehearsal evidence that:

- has valid canonical digests;
- belongs to the exact current application revision;
- matches the current live migration-name digest;
- refers to the same archive, release, PostgreSQL major, and backup manifest;
- records all fixed restore checks as `READY`;
- was completed after backup creation;
- is not future-dated beyond bounded clock skew;
- satisfies the selected evidence-age policy.

The command does not read the archive itself and does not create new recovery evidence. Use the database recovery runbook for that proof.

### Operator acknowledgements

For migration-bearing upgrades, all three acknowledgements are required:

- migration SQL and data-transition review;
- controlled maintenance window;
- restore-based recovery when backward application compatibility is not proven.

These acknowledgements do not make unsafe migration history acceptable. They become relevant only after exact history and recovery checks pass.

## Output boundary

Schema `0.1` output contains:

- `READY`, `BLOCKED`, or command-level `UNAVAILABLE`;
- configuration, observation, or upgrade phase;
- exact current and candidate application commits;
- application-only or append-only-migration classification;
- current, target, and pending migration counts;
- canonical migration-history digests;
- backup-manifest and restore-evidence digests when required;
- fixed check messages and ordered rollout phase keys.

It excludes migration names, SQL, database URLs, hosts, usernames, IDs, credentials, archive contents, provider responses, command stderr, raw errors, and stack traces.

## Stop conditions

Do not begin the upgrade when:

- candidate release configuration is blocked;
- current and candidate application revisions are invalid, identical, or placeholders;
- database observations are unavailable;
- any live migration is unfinished or rolled back;
- candidate history rewrites, removes, reorders, or diverges from applied history;
- a schema-changing candidate lacks fresh exact recovery evidence;
- migration review, maintenance, or restore-recovery acknowledgements are missing;
- any later live-dependency, repository-readiness, operations-readiness, build, browser, production, or rollback gate fails.

Never delete or edit `_prisma_migrations` rows to make the preflight pass. Repair the release artifact or follow Prisma's documented migration-reconciliation procedure under explicit review.

## Failure and rollback

- Before migrations: no product mutation has occurred; fix the candidate or configuration and rerun.
- Application-only rollout: redeploy the exact previous application/worker images, then rerun live and connected checks.
- Migration-bearing rollout before migration completion: stop and diagnose the controlled migration job. Do not race another migration owner.
- Migration-bearing rollout after schema mutation: do not assume the previous application is compatible. Follow the accepted maintenance and tested restore procedure unless an explicit version compatibility record proves a safer path.
- A successful preflight cannot replace a real configured backup/restore rehearsal or connected release evidence.

## Verification boundary

The source implementation passed the focused controlled-upgrade and database-recovery suites, including exact migration-file hashing, live checksum/state projection, application-only and append-only classification, rewritten/removed/reordered/failed history rejection, stale or tampered recovery evidence, repository-local evidence rejection, blocked-before-database CLI behavior, and fail-closed `undetermined` transitions with no rollout steps. Prisma generation and the complete monorepo typecheck also passed before all temporary validation workflows, transforms, and diagnostics removed themselves.

That evidence proves classification, checksum comparison, redaction, evidence validation, deterministic ordering, and failure behavior. It does not prove the current application identity was supplied correctly, the operator genuinely reviewed migration behavior, a configured production backup is restorable, or an upgrade was executed in order. A real operator run against the exact current database and candidate release remains mandatory.
