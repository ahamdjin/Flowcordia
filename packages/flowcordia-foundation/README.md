# `@flowcordia/foundation`

Shared adapters around mature open-source libraries used by Flowcordia-owned packages.

## Responsibilities

- deterministic JSON serialization and safe cloning;
- bounded JSON Pointer conversion, lookup, and assignment;
- directed graph construction, reachability, cycle discovery, and stable topological ordering;
- generic retry-loop and backoff mechanics;
- Ajv JSON Schema 2020-12 and Zod validation entry points.

## Boundary

This package owns generic mechanics only. Flowcordia packages remain responsible for product policy such as exact-revision governance, authorization, retry classification, mutation reconciliation, leases, idempotency, compiler semantics, credential policy, approval fencing, and release evidence.

Adapters must preserve existing public contracts and deterministic behavior. A library default must not silently change hashes, ordering, errors, retry safety, or persisted document formats.
