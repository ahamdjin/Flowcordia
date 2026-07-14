# `@flowcordia/github-workflows`

`@flowcordia/github-workflows` is the installation-scoped storage boundary between Flowcordia and GitHub repositories. It reads, validates, migrates, creates, updates, and deletes canonical workflow documents without owning credentials, tenant authorization, UI state, or runtime execution.

## What this package guarantees

- Reads resolve a branch or revision once, then fetch content from that immutable commit SHA.
- Every update and deletion requires the blob SHA the caller previously read.
- Workflow validation and stable node/edge identity checks happen before a write.
- Canonical content that is already current does not create a noise commit.
- Safe reads use bounded, jittered retries; mutations are never blindly retried.
- Uncertain mutation outcomes return `ambiguous_write` and require reconciliation.
- Commit messages carry sanitized actor and correlation trailers.
- Successful mutations return a durable audit receipt for the caller's outbox.
- Workflow files default to `.flowcordia/workflows/<workflow-id>.json` and are limited to 1 MiB.

The package deliberately has no repository-wide `list` method. At enterprise scale, repository scans are slow, rate-limit intensive, and constrained by GitHub directory/tree response limits. A webhook-fed project index will own discovery; Git remains the authoritative workflow content and history.

## Directory map

| Path | Responsibility | Why it is separate |
| --- | --- | --- |
| `src/access/` | Tenant, project, installation, repository, branch, actor, and correlation validation | Keeps authorization inputs explicit and prevents path/ref injection. |
| `src/repository/` | Paths, canonical content, commit messages, retries, and storage orchestration | Owns workflow-specific Git behavior without owning authentication. |
| `src/transport/` | Small GitHub client port, sanitized transport errors, and the Octokit adapter | Allows the webapp to reuse its installation-authenticated Octokit client. |
| `test/` | Success, conflict, migration, rate-limit, invalid-content, and ambiguous-write behavior | Protects the failure semantics relied on by UI and API callers. |
| `SECURITY.md` | Trust and authorization boundaries | Makes multi-tenant requirements reviewable. |
| `OPERATIONS.md` | Metrics, alerting, retries, and reconciliation | Defines how this behaves under load and partial failure. |
| `CONNECTIONS.md` | Producer/consumer contract | Records who owns each side of the integration. |

## Integration

The resolver is the only authentication entry point. It must verify that the tenant and project own the selected installation and repository before returning an installation-scoped client.

```ts
import {
  GitHubWorkflowStore,
  OctokitGitHubRepositoryClient,
} from "@flowcordia/github-workflows";

const store = new GitHubWorkflowStore({
  clientResolver: {
    async resolve(scope) {
      const octokit = await installationClients.forAuthorizedRepository(scope);
      return new OctokitGitHubRepositoryClient(octokit);
    },
  },
});

const result = await store.save({
  scope,
  workflow,
  expectedBlobSha: previouslyReadBlobSha,
  mutation: {
    actorId: user.id,
    correlationId: request.id,
    reason: "Approved change CR-42",
  },
});
```

Do not turn a conflict or ambiguous write into an automatic retry. Follow the reconciliation procedure in [OPERATIONS.md](./OPERATIONS.md).

## Commands

```sh
pnpm --filter @flowcordia/github-workflows typecheck
pnpm --filter @flowcordia/github-workflows test --run
```
