# Deterministic data mapping

## Purpose

Flowcordia data mapping reshapes reviewed JSON between nodes without evaluating JavaScript, templates, expressions, or browser-authored code. The portable contract is shared by Studio, the durable workflow editor, compiler analysis, structural preview, and live Trigger.dev execution.

## Contract

A `data.map` node selects `replace` or `merge` mode and contains 1–64 ordered entries. Every entry writes one safe target path from exactly one source:

- a dot-separated input path, optionally marked required; or
- a reviewed JSON literal.

An empty source path selects the complete input. Source paths may traverse arrays through bounded numeric segments. Visual literal editing is intentionally limited to strings, finite numbers, booleans, and null; repository-authored object or array literals remain code-owned so Studio cannot rewrite them lossily.

Target paths create nested objects only. Duplicate targets and ancestor/descendant conflicts fail closed. `__proto__`, `prototype`, and `constructor` are forbidden in source and target paths. Paths and entry counts are bounded before compilation or execution.

## Runtime behavior

`replace` starts from an empty object. `merge` deep-clones an object input and fails for primitive or array input. Missing optional sources are omitted. Missing required sources fail the node with one bounded message. Null is a present value. Every mapped value and literal is deep-cloned before insertion.

The same pure mapper executes in structural preview and live runtime. Generated code serializes only the reviewed mapping contract. No `eval`, `Function`, dynamic import, environment lookup, credential resolution, or network access belongs to the mapping node.

## Verification boundary

The release boundary requires the complete workflow package suite, deterministic mapper unit tests, generated-artifact and runtime tests, workflow and runtime typechecks, focused Studio ownership tests, Prisma-prepared monorepo typecheck, formatting, lint, package shards, webapp shards, build, and browser E2E on the same exact pull-request head. Temporary integration tooling and diagnostic captures must not remain in the review diff.

Connected release acceptance must execute a reviewed workflow containing `data.map` against the reference repository and preserve bounded evidence correlating workflow version, proposal head, deployment version, run, and node output. The evidence may include mapped field names and non-sensitive values, but never credentials or environment values.

## Deliberate boundary

This first approved mapper does not provide formulas, date manipulation, arbitrary coercion, loops, joins, aggregation, JSONata, JavaScript, or secret interpolation. Those capabilities require separately versioned nodes or repository functions with explicit contracts and tests.
