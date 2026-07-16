# Proposal host binding

| File | Connection | Reason |
| --- | --- | --- |
| `scope.server.ts` | Organization/project to connected GitHub repository and active installation | Build trusted scope from database identity instead of browser coordinates. |
| `github.server.ts` | Existing `githubApp` Octokit to workflow/proposal ports | Reuse installation credentials and recheck binding before each client resolution. |
| `prisma.server.ts` | Control-plane store port to proposal/audit/outbox/delivery/reconciliation tables | Keep transactions, optimistic concurrency, replay identity, and distributed leases in one adapter. |
| `service.server.ts` | Scope, store, and GitHub gateway to command service | Give routes one composition point with no credential handling. |
| `commands.server.ts` | Internal and Studio resource actions to the same command service | Preserve one policy/validation path while selecting an internal or browser-safe response contract. |
| `worker/` | Signed event publisher and read-only GitHub reconciliation to a standalone lifecycle | Recover durable operations without joining or changing Trigger.dev's inherited worker fleets. |
| `workspace/` | Durable proposal projection to the native dashboard shell | Let normal users inspect and advance governed GitHub proposals without receiving internal scope or credentials. |

The established authenticated resource route accepts list/create/submit/promote and keeps its response contract. The Studio resource accepts submit/promote through the same command implementation but returns a minimal acknowledgement. The webhook route is authenticated only by the GitHub App signature. The workspace and operations worker are independently default-off. None of these paths executes workflows or creates deployments.
