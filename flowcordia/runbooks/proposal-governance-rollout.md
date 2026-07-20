# Proposal governance rollout

## Preconditions

- Flowcordia Studio is enabled for a dedicated test organization.
- A GitHub repository and production branch are connected and healthy.
- The repository has branch protection/rules that do not grant the Flowcordia app a bypass.
- Exact-head function validation is deployed and its rollout smoke test has passed.
- Operators can inspect application logs and the `flowcordia.proposal_governance_*` tables.

## Database rollout

1. Back up the target database and record the current application revision.
2. Apply `20260719010000_flowcordia_proposal_governance` before serving code that reads the policy.
3. Confirm both governance tables, unique keys, checks, indexes, and foreign keys exist.
4. Confirm no policy row exists outside its organization/project/repository foreign-key scope.
5. Deploy one application cohort; do not enable a repository-wide rollout yet.

## Connected acceptance

1. Open Studio with more than one proposal and select a non-first proposal.
2. Confirm the panel head matches that proposal's durable and GitHub head.
3. Save an initial policy requiring a known check and reviewer; verify version `1`, digest, actor, and created audit event.
4. Add another requirement and verify version increments and an updated event is written.
5. Attempt to remove the requirement; verify `403`, unchanged version/digest, and no update event.
6. Approve a stale head and confirm it does not count.
7. Approve the current head, pass required checks, and pass exact-head function validation; confirm `SATISFIED`.
8. Push a new commit; confirm prior approvals and validation do not authorize the new head.
9. Promote with a fixed request ID, then safely retry that identical request; confirm one semantic policy-selection event and no duplicate merge mutation.
10. Confirm the policy-selection and proposal lifecycle audit records share the request correlation.

## Protected promotion automation

The manual **Flowcordia governed promotion acceptance** workflow automates only steps 7–10 of the connected acceptance sequence after an operator has prepared one exact proposal head and policy-satisfied GitHub evidence. It requires a dedicated protected environment, exact reference-repository coordinates, the exact proposal and head, and the destructive confirmation `PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL`.

The harness uses the existing Studio promotion dialog and server command. It cannot create approvals, change policy, bypass repository rules, trigger production, or roll back. A failure after the final confirmation may have caused a real merge; inspect GitHub and the durable proposal before any rerun.

## Negative and resilience checks

- Temporarily deny GitHub reads; evidence must become unavailable and promotion must stay disabled/server-blocked.
- Make function validation unavailable while GitHub remains readable; GitHub evidence must stay visible.
- Open the PR as draft or introduce a conflict while validation is pending; state must be blocked, not merely pending.
- Rename the repository in the test organization, refresh the connected repository record, and prove the existing policy is still read.
- Submit a stale expected policy version from a second session; verify conflict without partial state.
- Inspect browser loader/action payloads for internal IDs, actor/correlation values, credentials, raw GitHub bodies, source, fixtures, outputs, and stack traces.

## Rollback

Before the migration is applied anywhere, revert this isolated PR normally.

After the migration is applied:

1. stop new Studio promotion traffic for the affected cohort;
2. preserve policy and audit rows for diagnosis;
3. roll application code back to the preceding compatible revision;
4. leave additive governance tables in place unless a separately reviewed database rollback is required;
5. never bypass GitHub repository rules or exact-head validation to compensate for an application issue.

Because the migration is additive, leaving unused tables is safer than dropping audit evidence during an application rollback.
