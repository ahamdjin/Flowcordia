# Credential management

## Purpose

Flowcordia lets an authorized operator configure credentials for a reviewed visual HTTP node without creating a second secret store or exposing an existing value to Studio. Workflow files contain bounded reference names only. Each reference deterministically maps to one Trigger.dev project-environment variable such as `billing-api` → `FLOWCORDIA_CREDENTIAL_BILLING_API`.

## Read boundary

Studio receives only:

- the reviewed reference name;
- its deterministic environment-variable name;
- whether a value is missing, present as a secret, or present but not marked secret; and
- the non-sensitive storage version.

Environment-variable read and write permissions remain separate. A role without read permission receives `UNAVAILABLE` for every reviewed reference instead of configured or missing state. The status query reads environment-variable metadata directly. It does not call the secret store, decrypt values, request non-secret values, serialize header contents, or expose updater identity.

## Write boundary

A credential write is allowed only when all of the following remain true on the server:

1. the authenticated user can access Flowcordia Studio;
2. the user can write environment variables for the exact route environment tier;
3. the route project and environment are re-resolved from server-owned identity;
4. the requested workflow is still available from the connected repository or its current durable draft;
5. the requested node is a visual `action.http` node; and
6. the credential reference is still bound to that exact node.

The browser submits 1–32 write-only HTTP header name/value pairs and the explicit `STORE_FLOWCORDIA_CREDENTIAL` confirmation. Header names and values are bounded, duplicate names and multiline values are rejected, and transport-owned headers such as `host`, `content-length`, and `transfer-encoding` fail before storage.

The server canonicalizes the headers, serializes the existing runtime `{ "headers": { ... } }` contract, and writes it through `EnvironmentVariablesRepository` with `isSecret: true` and `override: true`. The inherited secret provider, references, transactions, versioning, and updater metadata remain authoritative.

## Verification boundary

The pull-request boundary completed the following checks on one exact branch head:

- strict command, confirmation, header, and exact binding-ownership contracts;
- 13 focused credential and existing reference tests;
- deterministic formatting and clean-diff validation;
- Prisma client generation and the Flowcordia workflow package build;
- the complete 62-task monorepo typecheck; and
- removal of temporary workflows, scripts, and diagnostic captures before review.

The repository exact-head matrix remains the merge authority for formatting, lint, exports, package shards, webapp shards, production build, and browser E2E. Passing local or temporary validation alone is not release evidence.

## Deliberate boundary

Studio never reads, reveals, tests, copies, exports, or logs a stored credential value. A successful response contains the public reference and derived environment name only. Inputs are cleared after success. Deletion and bulk import remain in the existing environment-variable administration surface because removing a credential can break multiple deployed workflow versions.

OAuth installation, external vault providers, per-field secret schemas, automatic rotation, expiring credentials, and organization-wide credential sharing require separately reviewed product boundaries.

## Acceptance

Connected acceptance must bind a reference, store a non-production test credential in a protected reference environment, deploy the exact proposal head, execute an allowlisted HTTP request that requires the header, rotate the value, prove the previous value no longer works, and preserve status-only evidence. Browser state, request headers, secret values, provider responses, and decrypted environment values must never enter evidence artifacts.
