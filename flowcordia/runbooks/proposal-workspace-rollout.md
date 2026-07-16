# Proposal workspace rollout runbook

## Preconditions

1. Deploy the durable proposal control-plane migrations and verify the internal proposal resource from the preceding stack layers.
2. Confirm the target project has one active GitHub installation, a connected repository, and a valid production branch policy.
3. Confirm required GitHub App permissions, webhook delivery, and proposal reconciliation are healthy.
4. Keep `FLOWCORDIA_STUDIO_ENABLED` unset or `0` during the initial deployment.

## Cohort rollout

1. Deploy the Studio code while the flag is dark.
2. Open the route as a platform admin and verify repository identity, state labels, keyset pagination, and the empty/configuration states.
3. Enable `hasFlowcordiaStudioAccess` for one test organization through the existing feature-flag administration path. Prefer this over global enablement for the first cohort.
4. Test with one GitHub-read user and one GitHub-write user. The reader must never receive actionable buttons; the writer may only receive actions allowed by durable state.
5. Submit a draft and confirm the browser request includes the observed head while the response contains only `ok`, `proposalId`, `state`, and `updatedAt`.
6. Change the branch head outside Flowcordia and prove the stale promotion is rejected. Do not automatically retry it.
7. Satisfy the configured GitHub approvals/checks, promote once, and verify the merged state arrives through webhook/reconciliation before expanding the cohort.
8. Inspect browser loader/action payloads and logs for tenant IDs, installation IDs, database IDs, actor IDs, correlation IDs, workflow content, raw provider errors, or credentials. Treat any appearance as a release blocker.
9. Expand organization cohorts gradually. Set `FLOWCORDIA_STUDIO_ENABLED=1` only when the surface is intended for every eligible organization; organization overrides can still disable selected tenants.

## Operational signals

Use the existing authenticated request telemetry, proposal audit/outbox events, GitHub App delivery health, and proposal-operations-worker signals. Alerting and investigation remain anchored on proposal ID plus controlled server-side scope; do not add tenant or workflow content to unrestricted client telemetry.

| Symptom | Safe interpretation | Action |
| --- | --- | --- |
| Navigation absent and direct route is 404 | Studio feature access is disabled | Check organization/global flags and the environment default. |
| Safe “not connected” state | Repository or production branch binding is incomplete | Repair the existing GitHub project connection; do not accept browser-supplied scope. |
| Action absent | RBAC, durable state, or observed head does not permit it | Inspect the proposal and reconciliation state; do not bypass the service. |
| `409` on submit/promote | Proposal or head changed concurrently | Refresh, inspect GitHub, and let the user decide against the new head. |
| `502`/`503` from a command | GitHub or persistence is unavailable/rate-limited | Preserve the proposal state; use worker/reconciliation guidance before retrying. |
| Proposal remains `RECONCILING` | Remote identity or mutation outcome is not proven | Follow the proposal operations worker runbook; never repeat the mutation manually. |

## Rollback

1. Set the organization override to false, or set `FLOWCORDIA_STUDIO_ENABLED=0` and restart the webapp for a global rollback.
2. Confirm navigation disappears and direct workspace access returns not found for normal users.
3. Leave proposal tables, the internal resource route, webhook ingestion, and the operations worker intact so in-flight records can reconcile.
4. Revert the Studio code only after the feature is dark. No schema rollback or runtime drain is required by this slice.
