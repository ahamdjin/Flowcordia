# Compatibility Policy

This policy defines which compatibility claims FlowCordia makes at each maturity stage. It prevents an implementation detail, green pull request, inherited Trigger.dev behavior, or mutable container tag from being mistaken for a supported public contract.

## Current stage: internal alpha

During internal alpha:

- `main` and draft release candidates may change without backward-compatibility guarantees;
- database changes must still use reviewed, append-only Prisma migrations and preserve recovery evidence;
- persisted FlowCordia workflow documents change only through explicit versioned migrations;
- generated Trigger.dev task source is deterministic for one exact FlowCordia application commit, workflow document, repository function catalog, and runtime configuration;
- protected release gates may reject a candidate that repository CI accepts;
- only capabilities marked delivered in the capability matrix are part of the tested product boundary;
- undocumented APIs, routes, database tables, environment variables, generated files, inherited internal services, and tag-only dependency images are not compatibility promises.

## Advertised self-host boundary

The current internal-alpha distribution contracts are:

| Contract | Advertised value | Compatibility meaning |
| --- | --- | --- |
| Application release manifest | schema `0.1` | Exact application, Trigger.dev upstream, application image digest, runtime, components, and migration inventory |
| Bundled dependency manifest | schema `0.1` | Exact ordered `linux/amd64` PostgreSQL, Redis, Electric, ClickHouse, MinIO, registry, BusyBox, Docker socket proxy, Trigger.dev supervisor, and S2 image set bound to one application release |
| Application publication evidence | schema `0.1` | Exact protected `main` application-image publication and signed provenance |
| Runtime identity | schema `0.1` application-manifest enforcement | Web, operations, migration, and diagnostics roles must agree on one application release identity |
| Self-host diagnostics | schema `0.1` | Bounded READY/BLOCKED/UNAVAILABLE checks with no provider values or raw errors |
| Migration completion evidence | schema `0.2` | Atomic no-overwrite exact release/application/image/manifest/migration completion identity |
| Bundled clean-install evidence | schema `0.1` | Official target publication, exact bundled manifest, isolated empty-project install, diagnostics, and complete container/network/volume teardown |
| Published self-host lifecycle evidence | schema `0.1` | Distinct official current/target publications, install/restart/recovery/upgrade/rollback-boundary/teardown phases, and final digest |
| Connected release campaign receipt | schema `0.1` | Fixed official stage order, unchanged `main`, exact dispatch reconciliation, bounded stage identities, bundle digest, and controller receipt digest |
| Immutable launch dossier | schema `0.6` | Ten distinct official `main` sources bind bundled clean install, lifecycle, provider, alert, preview, promotion, production, webhook, rollback proposal, and rollback production into one lineage |
| Application topology | single-host Docker Compose, non-HA | One migration job, one web replica, one operations replica, optional diagnostics, and the documented execution-plane boundary |
| Bundled topology | single-host Docker Compose, non-HA | Exact dependency set plus one supervisor, one web, one operations process, one migration owner, and private networks/volumes |
| Image platform | `linux/amd64` | Other platforms are unsupported until separately built, pinned, and evidenced |
| Node runtime | `20.20.2` | Exact runtime version required by release identity and diagnostics |
| pnpm tooling | `10.33.2` | Exact release-tooling version; not a promise for arbitrary pnpm versions |
| Database migration policy | append-only exact checksum prefix | Rewritten, removed, reordered, rolled-back, or mixed histories are unsupported |

This table describes repository-enforced contracts, not a public-beta support promise. A release becomes supported only after its protected publication, bundled clean install, deployment, diagnostics, recovery, connected campaign, rollback, and schema `0.6` dossier evidence are reviewed.

## Versioned contracts

The following contracts carry explicit schema or identity versions and must fail closed on unknown incompatible input:

- canonical FlowCordia workflow documents;
- repository function catalogs;
- third-party node-package manifests;
- installation, dependency, provider, alert, recovery, upgrade, release-candidate, self-host diagnostics, migration-completion, bundled-clean-install, and published-lifecycle evidence;
- application release manifests, bundled dependency manifests, image-publication evidence, runtime identities, and migration-completion records;
- connected preview, promotion, production identity, production, webhook, rollback, campaign-receipt, and launch-manifest evidence;
- public webhook signature and request-framing protocol;
- generated task identity and exact deployment/worker/closure binding.

A schema version identifies structure and validation behavior. It does not imply that every implementation with the same schema supports identical operational scale, providers, deployment modes, image mirrors, or service objectives.

## Repository and generated artifacts

Canonical workflow JSON and generated Trigger.dev task source are reviewed and committed together. FlowCordia supports regeneration only when:

- the workflow document is valid for the checked-out application version;
- referenced repository functions and schemas resolve at the exact commit;
- the generated path is owned by FlowCordia and has not been manually edited;
- the compiler produces the expected canonical digest;
- the release follows the documented proposal and promotion path.

Manual edits to generated source, rewritten migration history, direct production mutations outside the governed path, or manual edits to accepted release manifests are unsupported.

## Application and dependency image compatibility

The application image and bundled dependencies have separate immutable identities.

The application release manifest binds the FlowCordia image digest, application/upstream commits, runtime, components, and migration inventory. The bundled dependency manifest binds that exact application release to one ordered dependency set. Neither manifest substitutes for the other.

A supported bundled reference must include lowercase `@sha256:<64 hex>`. A tag may remain before the digest for human readability, but the digest is authoritative. Tag-only values such as `latest`, `v4-beta`, `14`, or `7-alpine` are unsupported in the final rendered topology.

