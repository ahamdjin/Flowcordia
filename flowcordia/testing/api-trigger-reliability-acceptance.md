# Connected API-trigger reliability acceptance

## Purpose

This protected campaign proves the existing authenticated API-trigger path behaves safely under retries and queue delay. It does not add a second ingress or implement a separate idempotency store.

The campaign deploys one exact repository-owned fixture and proves:

1. two immediate requests with the same key return the same run identity;
2. the same key produces a new run after the configured 60-second idempotency window;
3. a run held behind a concurrency-one blocker expires with status `EXPIRED` after its 60-second queue TTL;
4. a deliberately failed run releases its idempotency key, so the same request creates a distinct retry run.

## Protected environment

Configure `flowcordia-api-trigger-reliability` with required reviewers and a branch restriction allowing only `main`.

Required protected values:

- secret `FLOWCORDIA_API_RELIABILITY_BASE_URL` — exact HTTPS Flowcordia origin;
- secret `FLOWCORDIA_API_RELIABILITY_PAT` — deployment PAT for the controlled project;
- variable `FLOWCORDIA_API_RELIABILITY_PROJECT_REF` — exact project reference;
- secret `FLOWCORDIA_API_RELIABILITY_PRODUCTION_KEY` — production environment API key for the same project.

The project must be disposable or explicitly dedicated to acceptance. The workflow deploys three fixed task identifiers and must not be pointed at an unrelated customer project.

## Execution

Dispatch **Flowcordia API trigger reliability acceptance** from the exact `main` commit being evaluated with confirmation `RUN-API-TRIGGER-RELIABILITY`.

The workflow builds and deploys:

- `flowcordia-api-idempotency` — deterministic successful task;
- `flowcordia-api-queue-ttl` — concurrency-one task with one bounded blocking run;
- `flowcordia-api-failure-release` — deterministic one-attempt failure.

It triggers only through `/api/v1/tasks/{taskIdentifier}/trigger` and observes runs through the authenticated run endpoint. Request payloads and generated keys stay in the private runner process and are never written to the evidence artifact.

## Evidence

The schema `0.1` artifact records:

- repository and exact application commit;
- workflow run and attempt;
- exact deployment version;
- original and duplicate run identities;
- original and post-expiry run identities with the 60-second key TTL;
- blocker and expired run identities, status `EXPIRED`, and the 60-second queue TTL;
- first and second failed-run identities;
- bounded timestamps and a canonical SHA-256 digest.

The contract recursively rejects API keys, authorization, credentials, headers, idempotency keys, payloads, secrets, tokens, cookies, and URLs.

## Failure behavior

A different duplicate run, reused post-expiry run, non-expired queue probe, reused failed-run identity, malformed deployment or run identity, invalid chronology, sensitive evidence field, deployment failure, unexpected terminal state, or timeout is a stop-ship failure.

A green pull-request gate proves the fixture and evidence contract. A successful protected workflow run from `main` is required before the Beta dossier may treat this gate as READY.
