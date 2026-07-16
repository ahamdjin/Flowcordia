# ADR 0002: Own the workflow index in a dedicated PostgreSQL schema

## Status

Accepted for the repository workflow index slice.

## Context

The inherited Prisma schema already contains Trigger.dev runtime, deployment, organization, project, and GitHub connection models. The Flowcordia workflow index needs durable generations, leases, exact source identities, invalid-entry projection, audit events, and push-delivery replay protection. Adding unrelated nullable fields to inherited models or storing this state in JSON would weaken ownership and constraints.

## Decision

Create a dedicated `flowcordia` PostgreSQL schema and access it through a typed, parameterized raw-SQL repository in the Flowcordia feature boundary. Cross-schema foreign keys bind existing organization, project, GitHub App installation, and repository identities.

The migration is additive. Prisma continues to own the inherited `public` schema; Flowcordia owns its index schema and migrations. No runtime execution tables are changed.

## Consequences

- Database constraints can express the index lifecycle without widening Trigger.dev models.
- The repository adapter must be reviewed carefully because generated Prisma delegates are not used for these tables.
- Schema existence must be included in deployment readiness and rollback documentation.
- A future dedicated Flowcordia database can migrate these tables behind the same repository contract.
