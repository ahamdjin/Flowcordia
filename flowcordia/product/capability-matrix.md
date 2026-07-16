# Capability matrix

This matrix prevents the visual product from silently dropping Trigger.dev capabilities.

| Runtime capability | Flowcordia representation | Initial status |
| --- | --- | --- |
| Task definition | Workflow or code-task node | Model planned |
| Structured input and output | JSON Schema-backed ports and forms | Schema started |
| Retry policy | Node and workflow execution policy | Planned |
| Queues and concurrency | Execution policy panel | Inherited runtime |
| Delay and durable wait | Wait node | Planned |
| Human approval | Approval node and approval inbox | Planned |
| Schedules | Schedule trigger | Planned |
| Webhooks and API triggers | Trigger nodes | Planned |
| Child tasks and subflows | Call-workflow node | Planned |
| Batch and parallel execution | Map and parallel control nodes | Planned |
| Idempotency and TTL | Advanced trigger settings | Planned |
| Realtime updates and streams | Live canvas trace and stream output | Inherited runtime |
| Tags and metadata | Run context panel | Planned |
| Machines and build extensions | Developer runtime panel and code escape hatch | Inherited runtime |
| Environment variables and secrets | Credential references and environment bindings | Inherited storage |
| Deployment versions | Git SHA plus runtime deployment version | Inherited runtime |
| Preview branches | Pull-request preview environment | Connection planned |
| Replay and bulk actions | Run inspector actions | Inherited runtime |
| Alerts | Existing email, Slack, and webhook alert channels | Inherited runtime |
| Observability | Canvas trace plus existing logs and spans | Connection planned |
| Self-hosting | Guided setup over existing Docker/Kubernetes topology | Foundation started |

## Coverage rule

A runtime feature is considered visually covered only when it has configuration, validation, serialization, compilation, execution, observability, and round-trip tests. A code escape hatch preserves access but does not count as visual coverage.

