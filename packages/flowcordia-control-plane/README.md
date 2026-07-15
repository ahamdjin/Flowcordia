# `@flowcordia/control-plane`

`@flowcordia/control-plane` is the durable orchestration boundary between Flowcordia's authenticated product API and governed GitHub proposals. It stores immutable tenant/repository identity before a remote mutation, applies optimistic state transitions, records an append-only audit event and transactional outbox event together, and projects verified GitHub webhooks without treating them as promotion authority.

## Guarantees

- Proposal identity is scoped by organization, project, GitHub installation, internal repository ID, and GitHub repository ID.
- A proposal ID cannot be rebound to a different workflow, base commit/blob, repository, or creator identity.
- Every GitHub operation has a durable requested event before the remote call.
- Successful receipts update the aggregate and append audit/outbox events in one transaction.
- Ambiguous or retryable remote mutations enter `RECONCILING`; they are not blindly repeated.
- Updates use a version compare-and-swap so competing commands fail explicitly.
- Webhook deliveries are deduplicated by GitHub delivery ID and payload hash.
- Stale pull-request events cannot overwrite a newer projection.
- Outbox delivery is at least once, using expiring leases and token-guarded acknowledgement.

## Directory map

| Path | Responsibility | Why it is separate |
| --- | --- | --- |
| `src/aggregate/` | Proposal identity, validation, and state transitions | Keeps lifecycle invariants pure and reviewable. |
| `src/repository/` | Persistence/concurrency error vocabulary | Prevents database details from leaking into commands. |
| `src/webhook/` | Strict GitHub event normalization and replay-safe projection | Keeps untrusted external payloads outside the aggregate API. |
| `src/outbox/` | Lease, publish, acknowledge, and retry orchestration | Lets deployments choose a broker without changing transaction semantics. |
| `src/service.ts` | Create, submit, and promote saga coordinator | Makes pre-call intent and post-call receipt ordering explicit. |
| `src/types.ts` | Database, gateway, command, and event ports | Keeps this package portable and free of Remix/Prisma credentials. |
| `test/` | In-memory contract tests for transitions, replays, leases, and races | Locks down behavior before infrastructure adapters are involved. |

## Host binding

The production adapter is under `apps/webapp/app/features/flowcordia/proposals/`:

- `scope.server.ts` resolves the existing organization/project/repository/installation binding;
- `github.server.ts` creates both GitHub clients from the existing installation Octokit factory and rechecks the binding on every resolution;
- `prisma.server.ts` maps the ports to the new durable tables and claims outbox rows with `FOR UPDATE SKIP LOCKED`;
- `service.server.ts` composes the package without exposing credentials to route code.

The authenticated internal API is `resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.proposals`. The signed webhook receiver is `webhooks.flowcordia.github`.

## Commands

```sh
pnpm --filter @flowcordia/control-plane typecheck
pnpm --filter @flowcordia/control-plane test --run
```

See [SECURITY.md](./SECURITY.md), [OPERATIONS.md](./OPERATIONS.md), and [CONNECTIONS.md](./CONNECTIONS.md) before adding a new adapter or state transition.
