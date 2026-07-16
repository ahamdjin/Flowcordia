# Workflow model and round-trip contract

## Canonical contract

The Flowcordia workflow document is a portable, deterministic description of nodes, edges, schemas, runtime policy intent, and code references. `packages/flowcordia-workflow` owns the TypeScript model, strict validator, serializer, identity rules, migrations, examples, and canonical versioned schema. The repository-level `../specs/workflow.schema.json` remains a compatibility copy for architectural discovery.

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
- Reusing a node ID for a different kind or operation is rejected.
- Rewiring an edge requires a new edge ID.
- Generated code contains stable markers that map back to model identifiers.
- Git commit SHA identifies the reviewed source version.
- Runtime deployment version identifies the executable snapshot.

## Determinism rules

- The same normalized model and compiler version produce the same generated artifact.
- Object keys are sorted recursively before serialization and hashing; array order remains meaningful.
- Secrets are represented only by references.
- Generated files are never the only copy of user-authored code.
- Compiler diagnostics are stored separately from the workflow definition.

## Boundary sequence

Every Studio, GitHub, compiler, and runtime adapter follows the same sequence: migrate, validate, validate identity for edits, serialize canonically, then pass the accepted model onward. Component-specific metadata and diagnostics stay outside the portable document.
