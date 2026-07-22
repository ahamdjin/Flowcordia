# Webhook operations

## Purpose

A production webhook needs an operator-controlled emergency stop and enough recent evidence to understand whether signed deliveries are processing, succeeding, or failing. These operations must not weaken the immutable activation boundary or expose payloads, signatures, secrets, delivery identifiers, leases, or run identities.

## Permanent revocation

Revocation is a permanent kill switch for one exact production environment, workflow, trigger node, and stable public endpoint identity. It records:

- the authenticated user ID supplied by the server session;
- one fixed reason code;
- the revocation timestamp.

The last active immutable revision pointer is preserved for forensic history. The public ingress resolver already excludes revoked endpoints, and future activation attempts fail closed. Restoring a retired public identity is deliberately unsupported; an operator must create a new governed endpoint identity through a future replacement workflow rather than silently reusing a compromised URL.

Revocation does not depend on GitHub, proposal state, deployment discovery, worker availability, or credential access. The emergency stop therefore remains available when adjacent control-plane systems are degraded.

## Authorization

The command uses the existing authenticated Studio resource boundary. It requires:

- GitHub write permission for the project;
- exact trigger permission for `flowcordia-<workflowId>`;
- current Studio access;
- an explicit destructive confirmation string;
- one fixed revocation reason.

The browser may submit only workflow ID, node ID, stable public ID, reason, and confirmation. Actor identity is always supplied by the authenticated server session.

## Recent delivery visibility

Studio projects at most five recent replay-ledger records per endpoint. Each item contains only:

- a short SHA-256-derived reference computed from the internal endpoint identity and raw delivery ID;
- `PROCESSING`, `DELIVERED`, or `FAILED` state;
- attempt count;
- received and completion timestamps;
- a fixed failure code when present.

The query does not select or project the raw delivery ID, payload digest, run ID, lease token, request body, headers, signature, or credential metadata. Hashing happens server-side and the internal endpoint ID is never returned.

## Audit invariant

Database constraints require `revokedAt`, `revokedByUserId`, and a valid fixed reason to be either all absent or all present. Legacy revoked rows are backfilled with a bounded system actor and emergency-stop reason before the constraint is enabled.
