# Flowcordia proposal operations worker

This folder is the only webapp composition point for proposal outbox delivery and read-only GitHub reconciliation. It is separate from command routes and webhook ingestion so every deployment can scale and gate it independently.

## Connections

| File | Connects to | Why |
| --- | --- | --- |
| `lifecycle.server.ts` | `entry.server.tsx`, `signals.server.ts` | Starts only when explicitly enabled and registers graceful shutdown before the first cycle. |
| `runtime.server.ts` | control-plane worker, Prisma store, logger | Composes portable services without registering anything in Trigger.dev's existing queues. |
| `github-reconciliation.server.ts` | GitHub App, workflow store, proposal client | Performs installation-authenticated reads and re-checks the current tenant/project/repository binding before accepting proof. |
| `config.server.ts` | validated environment | Keeps deployment tuning and secret access out of domain services. |

The worker never imports `services/worker.server.ts`, `v3/commonWorker.server.ts`, the run engine, the queue catalog, or the supervisor. Its only application bootstrap change is one gated call in `entry.server.tsx`; `FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0` is therefore a complete runtime rollback.
