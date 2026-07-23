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

## Advertised self-host boundary

The current internal-alpha distribution contracts are:

| Contract | Advertised value | Compatibility meaning |
| --- | --- | --- |
| Release manifest | schema `0.1` | Exact application, Trigger.dev upstream, image digest, runtime, components, and migration inventory |
| Publication evidence | schema `0.1` | Exact protected `main` image publication and signed provenance |
| Runtime identity | schema `0.1` manifest enforcement | Web, operations, migration, and diagnostics roles must agree on one release identity |
| Self-host diagnostics | schema `0.1` | Bounded READY/BLOCKED/UNAVAILABLE checks with no provider values or raw errors |
| Application topology | single-host Docker Compose, non-HA | One migration job, one web replica, one operations replica, and optional one-shot diagnostics service |
| Image platform | `linux/amd64` | Other platforms are unsupported until separately built and evidenced |
| Node runtime | `20.20.2` | Exact runtime version required by release identity and diagnostics |
| pnpm tooling | `10.33.2` | Exact release-tooling version; not a promise for arbitrary pnpm versions |
| Database migration policy | append-only exact checksum prefix | Rewritten, removed, reordered, rolled-back, or mixed histories are unsupported |

This table describes repository-enforced contracts, not a public-beta support promise. A release becomes supported only after its protected publication, deployment, diagnostics, recovery, connected acceptance, rollback, and dossier evidence are reviewed.

## Versioned contracts

The following contracts carry explicit schema or identity versions and must fail closed on unknown incompatible input:

- canonical FlowCordia workflow documents;
- repository function catalogs;
- third-party node-package manifests;
- installation, dependency, provider, alert, recovery, upgrade, release-candidate, and self-host diagnostics evidence;
- self-host release manifests, image-publication evidence, runtime identities, and migration-completion records;
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

The diagnostics command compares the live successful Prisma history with the exact release manifest. A diagnostic READY result does not prove rollback safety or replace restore evidence.

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

A deployment mode is supported only when it appears in the applicable release documentation with exact prerequisites, configuration gates, upgrade order, recovery procedure, diagnostics command, and acceptance evidence.

The existence of inherited Docker, Kubernetes, cloud-provider, object-store, email, alert, or compute code does not automatically make every topology supported by FlowCordia.

The initial Compose topology is deliberately single-host and non-HA. Scaling web or operations replicas, replacing external services, changing TLS or secret delivery, or installing the inherited execution plane through another topology requires separate compatibility evidence.

## Diagnostics and support bundles

`flowcordia doctor` is compatible only with the exact image that contains it and the manifest mounted into that image. Diagnostics from another application revision, image digest, manifest digest, or schema version must be rejected.

Support diagnostics may contain release identifiers, application/upstream revisions, image and manifest digests, timestamps, fixed check names, states, messages, and the evidence digest. They must not contain credentials, URLs, database identities, provider responses, raw errors, payloads, outputs, browser state, tenant identity, or customer data.

A READY diagnostic proves only the bounded checks observed at one time. It does not replace provider delivery, backup/restore, controlled upgrade, connected workflow, webhook, rollback, load, outage, or incident-response evidence.

## Deprecation and removal

Before public beta, incompatible changes may be made when they are documented in the pull request, migration path, capability matrix, compatibility table, and release notes.

Public beta releases must identify deprecated public contracts and provide a documented migration or replacement before removal, except when immediate removal is required to contain a security vulnerability or prevent data corruption.

General-availability deprecation windows and long-term support periods will be published separately; none are currently promised.

## Release decision

Compatibility is accepted per exact release, not inferred globally. The release dossier and published release notes must identify:

- FlowCordia application commit and release version;
- supported workflow, release, diagnostics, and evidence schemas;
- database migration identity;
- supported Trigger.dev upstream revision;
- supported runtime and deployment prerequisites;
- known incompatible changes and migration steps;
- capabilities and deployment modes included or excluded;
- rollback and recovery evidence applicable to the release.

When documentation, repository state, runtime behavior, diagnostics, and preserved evidence disagree, the release must stop until they are reconciled.
