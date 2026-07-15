# Workflow index generation and lease model

Each new synchronization request advances a durable generation. A worker claim records a unique lock token and expiry. Snapshot completion requires the same aggregate, full server-owned scope, generation, running state, and lock token. An older worker therefore cannot replace a catalog after a newer request has superseded its generation. Expired claims are reclaimed with `FOR UPDATE SKIP LOCKED`.
