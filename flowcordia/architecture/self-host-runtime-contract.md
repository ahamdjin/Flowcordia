# Self-host runtime dependency contract

Flowcordia's supported external-services topology has one authoritative contract shared by runtime clients, preflight validation, migration jobs, diagnostics, and operator documentation.

## PostgreSQL

`DATABASE_URL` and `DIRECT_URL` must resolve to the same host and port. `DATABASE_HOST` is retained only as the bounded reachability target and must equal that derived endpoint. The migration job refuses to wait on or mutate a different database identity.

## ClickHouse

`CLICKHOUSE_URL` is passed to Goose without rewriting its protocol or TLS query parameters. Operators choose HTTP, HTTPS, and provider-specific secure options explicitly; Flowcordia does not silently append `secure=true`.

## Deployment registry

`DEPLOY_REGISTRY_HOST` and `DEPLOY_REGISTRY_NAMESPACE` are required for task deployment. v4 inherits the same values unless explicit `V4_DEPLOY_REGISTRY_*` overrides are supplied. Optional username and password values belong in the protected secrets file.

## Object storage

The provider resolver is shared by runtime uploads and readiness checks. A complete named `OBJECT_STORE_<PROTOCOL>_*` provider wins. For backwards compatibility, selecting `OBJECT_STORE_DEFAULT_PROTOCOL=s3` may use the generic `OBJECT_STORE_*` provider only when its service is also `s3`.

Static-credential requests verify and access the same configured bucket. If the logical key already starts with the bucket name, that prefix is stripped before constructing the path-style request; otherwise the bucket is prepended. This keeps existing `packets/...` keys compatible while supporting buckets whose name is not `packets`.

## Proposal events

The operations worker publishes to an operator-managed external durable HTTPS consumer. The consumer verifies the exact HMAC-signed body, deduplicates the idempotency key, and returns 2xx only after durable acceptance. Flowcordia does not expose an internal `/api/flowcordia/proposal-events` sink.

## Public origins

The initial supported single-host profile requires `APP_ORIGIN` and `LOGIN_ORIGIN` to resolve to the same HTTPS origin. This matches the published doctor and avoids a topology that passes preflight but fails diagnostics.
