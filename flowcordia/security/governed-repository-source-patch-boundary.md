# Governed repository source patch boundary

## Protected assets

- GitHub App installation credentials and repository binding
- tenant, project, actor, and correlation identity
- canonical Flowcordia workflow intent
- generated Trigger.dev task artifacts
- repository source files outside the requested patch set
- pull-request branch and head identity
- provider responses, request metadata, and source content

## Invariants

1. The browser cannot choose tenant, project, installation, repository, base branch, proposal branch, actor, or GitHub credentials.
2. Source patches may target only bounded JavaScript and TypeScript files outside repository-control, GitHub Actions, canonical workflow, and generated artifact paths.
3. Every existing-file write requires the exact expected Git blob SHA. A `null` expected blob means the file must not exist.
4. Existing files must decode as bounded UTF-8 before Flowcordia may replace them.
5. Source is written only through the existing installation-scoped GitHub repository client.
6. Unreviewed source is never imported or executed by the Flowcordia webapp process.
7. A provider timeout or network failure is not treated as failure or success until the repository is reread.
8. Success is returned only after every requested file matches exact target content at the pull request's final immutable head.
9. Error and audit projections exclude source text, credentials, raw provider errors, and installation secrets.

## Threat handling

| Threat | Control |
| --- | --- |
| traversal or repository-control overwrite | strict POSIX path validation and protected path families |
| GitHub Actions modification | `.github/workflows` is always protected |
| canonical/generated artifact bypass | `.flowcordia/workflows` and `trigger/flowcordia` are always protected |
| stale browser edit | exact expected blob identity |
| unexpected file creation | `expectedBlobSha: null` requires absence |
| duplicate or case-colliding writes | case-insensitive path uniqueness |
| oversized payload or memory pressure | file-count, per-file, and aggregate byte limits |
| binary or malformed source | fatal UTF-8 decoding and byte-length verification |
| partial multi-file publication | deterministic order, idempotent rereads, and resumable proposal identity |
| ambiguous provider mutation | exact-content reconciliation |
| concurrent mutation after write | final-head reread of the complete requested patch set |
| pull-request substitution | exact base branch, head branch, state, and proposal identity checks |
| arbitrary server-side execution | storage and publication only; no dynamic import, eval, test runner, or preview execution in webapp |

## Residual risks and review boundary

GitHub reviewers remain responsible for the meaning of valid source changes. This boundary proves identity, scope, content, and publication state; it does not judge business logic or make arbitrary code safe. Preview execution must continue through the existing isolated Trigger.dev deployment boundary and must never be introduced into the webapp process.

Browser editing, durable source buffers, developer test execution, dependency changes, and repository-wide refactors require separate threat models and review boundaries.
