# GitHub workflow-store connections

| Source | Target | Contract | Why | Failure owner |
| --- | --- | --- | --- | --- |
| Flowcordia API action | Installation client resolver | Tenant, project, installation, repository, branch, actor authorization | Prevent cross-tenant/repository credential confusion. | API authorization layer rejects before resolving credentials. |
| Installation client resolver | Existing Octokit factory | Installation ID and authorized repository | Reuse the inherited GitHub App credential lifecycle. | Resolver returns a sanitized access/unavailable error. |
| `GitHubWorkflowStore` | `@flowcordia/workflow` | Validation, migration, identity, and canonical serialization | Keep Git content identical to the product/compiler contract. | Store blocks the operation with structured issues. |
| `GitHubWorkflowStore` | Octokit adapter | Exact revision reads and expected-SHA mutations | Bind reads to immutable commits and prevent lost updates. | Adapter normalizes GitHub status, rate-limit, and request metadata. |
| `GitHubWorkflowStore` | Generated task artifacts | Bounded UTF-8 source under `.flowcordia/generated/` | Keep compiler output on the same governed branch without weakening workflow identity rules. | Store validates path, size, encoding, and expected-blob mutation behavior. |
| Octokit adapter | GitHub Contents/Commit APIs | Installation-scoped repository requests | Persist human-reviewable workflow files and immutable history. | GitHub rules remain authoritative; store never bypasses them. |
| Mutation receipt | Durable audit outbox | Actor, correlation, installation, repository, path, blob, and commit IDs | Make successful Git writes traceable outside request memory. | API service persists/retries the outbox record. |
| GitHub webhooks | Project workflow index | Delivery ID, repository, path, commit, blob, deletion state | Support enterprise search/list without repository scans. | Webhook/index adapter deduplicates and reconciles gaps. |
| Project workflow index | Studio | Searchable summaries and exact source identifiers | Give non-technical users a fast catalog while Git remains authoritative. | Studio falls back to a commit-bound read or reports index lag. |

The store does not compile, deploy, execute, list repositories, receive webhooks, or create pull requests. It persists compiler output supplied by the proposal service but does not generate or trust browser-provided source.
