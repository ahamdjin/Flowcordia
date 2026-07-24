# Proposal operations worker runbook

## Scope and isolation

This worker drains Flowcordia proposal outbox events and reconciles GitHub proposal truth. It does not execute customer workflows and does not import or register with Trigger.dev's legacy Graphile worker, common Redis worker, run engine, queue catalog, or supervisor.

The single runtime connection is `entry.server.tsx -> worker/lifecycle.server.ts`. The lifecycle checks `FLOWCORDIA_PROPOSAL_WORKER_ENABLED` before constructing the publisher or accessing worker secrets. Existing deployments therefore retain exactly their previous behavior when the new variables are absent.

## Deployment order

1. Apply `20260715120000_flowcordia_proposal_operations_worker` and `20260721000000_flowcordia_operations_worker_heartbeat`.
2. Deploy all code with the worker flag unset or `0`.
3. Prepare an external durable HTTPS consumer that verifies the exact request body using `x-flowcordia-signature`, deduplicates `x-flowcordia-idempotency-key`, and returns 2xx only after durable acceptance. Flowcordia does not expose an internal `/api/flowcordia/proposal-events` sink; pointing the worker at the web application is invalid.
4. Configure the URL and a 32+ character random secret in the secret manager.
5. Enable one worker replica. A dedicated worker deployment is recommended at enterprise scale; request-serving replicas should leave the flag off.
6. Observe one complete reconciliation refresh and outbox drain before scaling replicas or tenants.

## Health signals

Alert on expired operations heartbeat, oldest unpublished outbox age, unpublished count, retry attempts, endpoint non-2xx/timeout rate, reconciliation oldest `availableAt`, reconciliation attempts, expired locks, lease-loss rate, cycle failures, GitHub rate-limit delay, and proposals in `RECONCILING` or `FAILED`. The heartbeat contains only its fixed worker kind, observation/expiry timestamps, and timing budgets; it does not prove queue health by itself. Tenant/project identifiers may be logged only under the deployment's telemetry access and cardinality policy. Never log event bodies, workflow content, secrets, worker IDs, or lock tokens.

## Failure handling

| Symptom | Safe interpretation | Action |
| --- | --- | --- |
| Event endpoint 4xx/5xx or timeout | Event remains unpublished and is eligible after jittered backoff. | Repair the consumer; keep its idempotency ledger; do not delete outbox rows. |
| GitHub rate limit/network failure | Reconciliation schedule is deferred; aggregate state is unchanged. | Reduce batch/replicas or wait for reset; do not repeat mutations manually. |
| Missing branch, PR, or workflow | May be eventual consistency until bounded attempts expire. | Inspect installation access and deterministic branch before overriding anything. |
| Collision, marker/branch/head mismatch, or workflow digest mismatch | Remote identity cannot be trusted. Proposal fails closed with an audit/outbox event. | Investigate GitHub history and access; create a new proposal identity after resolution. |
| Database/version or lease conflict | Another writer won; stale worker cannot overwrite it. | Let the released/expired lease requeue against current state. |

## Rollback

Set `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0` and restart the worker deployment. This stops new claims without changing command APIs, webhooks, customer execution, or existing worker fleets. Keep the migration and durable rows so publication and reconciliation can resume. Rotate or revoke the event signing secret if the endpoint is retired.
