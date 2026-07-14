# Operations and reconciliation

## Scaling model

GitHub is the durable source of workflow content and reviewed history. The Flowcordia project database will be a derived index populated from installation and repository webhooks. Reads by known workflow ID may go directly to GitHub or a commit-bound cache; searches and lists use the index.

Do not periodically scan every repository. Process webhooks at least once, deduplicate by GitHub delivery ID, bind index records to commit and blob SHAs, and schedule narrow reconciliation only after detected delivery gaps.

## Retry policy

| Operation | Automatic policy | Reason |
| --- | --- | --- |
| Resolve revision | Up to 3 bounded attempts with full jitter | Safe and side-effect free. |
| Read file | Up to 3 bounded attempts against the same commit SHA | Safe, immutable, and repeatable. |
| Create/update/delete | One attempt | GitHub does not provide an idempotency key for Contents API mutations. |
| Long rate limit | Return `rate_limited` with retry timing | Holding request workers causes a retry storm and resource exhaustion. |
| Unknown mutation outcome | Return `ambiguous_write` | A repeated mutation may create a second commit or overwrite newer work. |

## Ambiguous-write reconciliation

1. Stop automatic retries for the correlation ID.
2. Resolve the configured branch head and read the workflow path again.
3. For save, compare the canonical desired content with the current file and inspect the returned commit SHA.
4. For delete, confirm whether the expected blob still exists at the path.
5. If the desired state is present, record the recovered commit/blob receipt in the durable audit outbox.
6. If the previous state is still present, a human or idempotent reconciliation worker may retry with that exact blob SHA.
7. If a different state is present, return a conflict and require the caller to review it.

## Required telemetry

Record operation, tenant/project identifiers, installation ID, repository coordinates, path, result code, GitHub request ID, correlation ID, attempts, duration, retry delay, previous/new blob SHA, and commit SHA. Do not record workflow content, installation tokens, or credential values.

Track at minimum:

- operation latency and success by GitHub installation and endpoint;
- conflict and identity-conflict rate;
- rate-limit responses and remaining/reset headers;
- ambiguous-write count and reconciliation age;
- invalid repository document count;
- webhook delivery lag, duplicate count, and reconciliation gaps;
- installation access revocations and repository transfers.

Alert when ambiguous writes remain unresolved, webhook lag exceeds the product objective, invalid documents block production compilation, or an installation repeatedly reaches its rate limit.

## Rollback

A workflow rollback is a new governed Git commit that restores a previously reviewed definition. Never force-push or rewrite history from the application. Operational rollback of this adapter disables new mutations while leaving commit-bound reads available.
