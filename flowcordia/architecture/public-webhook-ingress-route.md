# Public webhook ingress route

## Purpose

The public ingress route turns one active immutable production webhook binding into a callable HTTPS boundary without consulting GitHub, selecting a latest deployment, or accepting a browser credential. Every request resolves one stable endpoint ID and its exact active revision.

## Route identity

The public URL is:

`/api/v1/flowcordia/webhooks/<publicId><configuredPath>`

`publicId` is the random stable endpoint identity created during governed activation. The request method and raw path suffix must exactly match the active revision. Queries, fragments, percent-encoded paths, duplicate separators, and transparent content encodings are rejected.

## Request sequence

The route is intentionally ordered:

1. Resolve the active, non-revoked endpoint and immutable revision from PostgreSQL.
2. Require the exact configured method and canonical path.
3. Apply a distributed endpoint rate limit and fail closed if the limiter is unavailable.
4. Stream the raw request body with the revision's exact byte ceiling.
5. Require `application/json` for every non-empty payload.
6. Confirm that the current production credential metadata still matches the activated credential version.
7. Read only the exact derived HMAC key, then recheck the credential version and strictly parse the typed stored envelope.
8. Verify HMAC-SHA256 over the exact raw bytes, timestamp, and delivery ID.
9. Parse fatal UTF-8 JSON only after authentication. An empty body becomes JSON `null`.
10. Apply a signed-delivery replay rate limit.
11. Reserve endpoint-scoped durable replay ownership.
12. Recover an already-created task run by the deterministic endpoint/delivery idempotency key before triggering.
13. Trigger the exact stored task identifier with `lockToVersion` set to the immutable worker version.
14. Complete or fail the replay lease without exposing the internal run ID.

## Replay and idempotency

Replay identity is production environment, workflow, stable webhook endpoint, and delivery ID. Adding the endpoint identity prevents sibling webhook trigger nodes in one workflow from colliding when different senders reuse the same delivery identifier.

The replay ledger permanently binds a delivery to the SHA-256 digest of the authenticated raw payload. The Trigger.dev idempotency key is a SHA-256 digest of the internal endpoint ID and signed delivery ID. Before calling `TriggerTaskService`, the route queries PostgreSQL for any run with the exact environment, task identifier, and idempotency key. This closes the failure window where a run was created but the replay-completion write was lost, including failed runs that Trigger.dev's normal retry path may otherwise clear.

## Secret boundary

The route never loads all environment variables. It requests only the activated HMAC environment key. Activation stores the credential version. Request-time resolution checks that version before the exact secret read and checks it again afterward, so an unactivated rotation fails closed. The request body, signature, timestamp header, and secret value are never logged or persisted by the ingress layer. Operational errors record only bounded event names, exception classes, and fixed failure codes.

## Responses

Responses are bounded and cache-disabled. They may report accepted, not found, unauthorized, invalid request, unsupported media type, request too large, delivery conflict, rate limited, or temporarily unavailable. No response contains an internal endpoint ID, revision ID, delivery ID, secret metadata, or run ID.

## Operational boundary

The route is production-only and uses the existing shared Redis rate-limit service. Redis clients are initialized lazily on the first request. A Redis outage fails closed with `503`. A replay lease is shorter than five minutes. Triggering is version-locked to the activated worker and does not fall forward to another deployment.
