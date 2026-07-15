# Security boundary

## Trust order

1. The dashboard route authenticates the session and authorizes `read` or `write` access to the project-scoped GitHub resource.
2. Server code resolves organization, project, connected repository, active installation, GitHub numeric IDs, and production branch. None of those values come from the command body.
3. The GitHub resolver rechecks the same database binding immediately before returning an installation-scoped client.
4. GitHub remains authoritative for branch protection, repository rules, reviews, checks, pull-request state, and merge acceptance.

Never authorize by owner/name, a PR body marker, proposal ID, or webhook payload alone. Repository names are mutable and marker text is discoverable. Durable internal and GitHub numeric identities must agree.

## Browser and identity controls

The browser may supply desired workflow content, a caller-generated proposal ID, expected Git object IDs, and an allowed merge method. Actor ID, correlation fallback, repository scope, installation, base branch, creator GitHub reviewer identity, and promotion policy are resolved by the server. The current API enforces at least one current-head approval, excludes self-approval when the creator has a linked GitHub identity, and blocks outstanding change requests. A future organization policy service may strengthen these defaults but must never accept a weaker per-request override.

Workflow documents may contain secret references, not secret values. Audit, outbox, logs, errors, PR metadata, and webhook normalization must not contain tokens, raw workflow bodies, raw webhook bodies, or upstream exception objects.

## Webhook controls

- Read the raw body once and reject bodies over 1 MiB.
- Verify `x-hub-signature-256` with the configured GitHub App secret before JSON parsing or database access.
- Bind normalized events to installation ID plus GitHub repository ID, then exact pull-request number or head SHA.
- Store only a SHA-256 payload hash and a bounded normalized projection; never store the raw body.
- Treat the same delivery ID with a different payload hash as a replay mismatch.
- Audit branch/base identity mismatches without changing the proposal projection.
- Never promote from webhook state. Promotion always performs a fresh GitHub policy read and expected-head merge.

## Database controls

Immutable identity has a unique `(repositoryId, proposalId)` constraint and binds a SHA-256 of canonical desired workflow content, so a retry cannot substitute different intent. Pull requests are unique inside a repository. Aggregate updates compare `version`; audit/outbox dedupe keys are unique; delivery IDs are primary keys. All command transitions use serializable transactions. Outbox leases are token-guarded so an expired worker cannot acknowledge a new worker's claim.
