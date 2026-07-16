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

`RECONCILING` means a remote mutation may have succeeded or a retryable failure prevented proof. The worker performs safe reads only. It requires one exact proposal PR, the terminal Flowcordia marker, matching base/head branches, branch/PR head agreement, and the canonical workflow digest. Missing resources receive bounded retry; collision, identity drift, invalid content, and digest mismatch fail closed. `FAILED`, `MERGED`, and `CLOSED` are terminal for the same creation identity.

## Transaction boundaries

Create reserves the aggregate plus `proposal.create.requested` audit/outbox rows before creating a branch, file, or PR. Submit and promote compare state, head SHA, and version, then persist their requested event before GitHub. A successful GitHub receipt updates the projection and appends `proposal.operation.completed` in one transaction. If post-call persistence fails, the requested event remains evidence for reconciliation.

Webhook delivery reservation, aggregate projection, audit event, outbox event, and delivery completion share one transaction. An exact delivery replay is a no-op. Out-of-order pull-request events are audited but do not regress state.

## Outbox delivery

Workers claim ready rows in short transactions with `FOR UPDATE SKIP LOCKED`, a worker ID, a random lock token, and an expiry. Publish outside the claim transaction. Acknowledge only when ID and lock token still match. On failure, release with bounded exponential jitter. Consumers must deduplicate using `dedupeKey`; delivery is at least once.

The standalone operations worker publishes a canonical v1 JSON envelope to the operator-configured HTTPS endpoint. `x-flowcordia-idempotency-key` is the durable dedupe key; `x-flowcordia-signature` is `sha256=<HMAC-SHA256(body)>`. The body excludes attempts, worker IDs, lease tokens, secrets, and upstream exception bodies and is capped at 256 KiB before a connection opens. Redirects and non-2xx responses fail delivery. The HTTP deadline, batch size, and lease are validated together during boot.

Reconciliation has a separate table and lease token so operational credentials never appear in proposal API responses. Active proposals are rescheduled for periodic proof; terminal proposals remove their schedule. Multiple replicas are safe because claims use `FOR UPDATE SKIP LOCKED` and completions compare both lock token and proposal version.

## Required telemetry

Track command outcome and latency by operation/state, concurrency conflicts, reconciliation age, policy blocker codes, webhook lag/duplicates/replay mismatches/identity mismatches, outbox ready/leased/oldest age, lease loss, attempts, publication failures, GitHub request IDs, and rate-limit delays. Labels may include organization/project/installation IDs only where the telemetry system's cardinality and access policy permit. Never label workflow content, raw payload hashes, emails, tokens, or exception bodies.

## Rollout and rollback

1. Apply the database migration and deploy with `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0` (the default).
2. Route the GitHub App webhook and observe delivery/outbox lag while proposal writes remain allowlisted.
3. Configure an HTTPS event endpoint and a unique 32+ character signing secret; make the consumer deduplicate before acknowledging events.
4. Enable one worker replica, verify outbox age, reconciliation age, lease loss, GitHub rate limits, and endpoint latency, then add replicas if required.
5. Expand proposal writes and worker placement gradually. A dedicated webapp worker deployment may enable the flag while request-serving replicas keep it off.

Runtime rollback sets `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0`; command routes and verified webhooks continue, and durable outbox/reconciliation rows remain replayable. Do not remove the tables, rewrite proposal branches, delete audit events, or mark proposals merged without GitHub proof.