Replacing, mirroring, adding, removing, or reordering a bundled dependency creates a new compatibility set and a new no-overwrite bundled manifest, even when some content digests remain unchanged. The new set requires repository tests, protected blank-host acceptance, lifecycle acceptance, connected acceptance, and a fresh schema `0.6` dossier.

The supported wrapper renders the immutable dependency overlay last. Compose invocation that omits or supersedes that overlay is outside the supported bundled path.

## Database compatibility

FlowCordia permits only a live successful migration history that is an exact checksum-bound prefix of the candidate repository history. Existing migration files must not be edited, removed, reordered, or replaced.

A migration-bearing release requires a fresh matching backup manifest, successful isolated restore rehearsal, controlled upgrade decision, and release-candidate evidence. Passing those gates does not establish zero-downtime compatibility unless a published release explicitly makes that claim.

The diagnostics command compares the live successful Prisma history with the exact application release manifest. A diagnostic READY result does not prove rollback safety or replace restore evidence.

## Trigger.dev upstream compatibility

Trigger.dev remains the execution foundation. FlowCordia-owned paths and reviewed adapter boundaries are tracked separately from inherited core paths.

An upstream update is supported only after:

- the exact base/head drift report is reviewed;
- inherited-core changes receive explicit compatibility analysis;
- repository tests pass on the exact candidate head;
- the exact supervisor and other inherited execution-plane image identities are updated in the bundled manifest when applicable;
- migrations, workers, web application, preview, production, webhook, rollback, blank-host, lifecycle, and campaign paths complete their required evidence;
- the published release identifies the supported upstream revision.

FlowCordia does not promise compatibility with arbitrary Trigger.dev releases, plugins, supervisor tags, database histories, deployment images, or undocumented internals.

## Deployment compatibility

A deployment mode is supported only when it appears in the applicable release documentation with exact prerequisites, application and dependency manifests, configuration gates, upgrade order, recovery procedure, diagnostics command, and acceptance evidence.

The existence of inherited Docker, Kubernetes, cloud-provider, object-store, email, alert, or compute code does not automatically make every topology supported by FlowCordia.

The initial Compose topology is deliberately single-host and non-HA. Scaling web or operations replicas, replacing services, changing TLS or secret delivery, using another image platform, or installing the inherited execution plane through another topology requires separate compatibility evidence.

The bundled topology is compatible only with the exact dependency references and private network/storage identities declared by the bundled manifest and protected configuration. A successful render does not make another dependency version or registry mirror supported.

## Diagnostics, blank-host, lifecycle, and campaign evidence

`flowcordia doctor` is compatible only with the exact application image that contains it and the application manifest mounted into that image. Bundled diagnostics additionally require deployment configuration matching the exact bundled manifest. Diagnostics from another application revision, image digest, manifest digest, dependency set, or schema version must be rejected.

Support diagnostics may contain release identifiers, application/upstream revisions, image and manifest digests, timestamps, fixed check names, states, messages, and the evidence digest. They must not contain credentials, URLs, database identities, provider responses, raw errors, payloads, outputs, browser state, tenant identity, or customer data.

A READY diagnostic proves only the bounded checks observed at one time. It does not replace provider delivery, backup/restore, controlled upgrade, connected workflow, webhook, rollback, load, outage, or incident-response evidence.

A READY bundled clean-install artifact proves one protected empty-project install pulled the exact application and dependency images, completed the supported install/diagnostic path, and removed its project containers, networks, and volumes. It does not establish upgrade, recovery, provider, connected workflow, webhook, load, or production compatibility.

A READY lifecycle artifact proves one protected disposable two-release application-plane journey using official published artifacts. It is compatible only with the exact workflow schema, image platform, topology, current/target release contracts, dedicated runner policy, and external dependency configuration declared by that run. It does not establish compatibility for arbitrary release gaps, rewritten migration history, HA topologies, other platforms, a shared production installation, or the connected product journey.

A READY campaign receipt proves the fixed controller observed successful official stages on one unchanged application head and transferred only bounded identities between them. It does not replace any source artifact or protected reviewer decision. The schema `0.6` release dossier remains the durable release decision.

## Deprecation and removal

Before public beta, incompatible changes may be made when they are documented in the pull request, migration path, capability matrix, compatibility table, bundle compatibility version, and release notes.

Public beta releases must identify deprecated public contracts and provide a documented migration or replacement before removal, except when immediate removal is required to contain a security vulnerability or prevent data corruption.

General-availability deprecation windows and long-term support periods will be published separately; none are currently promised.

## Release decision

Compatibility is accepted per exact release, not inferred globally. The release dossier and published release notes must identify:

- FlowCordia application commit and release version;
- application release manifest and bundled dependency manifest digests;
- bundled compatibility version and exact dependency image set;
- supported workflow, release, diagnostics, campaign, and evidence schemas;
- database migration identity;
- supported Trigger.dev upstream revision and supervisor image;
- supported runtime, platform, and deployment prerequisites;
- known incompatible changes and migration steps;
- capabilities and deployment modes included or excluded;
- blank-host, lifecycle, rollback, and recovery evidence applicable to the release;
- the exact ten official run identities accepted by schema `0.6`.

When documentation, repository state, runtime behavior, dependency images, diagnostics, campaign evidence, and preserved dossier disagree, the release must stop until they are reconciled.
