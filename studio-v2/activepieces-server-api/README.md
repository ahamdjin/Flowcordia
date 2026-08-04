# Activepieces Builder Server Source

This directory is an inert source mirror of the Community Edition server code
that supports the Activepieces Builder at the pinned Flowcordia revision.

It provides the upstream implementations and contracts for Builder-facing
pieces, connections, flows, sample data, trigger testing, flags, and related
server behavior. Nothing in this directory is registered as a Flowcordia
runtime service.

Flowcordia adapters may reference these contracts, but Trigger.dev remains the
only workflow execution engine. Activepieces workers, queues, scheduling,
deployment, retries, and production execution are not enabled by this import.

The Enterprise-only upstream paths `packages/server/api/src/app/ee/` and
`packages/server/api/test/**/ee/` are intentionally excluded.

See `PROVENANCE.md` for the exact source revision and import boundaries.
