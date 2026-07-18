# Studio source-editing rollout

## Preconditions

Before enabling the source workspace for a cohort, confirm:

- the workflow-draft and source-buffer migrations are applied;
- the Flowcordia Studio feature gate is enabled only for the test organization;
- the project has one current GitHub App repository binding and production branch;
- preview deployments are enabled for the connected reference repository;
- the reference workflow contains a repository-owned typed-function node;
- the function catalog path, export, schemas, and fixture are committed;
- the operator can inspect proposal, build, deployment, and run state.

## Reference acceptance flow

Use one clean reference repository and record every exact identity.

1. Synchronize the repository and open a valid workflow in Studio.
2. Start or resume a durable workflow draft.
3. Open the Source workspace from Studio.
4. Select a repository-owned typed-function node.
5. Open exact source and confirm the displayed path and export match the repository at the draft base commit.
6. Change the source and save the buffer.
7. Reload the browser and confirm the same source buffer and version resume.
8. Run Structural Preview and confirm the edited source is not executed.
9. Publish the combined proposal.
10. Confirm one draft pull request contains the workflow intent, generated Trigger.dev task, and exact source change.
11. Confirm CI builds the repository at the pull-request head.
12. Confirm the preview deployment matches that exact head.
13. Run Live Preview and confirm the deployed edited function executes.
14. Confirm output and bounded node state return to Studio.
15. Merge through GitHub review and confirm the production synchronization observes the merged commit.

Record the draft public ID, workflow/base commit/blob/digest, source public ID/base blob/hash/version, proposal ID, pull-request number/head, deployment version, task ID, and run ID. Do not record source text, credentials, or full payloads in the rollout log.

## Negative checks

The rollout is not complete until these fail safely:

- select a non-function node for source editing;
- alter the function catalog after the draft starts;
- alter the source file after the draft starts;
- save with a stale source-buffer version;
- submit malformed UTF-8 or a source file over 256 KiB;
- attempt a protected or unrelated path;
- change the workflow draft in another session before publish;
- omit, duplicate, or submit a stale source-buffer identity during publish;
- edit a source buffer after exact proposal creation and confirm the later edit remains separate draft state with a different proposal identity;
- interrupt a source write and resume the same proposal;
- advance the pull-request head during final verification;
- request Live Preview before the exact proposal deployment is ready;
- reset a source file whose literal content is `RESET` and confirm the literal remains representable.

## Operating signals

Observe at minimum:

- active source-buffer count and age;
- source optimistic-conflict count;
- stale-source failures;
- source proposal create/resume/failure/reconciliation events;
- GitHub rate-limit and unavailable errors;
- proposal age by state;
- preview deployment age and exact-head mismatch;
- proposal source digest and changed-buffer source digest when diagnosing later draft edits.

Alerts and dashboards must use IDs, hashes, counts, states, and ages only. Do not emit source text.

## Rollback

1. Disable the Flowcordia Studio cohort or global feature flag.
2. Stop new source commands and proposal publication.
3. Leave existing draft buffers inert; do not delete them during incident response.
4. Allow existing reviewed Trigger.dev runs to complete under normal runtime controls.
5. Reconcile any proposal left in `CREATING` or `RECONCILING` against GitHub.
6. If a proposal branch contains an unwanted source patch, close the pull request or revert through GitHub review. Do not mutate production source directly from Flowcordia.
7. Re-enable only after exact source, proposal, deployment, and run identities are proven again.
