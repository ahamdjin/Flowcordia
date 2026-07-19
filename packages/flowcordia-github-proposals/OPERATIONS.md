# Operations and reconciliation

## Durable lifecycle

Do not run proposal creation as an unrecorded chain inside one HTTP request. Persist a proposal aggregate and an outbox command before the first GitHub mutation.

```text
draft intent -> creating branch -> storing workflow -> opening PR -> draft PR
draft PR -> submitting -> reviewable PR
reviewable PR -> policy blocked | promoting -> merged
any mutation -> reconciling -> previous/next proven state | manual attention
```

The durable record carries tenant, project, installation, repository, proposal ID, workflow ID, creator GitHub reviewer identity (or explicit `null`), base branch and commit, proposal branch, pull-request number, last observed head SHA, desired canonical workflow hash, correlation ID, operation state, attempt metadata, and timestamps. It stores no installation token or secret value.

Use a transactional outbox for audit receipts and webhook-derived projection changes. Workers claim commands with leases; a correlation ID prevents two workers from intentionally running the same transition concurrently. The GitHub expected-SHA checks remain necessary because a database lease cannot lock GitHub.

## Mutation and reconciliation table

| Phase | Mutation attempts | Safe reconciliation | Proven success |
| --- | ---: | --- | --- |
| Create branch | 1 | Read deterministic branch ref | Branch exists at the exact base commit, or later state is verified by the workflow/PR mapping. |
| Store workflow | 1 | Read branch workflow and compare canonical content | Desired content exists and its commit/blob identities are captured. |
| Create draft PR | 1 | List all PRs for exact owner-qualified head and base | Exactly one PR has the proposal marker, branch mapping, and current head. |
| Mark ready | 1 | Re-read PR | Exact head is no longer a draft. |
| Merge | 1 | Re-read PR | Exact head is merged and has a merge commit SHA. |

Never automatically repeat a mutation whose outcome may have succeeded. If reconciliation shows the old state, an idempotent recovery worker or operator may explicitly authorize a new attempt using the latest exact identities. If reconciliation shows different state, stop with collision/conflict. If GitHub reads are unavailable, retain `ambiguous_mutation` and retry only the safe reconciliation read.

## Scale and event flow

Use installation and repository webhooks to maintain proposal/search projections. Process deliveries at least once and deduplicate by delivery ID. Partition workers by installation and repository to control ordering and secondary rate limits; use bounded concurrency and a fair queue so one enterprise tenant cannot starve others.

Do not poll every open pull request. Poll narrowly only when a webhook gap is detected or an ambiguous transition is awaiting reconciliation. Promotion still performs a fresh authoritative read; the projection is for UI latency, search, and scheduling, not the final decision.

GitHub review, check, and status collections are paged up to explicit fail-closed bounds. A collection
that exceeds its bound is an operational exception and cannot authorize promotion from partial
evidence. Rate-limit responses surface reset timing; callers schedule work rather than sleeping
request workers. Apply jitter to safe read retry scheduling outside this package.

## Required telemetry

Record operation, phase, result code, outcome, tenant/project/installation identifiers, repository, proposal ID, workflow ID, base branch/commit, proposal branch, PR number, expected/actual head, merge commit, correlation ID, GitHub request ID, duration, reconciliation age, and rate-limit delay. Do not record workflow content, PR bodies, raw errors, tokens, or secrets.

Track at minimum:

- proposal transitions and latency by phase;
- policy blockers by code, check name, and anonymized reviewer class;
- base/head conflicts and proposal collisions;
- ambiguous mutations by phase and oldest reconciliation age;
- GitHub primary/secondary rate-limit events by installation;
- evidence-bound failures by collection and repository;
- webhook delivery lag, duplicates, and detected gaps;
- merge declines after local policy passed;
- outbox backlog, worker lease expiry, and dead-letter count.

Alert when an ambiguous merge or branch creation remains unresolved, webhook lag exceeds the product objective, collisions increase unexpectedly, merge declines indicate policy drift, or one installation approaches sustained rate exhaustion.

## Rollback and disablement

Application rollback disables new create/submit/promote commands while keeping safe reads and reconciliation workers available. Never force-push, rewrite proposal history, delete evidence, or mark a PR merged in the database without GitHub proof.

A workflow rollback is a new proposal that restores a previously reviewed definition. A code rollback of this adapter must preserve durable proposal/outbox schema compatibility or ship an explicit migration and replay plan.
