# Workflow index static boundaries

Static inspection for this slice must confirm that workflow-index and Studio files do not import:

- Trigger.dev run-engine modules;
- queue catalog or common Redis worker modules;
- deployment initialization or finalization services;
- supervisor or workload-management code;
- CLI build/deploy code;
- customer workload execution code;
- environment-variable secret values;
- user-token GitHub clients.

Allowed inherited connections are limited to dashboard authorization, the existing project/repository records, the GitHub App installation client, Prisma's parameterized query transport, shared UI primitives, feature flags, logging, and process signals.
