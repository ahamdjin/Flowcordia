# Compatibility Policy

This policy defines which compatibility claims FlowCordia makes at each maturity stage. It prevents an implementation detail, green pull request, or inherited Trigger.dev behavior from being mistaken for a supported public contract.

## Current stage: internal alpha

During internal alpha:

- `main` and draft release candidates may change without backward-compatibility guarantees;
- database changes must still use reviewed, append-only Prisma migrations and preserve recovery evidence;
- persisted FlowCordia workflow documents change only through explicit versioned migrations;
- generated Trigger.dev task source is deterministic for one exact FlowCordia application commit, workflow document, repository function catalog, and runtime configuration;
- protected release gates may reject a candidate that repository CI accepts;
- only capabilities marked delivered in the capability matrix are part of the tested product boundary;
- undocumented APIs, routes, database tables, environment variables, generated files, and inherited internal services are not compatibility promises.

## Versioned contracts

The following contracts carry explicit schema or identity versions and must fail closed on unknown incompatible input:

- canonical FlowCordia workflow documents;
- repository function catalogs;
- third-party node-package manifests;
- installation, dependency, provider, alert, recovery, upgrade, and release-candidate evidence;
- connected preview, promotion, production, webhook, rollback, and launch-manifest evidence;
- public webhook signature and request-framing protocol;
- generated task identity and exact deployment/worker binding.

A schema version identifies structure and validation behavior. It does not imply that every implementation with the same schema supports identical operational scale, providers, deployment modes, or service objectives.

## Repository and generated artifacts

Canonical workflow JSON and generated Trigger.dev task source are reviewed and committed together. FlowCordia supports regeneration only when:

- the workflow document is valid for the checked-out application version;
- referenced repository functions and schemas resolve at the exact commit;
- the generated path is owned by FlowCordia and has not been manually edited;
- the compiler produces the expected canonical digest;
- the release follows the documented proposal and promotion path.

Manual edits to generated source, rewritten migration history, or direct production mutations outside the governed path are unsupported.

## Database compatibility

FlowCordia permits only a live successful migration history that is an exact checksum-bound prefix of the candidate repository history. Existing migration files must not be edited, removed, reordered, or replaced.

A migration-bearing release requires a fresh matching backup manifest, successful isolated restore rehearsal, controlled upgrade decision, and release-candidate evidence. Passing those gates does not establish zero-downtime compatibility unless a published release explicitly makes that claim.

## Trigger.dev upstream compatibility

Trigger.dev remains the execution foundation. FlowCordia-owned paths and reviewed adapter boundaries are tracked separately from inherited core paths.

An upstream update is supported only after:

- the exact base/head drift report is reviewed;
- inherited-core changes receive explicit compatibility analysis;
- repository tests pass on the exact candidate head;
- migrations, workers, web application, preview, production, webhook, and rollback paths complete their required evidence;
- the published release identifies the supported upstream revision.

FlowCordia does not promise compatibility with arbitrary Trigger.dev releases, plugins, database histories, deployment images, or undocumented internals.

## Deployment compatibility

A deployment mode is supported only when it appears in the applicable release documentation with exact prerequisites, configuration gates, upgrade order, recovery procedure, and acceptance evidence.

The existence of inherited Docker, Kubernetes, cloud-provider, object-store, email, alert, or compute code does not automatically make every topology supported by FlowCordia.

## Deprecation and removal

Before public beta, incompatible changes may be made when they are documented in the pull request, migration path, capability matrix, and release notes.

Public beta releases must identify deprecated public contracts and provide a documented migration or replacement before removal, except when immediate removal is required to contain a security vulnerability or prevent data corruption.

General-availability deprecation windows and long-term support periods will be published separately; none are currently promised.

## Release decision

Compatibility is accepted per exact release, not inferred globally. The release dossier and published release notes must identify:

- FlowCordia application commit and release version;
- supported workflow and evidence schemas;
- database migration identity;
- supported Trigger.dev upstream revision;
- supported runtime and deployment prerequisites;
- known incompatible changes and migration steps;
- capabilities and deployment modes included or excluded;
- rollback and recovery evidence applicable to the release.

When documentation, repository state, runtime behavior, and preserved evidence disagree, the release must stop until they are reconciled.
