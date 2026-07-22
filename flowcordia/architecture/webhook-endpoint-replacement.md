# Production webhook endpoint replacement

A revoked production webhook public identity is permanent. Recovery creates a new inactive endpoint generation; it never reopens or mutates the revoked URL.

## Invariants

- Scope is organization, project, production runtime environment, workflow, and webhook node.
- Exactly one endpoint generation per scope may have `supersededAt IS NULL`.
- Generation 1 has no predecessor or replacement actor.
- Every later generation references exactly one predecessor and records the authenticated actor that created it.
- One endpoint may be replaced at most once.
- Replacement is allowed only for the exact current endpoint when it is already revoked and has an immutable active revision.
- The predecessor is marked superseded before the successor is created in the same serializable transaction.
- The successor starts with no active revision. Public ingress therefore returns not found until the existing exact production activation gate binds a revision.
- Lost-response retries return the already-created successor instead of creating another identity.
- Activation never creates a successor implicitly. If historical endpoints exist but no current identity exists, activation fails closed.

## Governed command

Studio posts a bounded strict JSON command containing only workflow ID, node ID, the expected revoked public ID, and the destructive confirmation phrase. The resource route requires project GitHub write access, exact task-trigger permission, Studio access, and a server-authenticated user identity.

The server generates the successor public ID. The browser cannot choose, reuse, or predict it.

## Public routing

The old public ID remains revoked forever. The replacement public ID is initially inactive and therefore unreachable. After the operator rotates credentials if needed and runs the normal exact activation command, public ingress resolves only the successor's active immutable revision.

## Evidence and privacy

Studio may show generation, predecessor public identity, creation timestamp, and current activation state. It does not expose replacement actor IDs, credential metadata, payloads, signatures, raw delivery identities, replay leases, or internal run IDs.
