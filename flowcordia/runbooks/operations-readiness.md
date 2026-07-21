# Flowcordia operations readiness

The Operations readiness check is a manual, authenticated release gate for one connected project and repository. Run it before production acceptance, after promotion, and after a rollback. It reads durable operations state without claiming work, publishing events, reconciling GitHub, retrying mutations, or executing customer workflows.

## Prerequisites

1. Apply `20260721000000_flowcordia_operations_worker_heartbeat` before deploying code that writes or reads the heartbeat.
2. Run the proposal operations worker in at least one explicitly enabled deployment.
3. Keep request-serving replicas disabled when a dedicated worker deployment owns the loop; readiness observes the durable heartbeat rather than the webapp replica's local flag.

## Checks

- active proposal operations worker heartbeat;
- unpublished project proposal events, original event age, and maximum attempts;
- due project proposal reconciliation, overdue age, and maximum attempts;
- expired outbox and reconciliation leases;
- stale proposals still in `RECONCILING`;
- terminal proposal failures observed during the previous 24 hours.

The command resolves tenant, project, installation, and repository scope from the authenticated server context. Its repeatable-read snapshot returns only bounded counts, whole-second ages, retry counts, fixed states, and fixed messages. Event payloads, endpoints, signing secrets, tenant/project/repository IDs, worker IDs, lock tokens, raw rows, and provider errors remain server-only.

## Release interpretation

- `READY` — the worker is live and queues, leases, and proposals are within the release objectives.
- `ATTENTION` — pending work is retrying or delayed, or a proposal failed recently. Review the evidence before acceptance.
- `BLOCKED` — the worker heartbeat expired, work exceeded its blocked-age objective, a lease expired, or a proposal remains stale in reconciliation. Do not accept the release.

A green repository CI run does not replace this check. Record the deployed application commit, the check time and state, and the exact release or rollback identity in the connected acceptance evidence.

## Failure handling

- Expired heartbeat: verify the dedicated worker deployment, feature flag, database access, and shutdown/restart history. Do not enable the loop on every request-serving replica as a shortcut.
- Old or retrying outbox: repair the idempotent event consumer; do not delete rows or mark events published manually.
- Old or retrying reconciliation: inspect GitHub installation access and rate limiting; do not repeat ambiguous mutations.
- Expired lease: inspect worker shutdown, database latency, and lease budgets before scaling replicas.
- Stale `RECONCILING`: diagnose using durable proposal and GitHub identities; create a new proposal only after remote state is understood.
- Recent `FAILED`: inspect bounded audit evidence and the corresponding GitHub history.

## Rollback

The UI and command are read-only and can be removed without changing durable proposal state. To stop operations processing, set `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0` only on the worker deployment and restart it. The heartbeat will expire automatically; keep the migration and durable rows so processing can resume safely.
