# ADR 0002: Git is the governed change history

## Status

Accepted.

## Context

Enterprise workflows require review, ownership, auditability, environment promotion, and rollback. A database-only canvas history does not provide the same developer and governance workflow as GitHub.

## Decision

Workflow definitions and reviewable code live in Git. Flowcordia may keep drafts, collaboration state, indexes, and runtime records in databases, but a production release must resolve to a reviewed commit SHA.

## Consequences

- Normal users can remain unaware of Git mechanics while benefiting from governed change.
- Pull requests can combine visual, code, test, and policy review.
- Secrets must remain references, never committed values.
- Concurrent draft editing needs a reconciliation layer before commit.

## Reversal condition

None for production history. Alternative Git providers may be added behind the same contract.

