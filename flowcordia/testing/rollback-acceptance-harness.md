# Rollback acceptance harness

## Purpose

The protected **Flowcordia rollback proposal acceptance** workflow creates one governed rollback proposal through the existing authenticated Studio command. It does not call GitHub directly, merge the proposal, deploy it, execute it, or rewrite repository history.

## Exact identity boundary

Before mutation, the browser must match the operator-supplied:

- deployed Flowcordia application commit;
- current workflow proposal, proposal head, and merge commit;
- current repository base commit and workflow blob;
- earlier reviewed target proposal, proposal head, and merge commit.

The operator must type `CREATE_EXACT_FLOWCORDIA_ROLLBACK_PROPOSAL_ACCEPTANCE` to start the protected harness. Studio still requires its own `CREATE_FLOWCORDIA_ROLLBACK_PROPOSAL` confirmation before it submits the existing server command.

## Protected environment

Configure `flowcordia-rollback-acceptance` with required reviewers and branch restrictions. Store only:

- `FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL`;
- `FLOWCORDIA_ROLLBACK_ACCEPTANCE_STORAGE_STATE_B64` for a least-privilege rollback operator.

Use a non-sensitive workflow input for the rollback reason. The reason is submitted to the governed rollback command for provenance but is deliberately forbidden from the uploaded evidence artifact.

## Evidence and continuation

Schema `0.1` evidence records the immutable current, base, target, created rollback proposal head, and public pull request number. It excludes the reason, browser state, credentials, payloads, outputs, internal IDs, provider data, and raw errors.

A passed artifact proves proposal creation only. Continue through the ordinary proposal checks, reviews, exact-head validation, and governed promotion workflow. After the rollback merge reaches production, run **Flowcordia production acceptance** in `rollback_production` mode against the new proposal, merge commit, deployment version, and a new verified run.
