# Workflow index and Studio rollout

## Preconditions

- PRs #4 through #10 have been merged or this stacked branch is deployed together.
- The Flowcordia database migrations are applied.
- The GitHub App is enabled and its webhook points to `/webhooks/flowcordia/github`.
- The app receives `push` events in addition to the existing proposal events.
- The project has one connected GitHub repository and a valid production branch mapping.
- `FLOWCORDIA_STUDIO_ENABLED` and organization access remain dark during migration validation.

## Deployment sequence

1. Apply `20260715160000_flowcordia_workflow_index`.
2. Verify the four `flowcordia.workflow_index_*` tables and their foreign keys exist.
3. Deploy the webapp with Studio still disabled and `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0`.
4. Send a signed test push delivery and confirm it is ignored or scheduled according to the tracked branch without exposing payload data.
5. Enable Studio for one internal organization.
6. Open the Workflows page and run **Synchronize repository** as a GitHub-write user.
7. Confirm the UI commit SHA matches the connected production branch commit.
8. Confirm valid workflows render and invalid workflows are visible but blocked.
9. Enable the existing Flowcordia operations worker flag on one replica.
10. Push a workflow-only commit and verify the delivery becomes `SCHEDULED`, the worker reaches `IDLE`, and the canvas reflects the exact pushed commit.
11. Expand organization access only after sync age, failure rate, GitHub rate limiting, and catalog size are healthy.

## Required operating signals

Monitor at minimum:

- oldest `PENDING` or expired `RUNNING` sync age;
- sync state counts and failure codes;
- requested commit versus observed commit;
- entry, valid, and invalid counts;
- push delivery `RECEIVED` age and replay mismatches;
- GitHub rate-limit and unavailable errors;
- exact-source mismatch blocks in Studio;
- worker cycle duration and lease expiry.

No credential values, raw workflow documents, raw webhook bodies, lock tokens, database IDs, or raw GitHub errors belong in logs or metrics.

## Common failures

### Studio says not connected

Recheck the authenticated organization/project, active GitHub App installation, connected repository identity, and production branch mapping. Do not accept repository coordinates from the browser to bypass the failure.

### Tree truncated

The previous catalog remains active. Reduce repository tree size or replace recursive repository discovery with a reviewed subtree traversal before retrying. Do not accept a partial catalog.

### Workflow invalid

Open the exact indexed path and commit, correct the canonical workflow contract, and push a new commit. Invalid entries are expected to remain visible and non-renderable.

### Sync failed after a GitHub outage

The last good catalog remains available. Retry manually or schedule a new exact push request after GitHub recovers. Never mutate the observed commit without completing a full snapshot.

### Sync appears stuck running

Check `lock_expires_at`. A healthy worker may reclaim only after expiry. Do not clear a live lock manually. For emergency recovery after the worker is stopped, set the row to `PENDING` and clear lock fields in one controlled transaction, preserving generation and audit evidence.

### Push delivery remains received

Replay the exact signed delivery bytes if available. Same-ID/same-hash receipt is safe to resume; same-ID/different-hash is a security incident and must remain rejected.

## Rollback

1. Disable organization Studio access.
2. Set `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0` and allow the active index cycle to stop.
3. Revert the application routes, webhook push handler, index worker, and GitHub discovery adapter.
4. Keep the `flowcordia` index tables during application rollback so audit and recovery evidence is preserved.
5. Drop the dedicated tables/schema only in a separate reviewed data-retention change after confirming no rollback or forensic need remains.

The rollback does not change Trigger.dev deployments, run queues, run engine state, supervisor behavior, CLI behavior, customer workloads, or workflow proposal history.
