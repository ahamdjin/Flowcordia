# Workflow index audit events

The index records requested, started, completed, and failed synchronization events. Each event has a unique dedupe key, server-owned actor, correlation ID, timestamp, and a bounded payload containing only reason, generation, commit, counts, lease expiry, or normalized failure. Workflow content and secrets are excluded.
