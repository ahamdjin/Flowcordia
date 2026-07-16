# Flowcordia runtime

This package is the first explicit bridge from the canonical Flowcordia workflow model to safe testing and Trigger.dev task code.

It owns:

- compile-time validation for the bounded first-party node set;
- deterministic topological ordering and cycle/unreachable-node rejection;
- a dry-run preview adapter that performs no network calls, code execution, or real waits;
- a live Trigger.dev adapter for HTTP, waits, and statically imported developer-owned code handlers;
- deterministic TypeScript task generation.

It does not deploy generated artifacts, resolve credentials, or accept browser-controlled code. Code nodes compile only from repository-owned `codeReference` values.

Manifest-backed custom functions use the same reviewed `code.task` boundary. Studio copies the function ID, schemas, and local code reference from the exact-commit catalog; the compiler continues to emit only a deterministic static import.

Generated files live under `trigger/flowcordia`, which is inside Trigger.dev's default task discovery root. Repository-relative code paths are emitted as imports from that directory. Export names must be plain JavaScript identifiers; paths must be traversal-free. The proposal boundary additionally rejects code references that name a different repository. Repositories with explicit `dirs` in `trigger.config.ts` must include `trigger/flowcordia` or its parent `trigger` directory.

HTTP credential references bind to deterministic environment names such as `orders-api` → `FLOWCORDIA_CREDENTIAL_ORDERS_API`. Each value is a JSON object shaped like `{ "headers": { "authorization": "Bearer ..." } }`. Values are resolved only by the live adapter, never embedded in generated source or returned by preview traces.
