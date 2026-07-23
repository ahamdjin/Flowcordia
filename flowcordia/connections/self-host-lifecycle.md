# Published self-host lifecycle connection

This connection binds two official immutable image publications to one protected clean-install, restart, recovery, upgrade, rollback-boundary, teardown, and bounded evidence journey.

| Source | Target | Why the connection exists | Failure behavior |
| --- | --- | --- | --- |
| Current and target publication workflow runs | Canonical manifests and image-publication evidence | Select exact official release artifacts rather than rebuilding an ungoverned image | Non-success, wrong workflow/ref, reused run, wrong target SHA, incomplete artifact set, or mixed identity blocks before mutation |
| Canonical image references | GitHub attestation verification | Independently confirm exact repository, signer workflow, source commit/ref, and GitHub-hosted publication policy | Missing or mismatched SLSA provenance blocks before image pull |
| Current release manifest/config/secrets | Clean Compose project | Prove the initial supported topology starts from absent application containers/network and exact external inputs | Existing project state, unsafe paths, invalid topology, or mutable/mixed identity blocks installation |
| One-shot migration service | Schema `0.2` migration evidence | Bind successful Prisma, Drizzle, and ClickHouse completion to one exact release and migration inventory | Duplicate/no-overwrite target, identity mismatch, migration failure, or evidence digest mismatch stops the lifecycle |
| Current operations/web | Install and restart diagnostics | Prove first startup and idempotent restart independently without rerunning migrations | Missing health, reused diagnostic digest, or any BLOCKED/UNAVAILABLE check stops the lifecycle |
| Current exact source and database | Backup manifest and isolated restore evidence | Preserve the recovery boundary for the installed schema before target mutation | Archive, migration parity, tool compatibility, cleanup, freshness, or digest failure blocks upgrade |
| Target exact source and live migration history | Controlled upgrade preflight | Classify application-only versus append-only migration transitions without history rewrite | Divergent/reordered/rewritten migration history or missing operator/recovery acknowledgement blocks target deployment |
| Target manifest/image | Target migration, operations/web, and diagnostics | Prove the candidate release can own the exact schema and application plane | Migration, startup, worker, web, dependency, or diagnostic failure stops before rollback decision |
| Upgrade kind | Rollback boundary | Exercise real application rollback for unchanged schema or prevent unsafe old-app startup when restore is required | Missing rollback diagnostic or attempted previous-app startup on forward schema blocks final evidence |
| Compose project | Teardown observations | Ensure the disposable application plane leaves no containers or application network | Remaining container/network blocks evidence assembly |
| Ordered bounded source artifacts | Lifecycle evidence assembler | Produce one canonical, sanitized, no-overwrite release artifact | Unknown fields, mixed lineage, chronology failure, reused evidence, unsafe rollback, or digest mismatch fails closed |

## Ownership

- The protected lifecycle workflow owns official publication-run selection, attestation verification, dedicated-runner policy, source checkout, and final artifact retention.
- `flowcordia-self-host-lifecycle-run.sh` owns phase ordering and destructive disposable application-plane commands.
- The current release source owns current database backup and restore-rehearsal migration inventory.
- The target release source owns artifact validation, target topology/upgrade logic, lifecycle evidence assembly, and source identity.
- The migration evidence script owns atomic no-overwrite completion evidence for each exact release.
- Existing Compose, doctor, recovery, and upgrade contracts remain authoritative for their own bounded checks.

## Trust boundary

- The workflow runs only from protected `main` on a dedicated self-hosted runner and never from pull requests.
- Publication provenance must originate from the official GitHub-hosted image-publication workflow; lifecycle execution itself is self-hosted.
- Config, secrets, provider URLs, archives, raw logs, and temporary diagnostics remain outside committed or uploaded evidence.
- Only the final bounded lifecycle JSON is retained as an Actions artifact.
- The workflow exercises the Flowcordia application plane, not a complete inherited Trigger.dev execution workflow.
