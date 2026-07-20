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

Before durable verification, Flowcordia also compares the immutable base commit to the exact proposal head. The head must descend from that base, and every changed file must be an added or modified workflow JSON file, deterministic generated task, or declared source patch. The workflow, generated task, and every source patch are then re-read and content-verified at that same head. An unrelated file, rename, removal, diverged history, or incomplete GitHub comparison fails closed.

## Source behavior

The proposal restores the historical workflow and each catalog-referenced function entrypoint file through the existing governed source-patch service. Current blob identities remain optimistic concurrency guards. A missing current entrypoint may be recreated. Source deletion is not supported.

This v1 boundary does not discover or restore modules imported by those entrypoints. Operators must review the complete pull-request diff and must not claim behavioral code rollback when a referenced function depends on helper modules that changed after the target revision. A governed dependency manifest or verified dependency closure is required before Flowcordia can restore transitive source safely.

## Failure handling

Refresh before retrying after current proposal movement or repository changes. Do not retry an uncertain GitHub mutation blindly; Flowcordia keeps that attempt pending while the existing proposal reconciliation path resolves it.

A definitive failure or a proposal closed without promotion remains durable. A new numbered attempt is available only through the explicit retry action and only after Flowcordia proves that the previous proposal branch is absent or its pull request is closed without merge. Close an open pull request without merging it, or delete a branch-only attempt, before asking Flowcordia to inspect again. A merged, multiple, or otherwise ambiguous prior pull request blocks the retry.

Flowcordia blocks submit and promote for every rollback proposal until the durable rollback intent proves the exact workflow, generated artifact, expected source patches, allowed changed-path set, and immutable base lineage at the final proposal head. Generic GitHub reconciliation cannot bypass this gate.

If a verified proposal head changes afterward, Flowcordia retires that attestation. Do not merge the changed pull request. Close it without merging, then create a new numbered rollback attempt; refresh does not silently trust or re-verify a mutated proposal.

The reason is stored when each attempt is first reserved. Resuming that same pending or created attempt never overwrites its original reason, so recovery after a process restart does not depend on re-entering the text byte-for-byte.

A rollback is not complete when the pull request is created. Completion requires current review, promotion, deployment, protected production proof, and preserved connected evidence.
