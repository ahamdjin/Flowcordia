# Capability matrix

This matrix prevents the visual product from silently dropping Trigger.dev capabilities.

| Runtime capability | Flowcordia representation | Initial status |
| --- | --- | --- |
| Task definition | Workflow or code-task node | Bounded compiler and runtime slice delivered |
| Structured input and output | JSON Schema-backed ports and forms | Repository-function schemas, generated TypeScript contracts, recursive Studio test forms, client/runtime validation, structured output, and advanced JSON fallback delivered |
| Repository function validation | Exact-head fixture suite and validation gate | Same-build exact-version Trigger.dev task, canonical suite digest, real handler execution, status-only Studio projection, and promotion blocking delivered |
| Repository proposal governance | Versioned policy, exact-head evidence, and promotion gate | Immutable application floor, monotonic repository-writer strengthening, selected-proposal evidence, correlated audit, and fresh GitHub enforcement delivered |
| Connected repository readiness | Manual Studio operator probe | Exact installation identity, minimum GitHub permissions, immutable production head, workflow source/index, generated task discovery, and preview setting delivered without mutation |
| Retry policy | Trigger-owned whole-workflow execution policy | Bounded Trigger.dev task binding delivered; independent node retries remain planned |
| Queues and concurrency | Trigger-owned execution policy panel | Reviewed queue names bind to the whole task; invocation-time concurrency keys are rejected until payload mapping is delivered |
| HTTP request | HTTP action node | Bounded method/HTTPS form, structural preview, and allowlisted live adapter delivered |
| Conditions | Structured condition node and true/false edges | Scalar path/operator/value form, branch editor, preview, compiler, and live adapter delivered; object/array comparisons remain code-owned |
| Delay and durable wait | Wait node | Human-unit duration form with exact-seconds serialization, structural preview, and Trigger.dev durable-wait adapter delivered |
| Human approval | Approval node and approval inbox | Planned |
| Schedules | Schedule trigger | Bounded cron/timezone form, validation, and production-only declarative deployment binding delivered |
| Authenticated API triggers | API trigger node | Visual authoring and deterministic project-access-token task endpoint binding delivered |
| Public webhooks | Webhook trigger node | Bounded method/path form and compiler validation delivered; signed public deployment binding planned and labelled in Studio |
| Child tasks and subflows | Call-workflow node | Planned |
| Batch and parallel execution | Map and parallel control nodes | Planned |
| Idempotency and TTL | Advanced trigger settings | Planned |
| Realtime updates and streams | Live canvas trace and stream output | Bounded active-state polling delivered; inherited Realtime integration remains later |
| Tags and metadata | Run context panel | Planned |
| Machines and build extensions | Trigger-owned runtime panel and code escape hatch | Machine preset and maximum duration bind to the whole task; build extensions remain inherited developer configuration |
| Environment variables and secrets | Credential references and environment bindings | Inherited storage |
| Deployment versions | Git SHA plus runtime deployment version | Exact proposal-head deployment projection and version-locked workflow/validation runs delivered |
| Preview branches | Pull-request preview environment | Native environment preparation, connected GitHub deployment handoff, and explicit prerequisite readiness probe delivered |
| Replay and bulk actions | Run inspector actions | Inherited runtime |
| Alerts | Existing email, Slack, and webhook alert channels | Inherited runtime |
| Observability | Canvas trace plus existing logs and spans | Structural test traces, formatted output, contract diagnostics, exact-correlated live node proof, and status-only function-validation evidence delivered |
| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Foundation started |

## Coverage rule

A runtime feature is considered visually covered only when it has configuration, validation, serialization, compilation, execution, observability, and round-trip tests. A code escape hatch preserves access but does not count as visual coverage.
