# ADR 0001: Trigger.dev remains the runtime foundation

## Status

Accepted for the foundation phase.

## Context

The inherited repository already contains durable queues, retries, waits, deployment versioning, workload supervision, realtime updates, observability, and self-hosting topology. Rebuilding those systems before validating Flowcordia's product layer would multiply risk.

## Decision

Flowcordia will add adapters, workflow compilation, visual tooling, and enterprise controls above the existing runtime. The run engine, queues, supervisor, deployment lifecycle, and workload providers remain unchanged unless a later decision identifies a measured limitation and a tested replacement.

## Consequences

- The first milestones can focus on the visual/developer bridge.
- Runtime capability remains accessible through code while visual coverage grows.
- Upstream compatibility must be tracked deliberately.
- Self-host limitations are documented rather than hidden.

## Reversal condition

Replace a runtime subsystem only after compatibility tests, migration, rollback, and operational ownership are approved.

