# Governed repository source patches

## Purpose

This Phase 2 primitive lets one Flowcordia proposal carry reviewed JavaScript or TypeScript source changes beside the canonical workflow document and deterministic Trigger.dev artifact. It does not add a browser editor or execute unreviewed repository code in the Flowcordia web process.

```text
validated source patch set
  -> canonical workflow proposal at an exact base commit
  -> deterministic proposal branch and draft pull request
  -> exact proposal-branch source reads
  -> optimistic blob-identified source writes
  -> ambiguous-write reconciliation by exact content
  -> final pull-request head resolution
  -> every requested source file reread at that immutable head
  -> pull-request head stability recheck
  -> final proposal receipt bound to the proven head
```

## Contract

A source patch contains exactly:

- a repository-relative JavaScript or TypeScript path;
- the complete bounded UTF-8 replacement source;
- the expected Git blob SHA, or `null` when the file must not exist.

The contract is limited to 32 files, 256 KiB per file, and 1 MiB in total. Patches are sorted by path before publication. Unknown properties, duplicate or case-colliding paths, invalid object IDs, unsupported extensions, traversal, repository-control paths, GitHub workflow files, canonical Flowcordia workflow paths, and generated Flowcordia task paths are rejected before proposal creation.

## Publication algorithm

1. Validate the complete patch set before mutating GitHub.
2. Create or resume the canonical workflow proposal through `GitHubProposalService`.
3. Resolve the deterministic proposal branch through the installation-scoped repository client.
4. For each sorted patch, reread the branch file. Exact target content is idempotently accepted only when the canonical proposal is being resumed.
5. Otherwise require the current blob to match `expectedBlobSha` before writing. A new-file patch therefore still fails when an unexpected file already exists, even when its content happens to match.
6. When a write outcome is ambiguous, reread the file and continue only if exact target content is visible.
7. Resolve the pull request again and prove base branch, head branch, open state, and non-merged state.
8. Reread every requested source file at the pull request's immutable final head SHA and require exact content equality.
9. Resolve the pull request once more and require the same identity and head SHA after verification.
10. Return the proposal and audit receipt with that stable final head.

A partial attempt can therefore be retried using the same proposal identity. Completed files are recognized by exact content, missing files continue from their expected base identity, and mismatched files fail closed.

## Ownership and connections

- `@flowcordia/github-workflows` owns source path validation, bounded UTF-8 decoding, exact-commit reads, optimistic writes, and provider-error normalization.
- `@flowcordia/github-proposals` owns composition with the existing branch, pull-request, workflow, generated-artifact, and proposal-identity lifecycle.
- The webapp gateway reuses the current project-to-GitHub-App binding and never accepts installation credentials, tenant coordinates, repository coordinates, or branches from the browser.
- The canonical workflow and generated task remain owned by the established proposal service. Source patches cannot target either path family.
- The Trigger.dev deployment and runtime remain unchanged. This primitive only prepares reviewed repository state.

## Failure behavior

- Invalid patch sets fail before a branch or pull request is created.
- A stale or unexpectedly existing blob returns a non-retryable conflict.
- Non-UTF-8 or oversized existing source fails as an invalid document and is not overwritten.
- Provider permission failures, rate limits, and unavailable reads are normalized without raw provider content.
- An ambiguous write is accepted only after exact-content reconciliation.
- A changed pull-request identity is a proposal collision.
- A missing or changed source file at final-head verification fails the proposal instead of returning a misleading success receipt.
- A branch update during final verification returns a retryable conflict and no success receipt.

## Deliberate limits

This slice supplies the governed multi-file publication primitive only. It does not add durable browser source buffers, a source editor, arbitrary repository browsing, package or lockfile editing, executable developer tests, live execution of unreviewed code, merge automation, or a second deployment system. Those product surfaces must build on this boundary rather than bypass it.
