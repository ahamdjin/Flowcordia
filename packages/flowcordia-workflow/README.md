# `@flowcordia/workflow`

`@flowcordia/workflow` is the canonical, runtime-independent workflow contract for Flowcordia. Studio, Git-backed workflows, compilers, and runtime adapters exchange this model instead of importing one another's implementation details.

## Responsibilities

- TypeScript types for the current `0.1` workflow document.
- Strict runtime validation with stable, entity-aware diagnostics.
- Deterministic JSON serialization for reviewable Git diffs and reproducible hashing.
- Identity transition checks that prevent silent node replacement or edge rewiring.
- An explicit migration runner for stored documents created under older schemas.
- A strict `0.1` repository function catalog with typed input/output schemas and safe code references.
- A versioned JSON Schema and executable example documents.

The package does not execute tasks, resolve credentials, call GitHub, or expose UI state. Those belong to adapters and applications that consume the validated contract.

## Directory map

| Path | Owner | Why it exists |
| --- | --- | --- |
| `src/types.ts` | Contract | Defines the portable workflow vocabulary. |
| `src/functions.ts` | Developer bridge | Validates repository-owned typed function manifests and code-reference safety. |
| `src/validation.ts` | Contract | Rejects malformed or ambiguous documents at every boundary. |
| `src/serialization.ts` | Contract | Produces deterministic, newline-terminated JSON. |
| `src/identity.ts` | Contract | Protects stable node and edge identity across edits. |
| `src/migrations.ts` | Contract | Upgrades stored documents through reviewed, explicit steps. |
| `schema/` | Interoperability | Publishes the machine-readable schema for non-TypeScript consumers. |
| `examples/` | Product and integration teams | Provides valid fixtures for Studio, GitHub, compiler, and adapter work. |
| `catalog-examples/` | Developer bridge | Provides a valid repository function manifest separate from workflow-document fixtures. |
| `test/` | Contract | Verifies the rules that every consumer relies on. |

See [CONNECTIONS.md](./CONNECTIONS.md) for integration boundaries and [MIGRATIONS.md](./MIGRATIONS.md) for schema evolution rules.

## Basic use

```ts
import {
  migrateWorkflowDocument,
  parseWorkflowDocument,
  serializeWorkflow,
  validateWorkflowIdentityTransition,
} from "@flowcordia/workflow";

const parsed = parseWorkflowDocument(sourceFromGitHub);
if (!parsed.success) {
  return parsed.issues;
}

const canonicalSource = serializeWorkflow(parsed.workflow);
```

Use `migrateWorkflowDocument` before validation when reading persisted documents that may use an older schema. Use `validateWorkflowIdentityTransition` before saving an edit to an existing workflow.

## Commands

From this package directory:

```sh
pnpm typecheck
pnpm test --run
```
