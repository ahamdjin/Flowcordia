# Bundled supervisor and S2 execution acceptance

## Purpose

This protected acceptance closes the gap between a valid Compose model and a functioning bundled Flowcordia installation. It installs one exact published application image on an empty disposable identity, deploys one deterministic reference task through the inherited self-host deployment path, executes it through the Trigger.dev supervisor, proves S2 durable state changed during that run, restarts the application and execution plane, and removes every disposable resource.

## Protected prerequisites

Configure the `flowcordia-bundled-execution-acceptance` environment for `main` only with required reviewers. Its dedicated `flowcordia-release` runner must use UID 1000 and provide Linux x64, Docker Engine, Compose v2, Buildx, `ss`, `jq`, `gh`, adequate disk, and local registry support for the protected loopback port.

Environment configuration:

- `FLOWCORDIA_BUNDLED_ACCEPTANCE_CONFIG_FILE` — absolute path to the reviewed bundled deployment configuration;
- `FLOWCORDIA_BUNDLED_ACCEPTANCE_SECRETS_FILE` — protected absolute path to its secret file;
- `FLOWCORDIA_BUNDLED_ACCEPTANCE_REGISTRY_AUTH_FILE` — protected absolute path to the generated registry `htpasswd` file;
- `FLOWCORDIA_BUNDLED_ACCEPTANCE_WORK_PARENT` — empty owner-only parent for disposable run data;
- `FLOWCORDIA_BUNDLED_ACCEPTANCE_EVIDENCE_DIR` — owner-only persistent directory for sanitized evidence.

The deployment configuration must pin the reviewed dependency images required for Beta evidence. The Flowcordia image and release identity are replaced at runtime from the exact protected publication artifact and cannot be supplied manually.

## Execution

Dispatch **Flowcordia bundled execution acceptance** from the exact `main` commit to be accepted. Supply the successful `Flowcordia publish self-host image` workflow run for that same commit and confirmation `RUN-BUNDLED-EXECUTION-ACCEPTANCE`.

The workflow then:

1. verifies the publication run, image manifest, image evidence, GitHub attestation, source commit, and protected runner identity;
2. derives unique Compose, network, and volume identities and rejects any pre-existing resource;
3. validates the bundled configuration and rendered Compose model;
4. pulls and starts PostgreSQL, Redis, Electric, ClickHouse, MinIO, registry, S2, Docker proxy, migrations, web, operations, and supervisor;
5. requires all long-running services ready and runs release diagnostics;
6. creates one private disposable admin, organization, V2-engine project, production environment, and one-time PAT without logging them;
7. deploys `flowcordia-beta-reference` through the repository CLI, local Buildx path, and private registry;
8. triggers the task with the production environment key and requires a successful terminal run;
9. captures Docker events only for the run window and requires a supervisor-created workload image from the exact private registry namespace;
10. snapshots the persistent S2 volume immediately before and after the verified run and requires a state change;
11. restarts web, operations, and supervisor, waits for readiness, and runs diagnostics again;
12. removes containers, networks, and volumes and proves they are absent;
13. uploads only the bounded schema `0.1` evidence artifact.

## Evidence boundary

The artifact records exact repository, source commit, release ID, application image digest, workflow run and attempt, service count, deployment version, task count, public run identity, supervisor/S2 proof booleans, restart state, teardown state, timestamps, and a canonical SHA-256 digest.

It rejects and never uploads private paths, API keys, PATs, registry credentials, payloads, outputs, provider responses, headers, URLs, cookies, database identities, internal worker IDs, container IDs, Docker events, raw logs, or S2 contents. Private bootstrap, deployment, execution, Docker-event, diagnostics, and observation files are deleted on success or failure.

## Failure behavior

Any mutable or unverified application image, stale publication, occupied runner port, pre-existing disposable resource, unhealthy service, failed migration or doctor, deployment failure, failed task, absent supervisor workload event, unchanged S2 state, failed restart, incomplete teardown, sensitive evidence field, or existing evidence path is a stop-ship failure.

A green pull-request validation confirms the harness contract only. Beta launch evidence requires a successful protected run from `main` against the published candidate.
