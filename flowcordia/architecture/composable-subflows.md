# Composable subflows and bounded fan-out

## Purpose

Flowcordia workflows can invoke another generated Flowcordia task without copying the child workflow into the parent. The parent owns only the child workflow ID, invocation mode, bounded batch selection, and JSON Schema input/output boundary.

## Durable contract

`subflow.invoke` is a first-class `subflow` node with two modes:

- `single` passes the node input to one child run and returns one child output;
- `batch` resolves one reviewed JSON path to an array, rejects more than `maxItems` entries, invokes the child once per item through one native batch operation, and returns outputs in input order.

The first visual slice allows at most 100 items. Batch paths use the same bounded safe-segment grammar as deterministic mapping: at most 16 dot-separated object or array-index segments, with prototype-related segments rejected. Empty arrays return an empty array without issuing a runtime request. Direct self-invocation is rejected before compilation. Cycles across different workflows remain an operator/repository review concern until a repository-wide workflow call graph is introduced.

## Runtime boundary

The portable runtime validates every child payload against the node input schema and every child result against the output schema. Preview uses deterministic mocks or bounded simulated object outputs. Live execution receives exactly one adapter call containing the deterministic child task ID and ordered payload array.

Generated Trigger.dev source implements that adapter with `batch.triggerAndWait`. This provides one checkpoint-aware wait, native parent-child correlation, and deployment-version locking for child runs. The generated source never wraps wait primitives in `Promise.all`, never records child error objects, and fails the parent with a fixed message when any child run fails.

## Studio ownership

Studio exposes only:

- child workflow ID;
- single or batch mode;
- batch items path;
- maximum item count.

New visual nodes receive object input/output schemas. Stricter schemas remain repository-reviewable until a dedicated schema editor is delivered. Unknown configuration fields block visual rewriting rather than falling back to raw JSON.

## Explicit exclusions

This slice does not add fire-and-forget children, dynamic task IDs from payloads, recursive workflow graphs, streaming batches, per-item retry policy, mixed-child batches, approval nodes, or arbitrary invocation concurrency keys.
