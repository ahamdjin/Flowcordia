# Public webhook replay and trigger ownership

## Purpose

Signed public ingress must not trigger the same workflow twice merely because a caller retries, a proxy repeats a request, or one application replica loses its response. This boundary reserves durable execution ownership before the host route calls Trigger.dev.

## Identity

One delivery is identified by the server-resolved tuple:

```text
organization + project + production environment + workflow + delivery ID
```

The public request never supplies internal organization, project, or environment database IDs. The host route resolves those values from its bounded endpoint identity and active immutable production binding before reservation.

Each identity is permanently bound to one lowercase SHA-256 payload digest. Reusing the identity with another digest is a replay mismatch and must return a conflict without triggering anything.

## State and leases

The ledger stores only metadata:

- workflow and delivery identity;
- SHA-256 payload digest;
- `RECEIVED`, `TRIGGERED`, or `FAILED` state;
- attempt count;
- short-lived mutation lease;
- bounded run-friendly ID or failure code;
- received and completed timestamps.

Raw request bytes, parsed payloads, signatures, secrets, headers, and credential values are never retained.

A new delivery receives one lease. A same-digest retry observes one of three outcomes:

1. `in_progress` while another unexpired lease owns the trigger;
2. `completed` with immutable run evidence after successful triggering;
3. `acquired` with an incremented attempt after an expired lease or failed trigger.

The maximum lease is five minutes. Completion and failure require both the exact active lease token and a lease that remains unexpired at the completion timestamp. A stale or expired owner cannot overwrite a newer attempt or publish run evidence after losing ownership.

## Persistence boundary

The Prisma adapter uses a serializable transaction and validates that the internal environment belongs to the resolved organization and project, is production, is not archived, and belongs to a non-deleted project and organization.

The database enforces one row per environment/workflow/delivery identity. Reacquisition is a compare-and-update operation over the same payload digest and expired or failed ownership.

## Deliberate exclusions

This slice does not expose a public route, verify HMAC signatures, resolve credentials, parse payload JSON, apply rate limits, resolve the deployed task, call Trigger.dev, or publish a webhook URL in Studio. Those host responsibilities must compose this ledger with the signed-ingress contract, an immutable production binding, and the existing task-trigger service.

## Endpoint-scoped identity

The public ingress route extends replay identity with the stable internal webhook endpoint ID. This prevents sibling webhook trigger nodes in the same production workflow from colliding when independent senders reuse a delivery identifier. Legacy rows created before the route carry an empty endpoint marker and are not addressable by the new request path.
