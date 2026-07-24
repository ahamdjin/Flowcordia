# Multi-workflow proposal closure

## Decision

A workflow proposal that invokes subflows owns one exact root-to-leaf closure. Flowcordia discovers that closure server-side from the edited root and the exact base repository revision. The browser cannot supply child definitions, closure membership, generated source, or closure digests.

## Closure identity

Before a pull request opens, Flowcordia writes one immutable `.flowcordia/proposals/<proposal-id>.json` manifest. Schema `0.1` binds:

- proposal and root workflow identity;
- the exact base commit;
- every reachable workflow ID;
- each base workflow blob identity;
- each canonical workflow digest;
- each deterministic generated Trigger.dev artifact digest; and
- one canonical closure digest.

Entries are sorted, unique, bounded to 100 workflows, and digest-verified. Once written, a different manifest is a proposal collision. Retrying cannot silently add, remove, replace, or mutate closure members.

## Publication order

1. Validate the edited root.
2. Read every reachable child at the exact base commit.
3. Reject missing, mixed-revision, unreachable, recursive, contract-incompatible, foreign-repository, or un-compilable workflows.
4. Derive the canonical proposal branch name and reject a different existing closure manifest before any branch mutation.
5. Prepare the canonical proposal branch and root artifact.
6. Lock the closure manifest when the branch has no existing manifest.
7. Store every child workflow and generated artifact on the same proposal branch.
8. Apply governed repository source patches.
9. Open the draft pull request only after the complete closure exists.
10. Re-read the manifest, every workflow, and every artifact from the exact pull-request head.
11. Re-read the pull-request snapshot and require the head to remain unchanged.

Intermediate branch commits are not review authority. The draft pull request is created only after the complete closure is present, and the final stable head is authoritative.

## Failure and retry behavior

Missing children, contract drift, cycles, foreign code references, closure-size overflow, malformed manifests, manifest tampering, branch collisions, and final-head changes fail closed. Ambiguous manifest, workflow, or artifact writes are reconciled by exact read-back. A write is accepted only when the persisted bytes match the locked closure. A retry with different membership is rejected before the canonical root proposal writer can mutate the branch.

## Relationship to source patches

The existing source-patch proposal service wraps the workflow-closure service. The closure is prepared first, developer-owned source patches are applied second, and canonical proposal creation runs last. Final source-patch verification and final closure verification therefore observe one pull-request head.

## Exclusions

This contract proves reviewable repository closure. It does not prove that every generated child task is installed in a particular Trigger.dev preview or production deployment, add simultaneous Studio editing of multiple workflows, or provide cross-workflow rollback UI. Deployment installation proof and connected acceptance remain separate boundaries.
