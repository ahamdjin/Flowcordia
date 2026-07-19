# Capability matrix

This matrix prevents the visual product from silently dropping Trigger.dev capabilities.

| Runtime capability | Flowcordia representation | Initial status |
| --- | --- | --- |
| Task definition | Workflow or code-task node | Bounded compiler and runtime slice delivered |
| Structured input and output | JSON Schema-backed ports and forms | Repository-function schemas, generated TypeScript contracts, recursive Studio test forms, client/runtime validation, structured output, and advanced JSON fallback delivered |
| Repository function validation | Exact-head fixture suite and validation gate | Same-build exact-version Trigger.dev task, canonical suite digest, real handler execution, status-only Studio projection, and promotion blocking delivered |
| Repository proposal governance | Versioned policy, exact-head evidence, and promotion gate | Immutable application floor, monotonic repository-writer strengthening, selected-proposal evidence, correlated audit, and fresh GitHub enforcement delivered |
| Retry policy | Node and workflow execution policy | Planned |
| Queues and concurrency | Execution policy panel | Inherited runtime |
| HTTP request | HTTP action node | Structural preview and allowlisted live adapter delivered |
| Conditions | Structured condition node and true/false edges | Editor, preview, compiler, and live adapter delivered |
| Delay and durable wait | Wait node | Structural preview and Trigger.dev durable-wait adapter delivered |
| Human approval | Approval node and approval inbox | Planned |
| Schedules | Schedule trigger | Visual configuration and compiler validation delivered; deployment binding planned |
| Webhooks and API triggers | Trigger nodes | Visual configuration and compiler validation delivered; deployment binding planned |
| Child tasks and subflows | Call-workflow node | Planned |
| Batch and parallel execution | Map and parallel control nodes | Planned |
| Idempotency and TTL | Advanced trigger settings | Planned |
| Realtime updates and streams | Live canvas trace and stream output | Bounded active-state polling delivered; inherited Realtime integration remains later |
| Tags and metadata | Run context panel | Planned |
| Machines and build extensions | Developer runtime panel and code escape hatch | Inherited runtime |
| Environment variables and secrets | Credential references and environment bindings | Inherited storage |
| Deployment versions | Git SHA plus runtime deployment version | Exact proposal-head deployment projection and version-locked workflow/validation runs delivered |
| Preview branches | Pull-request preview environment | Native environment preparation and connected GitHub deployment handoff delivered |
| Replay and bulk actions | Run inspector actions | Inherited runtime |
| Alerts | Existing email, Slack, and webhook alert channels | Inherited runtime |
| Observability | Canvas trace plus existing logs and spans | Structural test traces, formatted output, contract diagnostics, bounded live node-status projection, and status-only function-validation evidence delivered |
| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Foundation started |

## Coverage rule

A runtime feature is considered visually covered only when it has configuration, validation, serialization, compilation, execution, observability, and round-trip tests. A code escape hatch preserves access but does not count as visual coverage.
