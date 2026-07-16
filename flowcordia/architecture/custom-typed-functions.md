# Custom typed function bridge

## Purpose

The first Phase 2 slice lets developers publish repository-owned TypeScript functions as visual Studio nodes without transferring source-code ownership to the browser.

```text
.flowcordia/functions.json at workflow commit
  -> strict portable catalog validation
  -> exact-commit GitHub read
  -> browser-safe Studio catalog
  -> browser submits function ID only
  -> server rereads definition at draft base commit
  -> developer-owned code.task node with input/output schemas
  -> deterministic compiler contract and static import
  -> governed workflow and generated-task pull request
  -> runtime input/output validation
```

## Catalog contract

The repository may define `.flowcordia/functions.json` using schema version `0.1`. Each function declares:

- a stable function ID, display name, and optional description;
- a traversal-free repository source path outside generated Flowcordia directories and a JavaScript export name;
- object-rooted schemas using Flowcordia's bounded executable schema subset.

The catalog is limited to 500 functions and 256 KiB. Unknown manifest or schema properties, duplicate IDs, cross-repository references, commit overrides, path traversal, generated-directory references, executable export-name injection, non-JSON values, unsupported source extensions, and invalid schema structures are rejected.

## Ownership and trust boundary

- The connected GitHub App reads the catalog at the selected workflow's exact commit SHA.
- Studio receives only function identity, description, code location, and input/output field names. It never receives executable source or schema values.
- A draft mutation contains only `functionId`, position, and an optional display name. Repository coordinates, schemas, and code references remain server owned.
- Before changing the durable draft, the server rereads the catalog at the draft base commit and resolves the ID there.
- The resulting node keeps operation `code.task`, carries copied input/output schemas, records `configuration.functionId`, and owns a static code reference.
- Studio cannot alter repository-owned implementation or configuration. It may move, rename, connect, or remove the workflow reference, and those changes still pass through the governed proposal lifecycle.
- The compiler emits the reviewed export as a static import, asserts the one-argument object-to-object TypeScript contract, and wraps it in the generic runtime handler boundary.
- Runtime input is validated before repository code executes, and returned output is validated before downstream nodes receive it.
- Structural preview does not execute customer code; it validates the input contract and produces a schema-shaped output for downstream graph testing.

## Reference proof

A committed reference repository fixture contains a real manifest, canonical workflow, typed TypeScript function, and generated Trigger.dev task. Its test proves catalog resolution, draft insertion and wiring, structural preview, deterministic generated artifact equality, live adapter execution, output validation, and reviewed workflow-reference removal.

## Failure behavior

- A missing catalog leaves built-in Studio nodes available and explains how to add the manifest.
- An invalid catalog exposes one bounded contract diagnostic but no raw GitHub response or manifest content.
- A transient GitHub failure makes custom functions unavailable without blocking workflow inspection.
- A missing function at the draft base revision rejects the edit without modifying the draft.
- A catalog/workflow commit mismatch is treated as stale source and requires a refreshed draft.
- Invalid function input prevents repository code from running.
- Invalid function output stops the workflow before downstream nodes receive it.

## Deliberate limits

This slice discovers, adds, removes, compiles, and enforces typed repository functions. Repository code editing, developer-provided tests and fixtures, catalog reconciliation after developer changes, mock bindings, and richer schema-driven forms remain later focused Phase 2 slices.
