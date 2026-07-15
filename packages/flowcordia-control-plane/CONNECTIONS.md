# Control-plane connections

| Source | Target | Contract | Why | Failure owner |
| --- | --- | --- | --- | --- |
| Dashboard session/RBAC | Proposal resource route | Organization/project context plus `github` read/write ability | Prevent cross-tenant command execution before scope resolution. | Route returns 403/404 without resolving credentials. |
| Proposal route | Existing connected repository | Organization, project, internal repository, GitHub IDs, active installation, production branch | Establish durable identity from server-owned data. | Scope resolver returns a configuration conflict. |
| GitHub resolvers | Existing `githubApp` installation client | Exact authorized scope | Reuse credential lifecycle and avoid a second token path. | Resolver rechecks binding and fails before GitHub access. |
| `ProposalCommandService` | `GitHubProposalService` | Immutable identity, expected object IDs, actor/correlation | Run governed GitHub mutations only after intent persistence. | Saga records failed/reconciling state. |
| Command transaction | Proposal/audit/outbox tables | Compare-and-swap aggregate plus deduplicated events | Keep product state, evidence, and publication intent atomic. | Prisma adapter rolls back the transaction. |
| GitHub App webhook | Signed receiver | Raw-body HMAC, delivery/event headers, 1 MiB limit | Authenticate external events before parsing. | Receiver rejects and logs safe metadata. |
| Webhook normalizer | Delivery/proposal projection | Installation, repository, PR/head, normalized event, payload hash | Provide low-latency UI state without retaining raw payloads. | Ingestor deduplicates or audits mismatches. |
| Outbox dispatcher | Deployment-selected broker | Leased event with stable dedupe key | Decouple transactions from notification/search consumers. | Worker retries; consumer deduplicates. |
| Proposal projection | Future Studio UI | Tenant-scoped list/cursor and lifecycle state | Translate GitHub mechanics into a normal-user experience. | UI wiring is the next product-facing PR. |

GitHub is the source of merge truth. The durable aggregate is the source of Flowcordia proposal identity. The webhook projection is a cache and never grants promotion authority.
