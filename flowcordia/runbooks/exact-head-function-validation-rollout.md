# Exact-head function validation rollout

## Preconditions

- Flowcordia Studio access is enabled for the organization.
- A GitHub repository is connected to the project production branch.
- Preview deployments are enabled.
- The repository contains a valid workflow and `.flowcordia/functions.json`.
- Every typed function used by the workflow has at least one non-sensitive repository fixture.
- The operator can write GitHub-backed Studio state and trigger `flowcordia-validate-<workflow-id>`.

## Automated acceptance

Before rollout, the unchanged pull-request head must pass:

- repository formatting and lint;
- root TypeScript and export checks;
- all package, internal, and webapp unit-test shards;
- production webapp build;
- webapp E2E;
- runtime suite validation, digest tamper, schema failure, output mismatch, and observer-isolation tests;
- exact-head suite construction and missing-fixture tests;
- metadata spoofing and promotion-gate tests;
- committed reference-repository validation proof.

## Connected smoke test

Use a dedicated connected test repository and proposal.

1. Open a workflow containing a typed repository function.
2. Edit its source or workflow and publish a governed proposal.
3. Confirm the preview environment branch matches the proposal branch.
4. Confirm the deployed commit SHA equals the proposal head.
5. Wait until Studio reports `ready to run` for the exact suite digest.
6. Start validation from Studio.
7. Confirm the task is `flowcordia-validate-<workflow-id>` and is locked to the exact deployment version.
8. Confirm Studio moves through queued/running to passed.
9. Confirm displayed evidence contains only IDs, counts, status, and bounded failure codes.
10. Promote the proposal and confirm validation does not block the passed exact head.

## Negative cases

### Changed proposal head

Push another commit after a passed validation. The old run must not satisfy the new head. Studio must build a new suite identity and promotion must remain blocked until it passes.

### Missing fixtures

Remove all fixtures from one used typed function. Suite construction must become blocked, no validation task should start, and promotion must fail with `function_validation_required`.

### Output mismatch

Change function behavior without changing the fixture expectation. Validation must fail with `output_mismatch`; no actual or expected output value may appear in Studio.

### Runtime exception

Make the function throw. Validation must report `execution_failed`; the private exception and stack must remain only in inherited runtime logs.

### Metadata tampering

Inject wrong proposal, head, digest, duplicate cases, inconsistent counts, unknown properties, or fixture values into metadata. Studio and promotion must ignore the metadata and fail closed.

### Permission denial

Remove task-trigger permission. The validation command must return 403 and must not start a run.

## Rollback

If validation orchestration causes rollout issues:

1. stop promoting proposals that contain typed functions;
2. preserve existing proposal branches, deployments, and runs for diagnosis;
3. revert this feature slice as one commit/PR;
4. do not bypass the promotion gate manually;
5. continue using structural preview and ordinary exact-head live preview while the validation slice is corrected.

Rollback does not require changing the Trigger.dev run engine or deleting customer workflow state because this slice adds no parallel runtime system.
