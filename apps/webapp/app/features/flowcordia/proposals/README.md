# Proposal host binding

| File | Connection | Reason |
| --- | --- | --- |
| `scope.server.ts` | Organization/project to connected GitHub repository and active installation | Build trusted scope from database identity instead of browser coordinates. |
| `github.server.ts` | Existing `githubApp` Octokit to workflow/proposal ports | Reuse installation credentials and recheck binding before each client resolution. |
| `prisma.server.ts` | Control-plane store port to proposal/audit/outbox/delivery tables | Keep transactions, optimistic concurrency, replay identity, and leases in one adapter. |
| `service.server.ts` | Scope, store, and GitHub gateway to command service | Give routes one composition point with no credential handling. |

The authenticated resource route accepts create/submit/promote commands. The webhook route is authenticated only by the GitHub App signature. Neither route executes workflows or creates deployments.
