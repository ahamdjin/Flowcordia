# Rollback runbook

## Foundation changes

The foundation is additive. Rollback removes the hidden Flowcordia route and feature folder, then reverts the associated commit. It does not require a database migration.

## Workflow release rollback

1. Identify the last approved Git commit and compatible deployment version.
2. Confirm referenced credentials and node versions still exist.
3. Promote or redeploy the previous version using the existing deployment lifecycle.
4. Verify a controlled test run before restoring normal triggers.
5. Record the rollback reason, operator, source SHA, deployment version, and validation result.

## Safety rules

- Never force-move protected production branches.
- Never delete the failed version before incident review.
- Never roll back a workflow model across an incompatible data or secret migration without its migration runbook.
- Runtime subsystem rollback follows Trigger.dev's existing deployment and infrastructure procedures until superseded by a dedicated Flowcordia runbook.

