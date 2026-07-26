# Beta failure acceptance

## Purpose

This protected campaign proves that one exact published Flowcordia Beta candidate remains bounded and recoverable under controlled load, queue saturation, approval-delivery worker loss, and provider outage. It reuses the bundled self-host installation, Trigger.dev task endpoint and queue, Flowcordia approval delivery ledger, existing alert email adapter, published self-host lifecycle evidence, and exact release diagnostics. It does not add a second queue, worker, retry engine, provider transport, or disaster-recovery implementation.

A green pull-request check proves only the harness and evidence contract. Beta evidence requires one successful protected `main` run against the exact published candidate after its official self-host lifecycle rehearsal.

## Protected inputs

The workflow consumes:

- one successful official `Flowcordia publish self-host image` run from the exact candidate commit;
- one successful official `Flowcordia published self-host lifecycle` run from the same commit;
- the existing protected bundled installation configuration, secrets, registry authentication, disposable work parent, and evidence directory;
- explicit confirmation `RUN-BETA-FAILURE-ACCEPTANCE`.

It runs only on the dedicated Linux x64 `flowcordia-release` runner with UID `1000`, under the existing bundled-acceptance protected environment and concurrency boundary.

## Controlled campaign

The disposable campaign performs these stages:

1. Verify the immutable publication artifact, release manifest, image digest, signed provenance, exact application commit, and official lifecycle artifact.
2. Install PostgreSQL, Redis, Electric, ClickHouse, MinIO, the private registry, S2, Docker proxy, web, operations, and supervisor on a unique empty Compose identity.
3. Run exact-release diagnostics and privately bootstrap one disposable project and production environment.
4. Deploy the existing API reliability fixture through the bundled CLI, Buildx, registry, supervisor, and S2 execution path.
5. Submit 24 distinct authenticated API-trigger requests concurrently and require every run to complete successfully. Preserve only the count, trigger-request p95, and bounded in-flight submission observation.
6. Occupy one concurrency-one queue slot, submit eight distinct runs with a 60-second queue TTL, require all eight to become `EXPIRED`, release the blocker, and require a new recovery run to complete.
7. Create one approval delivery with an already-expired `DELIVERING` lease and require the existing delivery service to reclaim ownership exactly once and finish as `SENT`.
8. Route the existing approval email adapter to a controlled local SMTP fixture, return one transient `451`, require bounded `PENDING` redrive state, restore provider acceptance, and require the same stable delivery ID to finish as `SENT` on attempt two.
9. Restart web, operations, and supervisor, then require exact-release diagnostics to return `READY` again.
10. Remove the SMTP fixture, every application and execution container, all three private networks, and all disposable volumes, and prove their absence.

## Disaster-recovery binding

The campaign does not repeat the destructive database lifecycle. Instead, its evidence consumes and validates the official lifecycle artifact for the same application commit and preserves only its immutable lineage:

- lifecycle workflow run and evidence digest;
- backup manifest digest;
- disposable restore-rehearsal digest;
- application-rollback or restore-required classification.

The failure campaign must begin after lifecycle evidence assembly. Missing, modified, expired, mixed-commit, or chronologically invalid lifecycle proof blocks the campaign.

## Evidence boundary

The schema `0.1` artifact contains only:

- repository, release, image, application commit, workflow run, and attempt identity;
- load submission/completion/failure counts, bounded in-flight count, and trigger-request p95;
- queue blocker, expiration count/status, and recovery-run identity/status;
- approval delivery IDs, attempts, lease-reclaim state, retry state, and terminal status;
- lifecycle, backup, restore, and rollback-classification digests;
- post-failure diagnostic and teardown states;
- start/completion timestamps and one canonical SHA-256 digest.

It rejects and does not preserve API keys, PATs, SMTP messages, recipients, payloads, outputs, headers, authorization, credentials, provider responses, database identities or contents, backup contents, private paths, container IDs, internal worker IDs, raw errors, or logs.

## Stop-ship results

The candidate is blocked when:

- any load request fails or remains non-terminal;
- trigger requests exceed the bounded 30-second p95 evidence ceiling;
- fewer than eight queued probes expire, the blocker is reused, or the post-pressure recovery run fails;
- an expired approval lease is not reclaimed exactly once;
- provider failure does not enter bounded retry state, changes delivery identity, exceeds two attempts, or fails to recover;
- post-failure diagnostics are not `READY`;
- any disposable resource remains after teardown;
- lifecycle backup, restore, rollback, release, or application lineage disagrees;
- evidence contains a forbidden field or its canonical digest changes.

## Deliberate limits

This campaign proves one supported single-host candidate and one bounded pressure profile. It does not establish unlimited throughput, high availability, regional failover, cross-region replication, point-in-time recovery, DDoS resistance, provider quotas, or a public service-level objective. Those claims remain unsupported until separately designed, measured, and evidenced.
