# Workflow model and round-trip contract

## Canonical contract

The Flowcordia workflow document is a portable, deterministic description of nodes, edges, schemas, runtime policy intent, and code references. The first machine-readable version is `../specs/workflow.schema.json`.

## What can round-trip

- Workflows created through the Flowcordia model.
- Typed Flowcordia SDK constructs with stable identifiers.
- Custom functions that declare input/output schemas and an exported entry point.
- Runtime settings represented in the workflow schema.

## What cannot be promised

Unrestricted TypeScript may use dynamic imports, runtime-generated control flow, reflection, arbitrary loops, or external state that has no stable graph representation. Flowcordia must preserve such logic as a code-task node rather than pretending to convert it losslessly.

## Identity rules

- Workflow, node, edge, and port identifiers remain stable across edits.
- Renaming a display label never changes identity.
- Generated code contains stable markers that map back to model identifiers.
- Git commit SHA identifies the reviewed source version.
- Runtime deployment version identifies the executable snapshot.

## Determinism rules

- The same normalized model and compiler version produce the same generated artifact.
- Object keys and node ordering are normalized before hashing.
- Secrets are represented only by references.
- Generated files are never the only copy of user-authored code.
- Compiler diagnostics are stored separately from the workflow definition.

