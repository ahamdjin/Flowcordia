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
  -> existing deterministic compiler and static import
  -> governed workflow and generated-task pull request
```

## Catalog contract

The repository may define `.flowcordia/functions.json` using schema version `0.1`. Each function declares:

- a stable function ID, display name, and optional description;
- a traversal-free repository path and JavaScript export name;
- object-rooted JSON Schemas for its input and output.

The catalog is limited to 500 functions and 256 KiB. Unknown manifest properties, duplicate IDs, cross-repository references, commit overrides, path traversal, executable export-name injection, non-JSON values, and non-object schema roots are rejected.

## Ownership and trust boundary

- The connected GitHub App reads the catalog at the selected workflow's exact commit SHA.
- Studio receives only function identity, description, code location, and input/output field names. It never receives executable source or schema values.
- A draft mutation contains only `functionId`, position, and an optional display name. Repository coordinates, schemas, and code references remain server owned.
- Before changing the durable draft, the server rereads the catalog at the draft base commit and resolves the ID there.
- The resulting node keeps operation `code.task`, carries copied input/output schemas, records `configuration.functionId`, and owns a static code reference. Existing ownership rules prevent Studio from editing its configuration or deleting it.
- The existing compiler emits the reviewed export as a static import. No browser-provided source reaches the generated task.

## Failure behavior

- A missing catalog leaves built-in Studio nodes available and explains how to add the manifest.
- An invalid catalog exposes one bounded contract diagnostic but no raw GitHub response or manifest content.
- A transient GitHub failure makes custom functions unavailable without blocking workflow inspection.
- A missing function at the draft base revision rejects the edit without modifying the draft.
- A catalog/workflow commit mismatch is treated as stale source and requires a refreshed draft.

## Deliberate limits

This slice discovers and adds typed functions. Repository code editing, function-specific tests and fixtures, catalog reconciliation after developer changes, mock bindings, and richer schema-driven forms remain later Phase 2 slices.
