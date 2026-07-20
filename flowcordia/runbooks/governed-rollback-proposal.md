# Governed rollback proposal

Flowcordia rollback creates a new draft pull request. It never resets Git history, merges automatically, deploys a worker, or triggers production.

## Operator flow

1. Open the workflow in Studio.
2. Confirm the current governed proposal and merge commit.
3. Select one earlier proposal shown by the rollback panel.
4. Review the current and target commit identities.
5. Type `CREATE_FLOWCORDIA_ROLLBACK_PROPOSAL` exactly.
6. Create the rollback proposal.
7. Review its workflow diff and any referenced source patches in GitHub.
8. Run current structural and executable validation.
9. Obtain current approvals and checks.
10. Promote normally, then verify the newest production deployment and production proof.

## Server checks

Before proposal creation, Flowcordia re-resolves the current repository scope, latest merged workflow proposal, selected historical proposal, current branch workflow, historical workflow at the target merge commit, exact function catalogs, and each referenced JavaScript or TypeScript source file.

Historical and current function definitions must match. Catalog drift blocks rollback because this boundary does not modify `.flowcordia/functions.json`.

## Source behavior

The proposal restores the historical workflow and referenced function source files through the existing governed source-patch service. Current blob identities remain optimistic concurrency guards. A missing current source file may be recreated. Source deletion is not supported.

## Failure handling

Refresh before retrying after current proposal movement or repository changes. Do not retry an uncertain GitHub mutation blindly; use the existing proposal reconciliation state.

A rollback is not complete when the pull request is created. Completion requires current review, promotion, deployment, protected production proof, and preserved connected evidence.
