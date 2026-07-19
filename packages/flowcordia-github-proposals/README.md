# `@flowcordia/github-proposals`

`@flowcordia/github-proposals` is the governed GitHub change layer for Flowcordia workflows. It creates deterministic proposal branches and draft pull requests, evaluates review/check policy, submits drafts for review, and promotes only the exact reviewed head commit.

GitHub remains authoritative for repository rules, branch protection, pull-request state, reviews, checks, and the final merge. This package provides a fail-closed product policy and auditable orchestration around those controls; it does not replace them.

## Guarantees

- A proposal branch is derived from a validated workflow ID and caller-generated proposal ID.
- The base branch must still resolve to the caller's exact base commit before branch creation.
- Workflow content is written through `@flowcordia/github-workflows`, preserving validation and expected-blob concurrency.
- Branch, workflow, pull-request, ready-for-review, and merge mutations are attempted once.
- An uncertain mutation is reconciled with safe reads; if intent cannot be proven, the result is `ambiguous_mutation` and automatic mutation stops.
- Existing branches and pull requests are reused only when branch, base, marker, head, and canonical workflow identity match.
- Approvals are distinct and apply to the current head by default; pull-request author and proposal-creator self-approval are excluded by default.
- Required checks include both GitHub check runs and legacy commit status contexts.
- Pull-request matches, reviews, check runs, and legacy commit statuses are read through explicit
  fail-closed bounds; policy evaluation never silently truncates GitHub evidence.
- Repository governance profiles are strictly normalized with locale-independent digests; application-owned current-head, self-approval, and changes-requested rules cannot be configured away.
- Promotion re-fetches authoritative state and passes the expected head SHA to GitHub's merge API.
- Successful and idempotent operations return an audit receipt for a durable outbox.

## Directory map

| Path | Responsibility | Why it is separate |
| --- | --- | --- |
| `src/branch/` | Proposal ID, object ID, and deterministic branch naming | Prevents Git-ref injection and makes recovery addressable. |
| `src/policy/` | Pure approval, reviewer, check, state, and identity evaluation | Lets the UI explain blockers without granting mutation authority. |
| `src/proposal/` | Proposal body, receipts, safe errors, and lifecycle orchestration | Keeps the enterprise state machine independent of Octokit response shapes. |
| `src/transport/` | Installation-scoped GitHub client port and structural Octokit adapter | Reuses the webapp credential lifecycle without adding another token path. |
| `test/` | Success, race, collision, policy, pagination, and ambiguous-outcome coverage | Protects the failure semantics required by large installations. |
| `SECURITY.md` | Authorization and trust boundaries | Makes confused-deputy and promotion risks reviewable. |
| `OPERATIONS.md` | Durable state, reconciliation, telemetry, and rollback | Defines how the lifecycle runs safely outside one HTTP request. |
| `CONNECTIONS.md` | Every producer/consumer boundary and failure owner | Prevents hidden coupling as the webapp integration grows. |

## Integration

The proposal and workflow resolvers must enforce the same tenant/project/installation/repository authorization decision. Both adapters reuse the existing installation-authenticated Octokit factory.

```ts
import { GitHubWorkflowStore, OctokitGitHubRepositoryClient } from "@flowcordia/github-workflows";
import {
  GitHubProposalService,
  OctokitGitHubProposalClient,
} from "@flowcordia/github-proposals";

const workflowStore = new GitHubWorkflowStore({
  clientResolver: {
    async resolve(scope) {
      const octokit = await installationClients.forAuthorizedRepository(scope);
      return new OctokitGitHubRepositoryClient(octokit);
    },
  },
});

const proposals = new GitHubProposalService({
  workflowStore,
  clientResolver: {
    async resolve(scope) {
      const octokit = await installationClients.forAuthorizedRepository(scope);
      return new OctokitGitHubProposalClient(octokit);
    },
  },
});
```

Persist the proposal record and operation intent before calling the service. Persist the returned audit receipt and update the proposal projection in the same database transaction. See [OPERATIONS.md](./OPERATIONS.md) for the state machine and reconciliation rules.

## Deliberate exclusions

This package does not store collaborative canvas drafts, receive webhooks, persist proposal records, approve on behalf of users, bypass repository rules, compile workflows, deploy runtime artifacts, or delete proposal branches. Those concerns are separate services with separate authorization and retention policies.

## Commands

```sh
pnpm --filter @flowcordia/github-proposals typecheck
pnpm --filter @flowcordia/github-proposals test --run
```
