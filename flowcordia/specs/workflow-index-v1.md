# Workflow index v1 acceptance contract

The slice is accepted only when all of the following are true:

1. An authorized user can synchronize the project repository from Studio without supplying repository coordinates.
2. A verified GitHub push to the tracked production branch schedules the exact pushed commit.
3. Duplicate webhook delivery bytes are idempotent and mismatched replay bytes are rejected.
4. Discovery rejects truncated trees and oversized catalogs.
5. Every discovered workflow is read at the same immutable commit and matched to its discovered blob/path.
6. Invalid canonical documents are visible as invalid and cannot render.
7. Transport or identity failure preserves the previous complete catalog.
8. Completion requires the exact generation and lease token.
9. Studio rereads GitHub and proves the indexed canonical digest before rendering.
10. The browser receives no tenant, installation, repository database, lock, audit, credential-value, raw configuration-value, or provider-error data.
11. The visible canvas contains real canonical nodes and edges from the connected repository.
12. The worker and UI remain feature-gated and isolated from Trigger.dev runtime execution.
13. Focused tests, monorepo typecheck, build, unit shards, and webapp E2E pass on the exact PR head.
14. Architecture, connection ownership, rollout, failure recovery, and rollback are documented.
