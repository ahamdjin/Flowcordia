# Connection registry

This file records where Flowcordia components connect and why each connection exists. Update it whenever a component, direction, or owner changes.

| Source | Target | Why the connection exists | Current state |
| --- | --- | --- | --- |
| Studio | `@flowcordia/workflow` | Convert visual intent into a portable validated contract | Core contract implemented; Studio adapter planned |
| TypeScript SDK | `@flowcordia/workflow` | Expose code-authored capabilities to the same workflow identity | Core contract implemented; SDK adapter planned |
| GitHub adapter | `@flowcordia/workflow` | Validate repository content and preserve reviewed identity before compile or edit | Core contract implemented; GitHub adapter planned |
| `@flowcordia/workflow` | GitHub repository | Produce deterministic JSON for history, review, ownership, and rollback | Serializer implemented; GitHub adapter planned |
| Persisted workflow document | Migration registry | Upgrade older contracts through explicit deterministic steps | Migration runner implemented; version migrations added as needed |
| `@flowcordia/workflow` | Compiler | Produce deterministic Trigger.dev task artifacts from accepted input | Contract implemented; compiler planned |
| GitHub App installation | Organization | Give administrators control of repository access | Existing Trigger.dev foundation |
| Connected GitHub repository | Project | Associate source, branch tracking, and Git metadata with deployments | Existing Trigger.dev foundation |
| GitHub webhook | Deployment adapter | Turn reviewed push or pull-request events into preview/release actions | Gap: receiver path not confirmed |
| Compiler output | Deployment API | Build and version executable workflow artifacts | Existing API; Flowcordia adapter planned |
| Deployment | Background worker | Bind an executable image and task metadata to a version | Existing Trigger.dev foundation |
| Run engine | Supervisor | Dequeue runs and request isolated workloads | Existing Trigger.dev foundation |
| Supervisor | Docker/Kubernetes/compute | Create and manage workload processes | Existing Trigger.dev foundation |
| Runtime events | Observability | Store statuses, traces, logs, metadata, and streams | Existing Trigger.dev foundation |
| Observability | Studio | Display live node progress and diagnostics on the canvas | Planned |
| Environment variable repository | Secret store | Resolve per-environment values without exposing secrets | Existing Trigger.dev foundation |
| Setup status route | Environment schema | Report presence or absence without returning values | Foundation implementation |
| Setup email test | General email client | Verify the configured product-email transport for the signed-in user | Foundation implementation |
| Alert delivery | Alert email client | Keep operational alerts separate from product email | Existing; test action deferred |
| Object storage configuration | Packet/output storage | Store large payloads and outputs outside normal database rows | Existing foundation; live test deferred |
| Pull-request workflows | GitHub-hosted runners | Run required checks without an inherited third-party runner account | Portable default implemented |
| Pull-request workflows | Enterprise runner vars | Route heavy jobs to organization-approved private runners | Optional override implemented |
| Zizmor audit | GitHub job log | Keep workflow security analysis available without Advanced Security | Portable default implemented |
| Zizmor audit | GitHub Security tab | Publish stateful SARIF results when Advanced Security is enabled | Optional explicit integration |
| Manual Testbox workflows | Blacksmith Testbox | Preserve inherited interactive debug sessions until replaced | Explicit non-required exception |

## Connection acceptance checklist

- Authentication and authorization are explicit.
- Inputs and outputs have schemas.
- Secrets and sensitive payloads have a documented boundary.
- Failure, retry, idempotency, and timeout behavior are known.
- Observability identifies both sides of the connection.
- Validation and rollback steps exist.
