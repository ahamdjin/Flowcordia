# Signed webhook ingress

Flowcordia public webhook ingress is split into portable configuration, cryptographic verification, durable replay ownership, and the host route. This boundary delivers the first two pieces without claiming that a public endpoint is deployed.

## Portable workflow contract

A `trigger.webhook` node keeps its reviewed method and path and gains explicit deterministic defaults:

- body limit: 1 MiB by default, bounded to 5 MiB;
- timestamp tolerance: 300 seconds by default, bounded to 30–900 seconds;
- exactly one names-only credential reference;
- HMAC-SHA256;
- fixed `x-flowcordia-signature`, `x-flowcordia-timestamp`, and `x-flowcordia-delivery` headers.

Legacy `{ method, path }` workflows remain readable through the secure defaults. Unknown configuration keys, unsafe paths, inline secret fields, unbounded limits, and zero/multiple/invalid credential references fail closed.

The credential reference resolves through the existing project-environment ownership contract. Workflow JSON, generated source, Studio, audit events, and evidence never contain the signing secret.

## Signature protocol

The sender signs the exact byte sequence:

```text
<unix timestamp seconds>.<delivery id>.<raw request body bytes>
```

The signature header is `v1=<lowercase SHA-256 hex HMAC>`.

Verification binds all of the following:

- the exact raw body bytes before JSON parsing or text normalization;
- the exact timestamp string;
- the exact delivery ID;
- a 32–4096-byte secret;
- an operator-selected clock and the reviewed tolerance.

Remote header failures return bounded reason codes. Signature comparison uses `timingSafeEqual`. A successful result exposes the public delivery ID, timestamp, and plain SHA-256 body digest; it never returns the secret, expected signature, or signed bytes.

## Remaining host boundary

A production route must still:

1. resolve organization, project, environment, workflow, exact deployed version, and webhook node from server-owned route identity;
2. reject the wrong HTTP method before reading the body;
3. enforce declared content length and streamed body size before allocation grows past the reviewed limit;
4. resolve exactly one secret from the inherited encrypted project-environment store;
5. verify signature before parsing JSON or triggering a task;
6. reserve `delivery ID + body digest` durably before execution;
7. return the original accepted result for an identical replay and reject a reused delivery ID with different bytes;
8. trigger only the exact deployed workflow task and preserve task RBAC, idempotency, queue, retry, and worker-version ownership;
9. emit bounded responses without payloads, credentials, internal IDs, stack traces, or provider errors;
10. include rate limiting, abuse limits, telemetry, recovery, and connected acceptance.

Until that route and replay store are delivered and exercised, Studio must continue to label public webhook production binding as unavailable.
