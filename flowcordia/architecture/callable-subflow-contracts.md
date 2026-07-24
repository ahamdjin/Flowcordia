# Callable subflow contracts

## Decision

A subflow target is callable only when its exact repository revision exposes one explicit object-root input schema on its single trigger and one explicit object-root return schema on its single output node. Flowcordia reuses the existing bounded function JSON Schema subset; it does not infer contracts from samples or introduce another type language.

## Durable index

Repository synchronization derives callable contracts for every valid workflow, recursively validates each stored subflow binding, and writes versioned `READY` or `BLOCKED` metadata beside the exact source commit. Invalid or uncallable workflows remain visible as top-level repository workflows; only child selection is blocked. Existing rows begin at metadata version `0` and require synchronization before they can authorize child invocation.

## Studio and server ownership

Studio receives only bounded eligibility and failure messages. When a visual subflow target changes, the browser submits the invocation configuration only. The server resolves the exact indexed target, requires a ready contract, and replaces the parent node input/output schemas from durable metadata. Browser-supplied schemas are never trusted.

Before preview or proposal publication, the server rechecks repository dependency safety and every direct parent-to-child schema binding. A ready child contract already proves its downstream callable closure at the same commit.

## Runtime boundary

The portable runtime validates the incoming task payload against the trigger contract and validates the returned value at the output node. Subflow nodes continue to validate each child payload and result. Static review and live execution therefore enforce the same schema grammar.

## Exclusions

This boundary does not atomically publish child artifacts, install missing child tasks, infer contracts, support recursive workflows, or add JSON Schema unions/references. Multi-workflow proposal and deployment closure follows after exact callable contracts are established.
