# Governed promotion acceptance

## Purpose

Prove that one already-reviewed Flowcordia proposal can be promoted through the existing policy-governed Studio command and observed as merged at the exact expected head. This is a destructive connected acceptance run and is deliberately separate from readiness, structural preview, live preview, production execution, and rollback.

## Preconditions

- Use only a dedicated internal reference repository with non-customer data.
- Configure and protect the GitHub environment `flowcordia-promotion-acceptance` with required reviewers and branch restrictions.
- Store the connected base URL and a dedicated acceptance-account Playwright storage state in that environment.
- The exact proposal must already be `READY` and its governance projection must be `SATISFIED` for the current head.
- Required GitHub checks, current-head approvals, repository-function validation, mergeability, branch rules, and repository rules must already pass.
- The acceptance account must have Flowcordia Studio access and GitHub write permission, but must not have a repository-rules bypass.

## Required operator inputs

The manual **Flowcordia governed promotion acceptance** workflow requires:

- the exact confirmation `PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL`;
- workflow Studio and proposal-workspace relative paths;
- public workflow and proposal IDs;
- exact lowercase 40-character proposal head;
- exact lowercase 40-character deployed Flowcordia application commit;
- dedicated reference repository owner, name, and production branch;
- reviewed merge method: squash, merge, or rebase.

The harness refuses to construct a run when any identity is missing, malformed, ambiguous, or different from the browser projection.

## Execution contract

1. Open authenticated workflow Studio and require the requested workflow and exact deployed application commit.
2. Run connected repository readiness and require `READY`, zero blocked checks, zero unavailable checks, and exact repository coordinates.
3. Open the proposal workspace with the exact proposal query.
4. Require writable access, proposal state `READY`, exact head, action `promote`, governance `SATISFIED`, and governance evaluated at that same head.
5. Open the existing promotion dialog.
6. Select the operator-supplied merge method.
7. Click the existing **Verify and promote** command.
8. Wait for the same proposal to become `MERGED` while retaining the expected proposal head.
9. Require a bounded 40-character merge commit SHA.
10. Write sanitized evidence and remove browser state.

The harness does not submit a proposal, add reviews, change policy, retry with another head, call GitHub directly, bypass repository rules, trigger production, or roll back.

## Evidence schema

Schema `0.1` contains only:

- workflow and proposal public IDs and deployed application commit;
- start and completion timestamps;
- readiness result and public repository coordinates;
- governance state `SATISFIED` and evaluated head;
- expected proposal head, selected merge method, and observed merge commit.

It cannot represent payloads, outputs, cookies, tokens, browser storage, headers, actor identity, correlation identity, policy internal identity, provider responses, stack traces, screenshots, videos, or raw exceptions.

## Failure behavior

- invalid configuration writes fixed configuration-failure evidence before browser setup;
- wrong repository, workflow, proposal, head, branch, state, permission, action, or governance fails before mutation;
- after the confirmation click, a timeout or observation failure writes fixed promotion-failure evidence and does not automatically retry or compensate;
- a failed run may have caused a real merge and therefore requires manual inspection before any rerun;
- evidence from one proposal or head must never be attached to another lifecycle record.

## CI boundary

Pull-request CI validates the contract, isolated browser discovery, stable selectors, workflow security, and evidence redaction. It does not promote anything and does not count as connected promotion proof.

The protected environment run must execute against the exact deployed Flowcordia application commit being accepted. Any application-code change invalidates the prior promotion record and requires a new evidence artifact.

## Rollback

Removing this harness does not revert a proposal already merged by an acceptance run. Revert the harness commit to remove the automation. Any workflow rollback must follow the separate governed production-and-rollback procedure delivered in the next product boundary.
