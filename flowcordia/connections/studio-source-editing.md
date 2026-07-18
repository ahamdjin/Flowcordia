# Studio source-editing connections

| Connection | Owner | Purpose | Failure behavior |
| --- | --- | --- | --- |
| Source route -> Studio query | webapp | Load workflow, draft, diff, and browser-safe source-buffer summaries | Show configuration, stale-source, or integrity failure; never fall back to arbitrary repository content |
| Source-open command -> workflow draft | webapp draft service | Resolve the selected node inside one active exact-base draft | Reject missing, stale, discarded, or mismatched drafts |
| Source-open command -> function catalog | `@flowcordia/github-workflows` | Prove function ID, path, and export at the draft base commit | Reject catalog absence, invalidity, or identity drift |
| Source-open command -> repository source reader | GitHub App installation client | Read one bounded source file at the exact commit | Reject missing, malformed, binary, oversized, or unproven source |
| Source service -> source-buffer tables | webapp / PostgreSQL | Persist exact base evidence and optimistic replacement text | Hash corruption and version conflicts fail closed |
| Source mutations -> source audit table | webapp / PostgreSQL | Record actor, correlation, identity, versions, and hashes | Source text is never written to audit payloads |
| Source publish -> deterministic compiler | `@flowcordia/runtime` | Preserve the workflow artifact and runtime contract even for source-only changes | Compilation failure blocks publication |
| Source publish -> source-patch identity | webapp | Sort patches and bind full content plus expected blobs to one digest | Supplied digest mismatch blocks durable intent |
| Source-aware command -> control plane | `@flowcordia/control-plane` | Persist proposal intent, state, audit, outbox, and reconciliation identity | Persistence or concurrency failures do not become blind GitHub retries |
| Source-aware command -> GitHub proposal gateway | `@flowcordia/github-proposals` | Write workflow, generated artifact, and source changes to one governed branch and PR | Stale, ambiguous, partial, or unstable writes fail closed or reconcile |
| GitHub PR -> preview integration | existing Trigger.dev GitHub integration | Build and deploy the exact combined proposal head | Studio Live Preview stays unavailable until the exact deployment is ready |
| Live Preview -> Trigger.dev runtime | existing version-locked run path | Execute only reviewed, built source from the exact proposal deployment | No webapp evaluation or fallback to durable source buffers |

## Isolation rule

No source-editing module imports Trigger.dev queue, supervisor, worker, or deployment-table internals. Publication and execution reuse the existing governed GitHub and Trigger.dev integration boundaries.
