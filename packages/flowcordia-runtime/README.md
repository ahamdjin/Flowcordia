# Flowcordia runtime

This package is the explicit bridge from the canonical Flowcordia workflow model to structural testing and Trigger.dev task code.

It owns:

- compile-time validation for the bounded first-party node set;
- deterministic topological ordering and cycle/unreachable-node rejection;
- a structural preview adapter that performs no network calls, customer code execution, or real waits;
- a live Trigger.dev adapter for HTTP, waits, and statically imported developer-owned code handlers;
- bounded repository-function input/output validation;
- deterministic TypeScript task generation and typed export assertions.

It does not deploy generated artifacts, resolve credentials, or accept browser-controlled code. Code nodes compile only from repository-owned `codeReference` values.

Manifest-backed custom functions use the same reviewed `code.task` boundary. Studio copies the function ID, schemas, and local code reference from the exact-commit catalog. The compiler emits a deterministic static import, verifies that the export is a one-object-input to one-object-output function, and wraps it in the generic runtime handler boundary. The runtime validates input before calling repository code and validates output before any downstream node receives it.

Structural preview validates the same input schema but never imports customer code. It creates a deterministic schema-shaped output so downstream graph structure can be tested honestly; the Studio labels this result as a structural preview whenever developer-owned nodes are present.

The committed reference repository under `test/fixtures/reference-repository` is formatted as normal repository code and included in the runtime test TypeScript project. Its tests prove catalog parsing, draft wiring, generated contract markers, structural preview, live adapter execution, output enforcement, and workflow-reference removal.

Generated files live under `trigger/flowcordia`, which is inside Trigger.dev's default task discovery root. Repository function paths must use supported source extensions, remain traversal-free, and stay outside the generated directory. The proposal boundary additionally rejects code references that name a different repository. Repositories with explicit `dirs` in `trigger.config.ts` must include `trigger/flowcordia` or its parent `trigger` directory.

Schedule workflows compile to Trigger.dev `schedules.task` declarations with the reviewed cron and
IANA timezone. The binding is explicitly limited to `PRODUCTION`, so proposal preview deployments
can prove task discovery without firing scheduled side effects. Trigger.dev synchronizes the
declarative schedule when the promoted artifact is deployed; invalid cron or timezone values fail
compiler validation before publication.

API-triggered workflows use the generated task's inherited authenticated endpoint:
`POST /api/v1/tasks/flowcordia-<workflow-id>/trigger`. The compilation artifact exposes the method,
path, and project-access-token requirement as structured `triggerBinding` metadata. Authentication,
task RBAC, payload bounds, and idempotency remain owned by the platform trigger route; no access
token is stored in the workflow or generated source. Public webhook ingress remains a separate,
explicitly unbound capability until signed request verification has a server-owned credential model.

HTTP credential references bind to deterministic environment names such as `orders-api` → `FLOWCORDIA_CREDENTIAL_ORDERS_API`. Each value is a JSON object shaped like `{ "headers": { "authorization": "Bearer ..." } }`. Values are resolved only by the live adapter, never embedded in generated source or returned by preview traces.
