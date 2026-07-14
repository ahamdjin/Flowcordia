# Flowcordia engineering index

Flowcordia is a Git-native enterprise workflow platform. It keeps Trigger.dev's durable execution foundation and adds a visual workflow studio, a typed workflow model, GitHub-native collaboration, and guided self-hosting.

## Source-of-truth rules

- Trigger.dev remains the execution foundation until a decision record explicitly replaces a subsystem.
- Git is the durable history for workflow definitions, reviews, releases, and rollbacks.
- The Flowcordia workflow model is the contract shared by the visual editor and code tooling.
- Secrets never enter workflow files or Git history.
- Every new subsystem must document what it connects to, why the connection exists, and who owns it.

## Folder map

- `product/` — product promise, capability coverage, and delivery order.
- `architecture/` — system boundaries and the contracts between them.
- `connections/` — the live registry of component-to-component connections.
- `decisions/` — architecture decision records that explain why major choices were made.
- `runbooks/` — validation, release, and rollback procedures.
- `specs/` — machine-readable contracts, beginning with the workflow schema.
- `research/` — evidence gathered from the inherited Trigger.dev repository.

## Change rule

A Flowcordia feature is not complete until:

1. its owning folder contains a README or design note;
2. its upstream and downstream connections are recorded in `connections/README.md`;
3. validation and rollback steps are known;
4. the change is tied to a branch, commit, and pull request;
5. no Trigger.dev core behavior was changed without an explicit decision record.

