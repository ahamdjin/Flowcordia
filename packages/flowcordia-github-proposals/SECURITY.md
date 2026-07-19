# Security boundary

## Authorization and credential ownership

Browser input is never a GitHub credential. The API first authorizes the actor against the Flowcordia tenant and project, then an injected resolver authorizes tenant, project, installation, repository, and base branch together before returning an installation-scoped client.

The proposal resolver and workflow-store resolver must make the same authorization decision. Never cache authorization by repository name or owner/name alone. Installation clients may be cached by installation plus credential expiry, but the tenant/project/repository authorization check still runs for every operation.

The GitHub App should receive only the permissions required by this layer:

- repository metadata: read;
- contents: write for proposal branches and merge results;
- pull requests: write for draft creation, ready-for-review, and merge;
- checks: read;
- commit statuses: read.

Administrative bypass, organization administration, secrets, actions write, and user-token scopes are not required. Production branch rules should disallow the app from bypassing review and required-check enforcement.

## Proposal identity is not authentication

The pull-request body contains a versioned marker for discovery and recovery. It is intentionally not a signature and must never be accepted as authorization. The durable Flowcordia proposal record is authoritative and binds tenant, project, installation, repository, proposal ID, workflow ID, base branch/commit, proposal branch, pull-request number, and latest observed head. Reviewer identities use the stable numeric GitHub user ID serialized as a string, never a mutable login.

The service additionally verifies deterministic branch naming, exact marker content, base/head branch mapping, canonical workflow content during resume, pull-request number, and expected head SHA. A mismatch returns `proposal_collision` or `conflict`; it is never silently adopted.

## Review and promotion protection

- Promotion always reads fresh pull-request, review, check-run, and commit-status state from GitHub.
- Eligible approvals are distinct by reviewer and apply to the current head by default.
- The pull-request author and the durable proposal record's creator GitHub identity cannot satisfy approval policy by default. Store an explicit `null` when the creator has no linked GitHub reviewer identity.
- A latest `changes_requested` review blocks promotion until replaced or dismissed.
- Required reviewers can be constrained by an allowlist.
- Required checks are evaluated only for the exact expected head.
- Unknown mergeability fails closed.
- The merge request carries the exact expected head SHA.
- GitHub branch protection and repository rules remain the final authority and may reject a merge even when product policy passes.

Do not add an application-side “admin bypass” to this package. Emergency access must use an explicitly governed GitHub rule with external audit and must still produce a Flowcordia incident record.

Repository-writer configuration is a separate webapp boundary and may only monotonically strengthen a stored governance profile. Any future relaxation path must require distinct privileged authorization and audit; it must not weaken the immutable current-head, self-approval, or changes-requested floor returned by this package.

## Evidence bounds

Proposal lookup and promotion evidence are read page-by-page with fixed upper bounds. Exceeding a
bound is an unavailable policy decision, never permission to submit or merge. Check runs and legacy
commit statuses use separate list endpoints so pagination cannot discard a status context.
Flowcordia does not truncate reviews, checks, statuses, or duplicate proposal matches and then
evaluate the partial result.

## Input and disclosure controls

Proposal IDs, workflow IDs, Git object IDs, repository coordinates, branches, reviewer IDs, check names, actor IDs, correlation IDs, and policy sizes are bounded before interpolation. Generated descriptions escape HTML comment delimiters so workflow text cannot inject a second machine marker.

Public errors contain safe codes, known repository/object identities, GitHub request IDs, retry timing, structured workflow issues, and policy blockers. They never include installation tokens, raw GitHub bodies, raw upstream error messages, workflow payloads, or credential values.

Workflow definitions may contain credential references but never secret values. Reviews, pull-request bodies, commit messages, receipts, traces, and logs must follow the same rule.

## Webhook boundary

Webhook consumers validate GitHub signatures, deduplicate by delivery ID, authorize installation/repository mapping again, and update only a derived proposal projection. A webhook never grants promotion authority and never replaces the fresh GitHub read performed by `promote`.
