# HTTP/API node test matrix

## Portable contract

- Catalog IDs and versions are unique and the Studio template list is exact.
- HTTP is approved for structural preview, live execution, credential references, and governed code generation.
- Legacy method/URL configuration receives deterministic defaults.
- Unknown fields, unsafe URLs, unsupported methods or modes, GET/HEAD bodies, and out-of-range limits fail closed.
- Generic code tasks cannot be submitted through the visual-template command.

## Compiler and runtime

- Analyzer and durable editor consume the shared configuration parser.
- Generated repository code contains the normalized HTTP contract and no secret value.
- The exact origin is authorized; legacy host entries apply only to standard HTTPS, and redirects use manual handling.
- A non-standard HTTPS port fails under a legacy hostname entry and succeeds only when that exact origin is approved.
- Workflow cancellation reaches the active fetch and timeout aborts the request.
- Redirect, non-success, ignored, and declared-oversize bodies are cancelled before the worker continues.
- Response streaming stops above the configured byte limit.
- Legacy JSON-first auto behavior, strict JSON, text, and no-body response semantics are deterministic.
- Credential values resolve only at runtime; malformed, duplicate, framing, and hop-by-hop headers fail before fetch.

## Studio

- Catalog choices are grouped by category and show release stage, version, description, and capabilities.
- The HTTP inspector round-trips every portable field and keeps a new empty node editable.
- GET and HEAD select no-body semantics.
- Unknown or unsafe repository configuration blocks the form instead of losing data.
- Projection exposes only approved configuration fields and names-only credential references.
- Raw JSON, secret values, environment values, and redirect controls are absent.

## Release evidence

Required pull-request evidence is the workflow and runtime package suites, focused webapp Studio tests, dependency-aware webapp typecheck, production webapp build, and the repository's exact-head CI matrix. Connected acceptance additionally requires an allowlisted test API that can return JSON, text, an oversized streaming body, a delayed response, a redirect to a non-allowlisted host, and an alternate HTTPS port that is rejected until its exact origin is approved. The evidence must show the generated proposal diff, exact deployed head, execution trace, and bounded output without storing credential values.
