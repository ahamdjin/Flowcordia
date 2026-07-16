# Preview deployment rollout

## Preconditions

1. Keep Flowcordia Studio access limited to an internal organization.
2. Connect the target GitHub repository to the Trigger.dev project.
3. Enable the project's preview environment and GitHub preview deployments.
4. Confirm the repository has a valid `trigger.config.ts` and build settings.
5. If `trigger.config.ts` declares `dirs`, include `trigger/flowcordia` or its parent `trigger` directory.
6. Configure only reference-based runtime credentials and the required HTTP hostname allowlist.

## Validation

1. Synchronize a canonical workflow and publish one changed draft.
2. Confirm the proposal branch contains `.flowcordia/workflows/<workflow>.json` and `trigger/flowcordia/<workflow>.ts`.
3. Confirm exactly one active preview branch environment uses the proposal branch name.
4. Confirm the connected GitHub integration creates a deployment for the pull-request head.
5. In Studio, verify the preview moves from waiting to deploying to ready and shows the same head SHA and deployment version.
6. Start a live preview run with a non-sensitive JSON payload.
7. Verify the run is locked to the deployed worker version and the canvas updates node statuses.
8. Verify the loader response contains no API key, internal ID, payload, output, credential, generic metadata, worker ID, or raw error.
9. Push another proposal-head commit and verify the older deployment is no longer presented as ready.
10. Close the pull request and verify the preview becomes closed and the connected integration archives the branch environment.

## Failure checks

- Disable GitHub preview deployments and confirm proposal publication still succeeds while Studio reports `DISABLED`.
- Remove `trigger/flowcordia` from an explicit `dirs` list and confirm the run command reports `task_not_deployed` without falling back to another task version.
- Submit a stale head SHA and confirm the command returns a conflict.
- Deny task-trigger permission and confirm the command returns `403`.
- Write malformed or unrelated run metadata and confirm the canvas shows no node state.

## Rollback

1. Disable Flowcordia Studio access to remove the publish and live-run controls.
2. Disable GitHub preview deployments if proposal branches must stop creating builds.
3. Close affected pull requests so the existing GitHub integration archives their preview branches.
4. Do not delete deployment or run rows; they remain operational evidence.
5. Reverting the UI and adapters does not require a database migration or runtime-engine drain.
