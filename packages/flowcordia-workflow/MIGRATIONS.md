# Workflow schema migrations

Workflow schema versions describe persisted product data. Changing a version is an interoperability decision, not a package-release detail.

## Rules

- `schemaVersion` is mandatory on every stored workflow.
- The current package accepts exactly the current schema after migration.
- Each migration declares one `fromVersion` and one `toVersion`.
- A source version can have only one outgoing migration in a registry.
- Migration functions receive a clone and must return a new JSON-compatible object.
- The runner validates the final document before returning success.
- Missing paths, cycles, thrown errors, and incorrect target versions fail closed with structured issues.
- Migrations never fetch secrets, call external services, or depend on wall-clock time.

## Adding a version

1. Add the new literal and TypeScript contract.
2. Add a versioned schema under `schema/` without deleting previous schemas that are still readable.
3. Implement the smallest deterministic migration from the previous version.
4. Add migration fixtures for every changed field and failure path.
5. Update the examples and connection documentation.
6. Release consumers only after Studio, GitHub, compiler, and runtime adapters accept the new version.

## Example registry

```ts
import { migrateWorkflowDocument, type WorkflowMigration } from "@flowcordia/workflow";

const migrations: WorkflowMigration[] = [
  {
    fromVersion: "0.1",
    toVersion: "0.2",
    migrate(document) {
      return { ...document, schemaVersion: "0.2" };
    },
  },
];

const result = migrateWorkflowDocument(storedDocument, migrations);
```

The example only shows registry mechanics. A real migration must explicitly transform every field whose meaning changed.
