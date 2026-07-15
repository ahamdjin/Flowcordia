# Operations and recovery

## State machine

```text
CREATING -> DRAFT -> READY -> PROMOTING -> MERGED
    |          |       |          |
    +----------+-------+----------+--> RECONCILING
    |                  +-- policy blocked --> READY
    +-- definitive failure --> FAILED

DRAFT/READY/PROMOTING -- verified PR close --> CLOSED
```

`RECONCILING` means a remote mutation may have succeeded or a retryable failure prevented proof. Only safe reads should run automatically. Operators or a reconciliation worker may resume the same immutable proposal identity after proving current GitHub state. `FAILED`, `MERGED`, and `CLOSED` are terminal for the same creation identity.

## Transaction boundaries

Create reserves the aggregate plus `proposal.create.requested` audit/outbox rows before creating a branch, file, or PR. Submit and promote compare state, head SHA, and version, then persist their requested event before GitHub. A successful GitHub receipt updates the projection and appends `proposal.operation.completed` in one transaction. If post-call persistence fails, the requested event remains evidence for reconciliation.

Webhook delivery reservation, aggregate projection, audit event, outbox event, and delivery completion share one transaction. An exact delivery replay is a no-op. Out-of-order pull-request events are audited but do not regress state.

## Outbox delivery

Workers claim ready rows in short transactions with `FOR UPDATE SKIP LOCKED`, a worker ID, a random lock token, and an expiry. Publish outside the claim transaction. Acknowledge only when ID and lock token still match. On failure, release with bounded exponential jitter. Consumers must deduplicate using `dedupeKey`; delivery is at least once.

The dispatcher is implemented in this PR, while deployment-specific broker publication and recurring worker scheduling remain a separate PR. Until that wiring ships, monitor the outbox table and do not delete rows: the durable audit trail and proposal API remain functional, and queued events are replayable.

## Required telemetry

Track command outcome and latency by operation/state, concurrency conflicts, reconciliation age, policy blocker codes, webhook lag/duplicates/replay mismatches/identity mismatches, outbox ready/leased/oldest age, lease loss, attempts, publication failures, GitHub request IDs, and rate-limit delays. Labels may include organization/project/installation IDs only where the telemetry system's cardinality and access policy permit. Never label workflow content, raw payload hashes, emails, tokens, or exception bodies.

## Rollout and rollback

1. Apply the database migration.
2. Deploy the webapp with the internal API and signed receiver disabled at the edge if the GitHub App URL is not yet routed.
3. Route the GitHub App webhook through the receiver or an existing verified fan-out and observe delivery lag.
4. Enable proposal writes for an allowlisted organization, then expand gradually.
5. Add the outbox publisher/worker before consumers depend on events.

Rollback disables create/submit/promote while leaving reads, webhook ingestion, and safe reconciliation available. Do not remove the tables, rewrite proposal branches, delete audit events, or mark proposals merged without GitHub proof.
