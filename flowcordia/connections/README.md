# Connection registry

This file records where Flowcordia components connect and why each connection exists. Update it whenever a component, direction, or owner changes.

| Source | Target | Why the connection exists | Current state |
| --- | --- | --- | --- |
| Studio | `@flowcordia/workflow` | Convert visual intent into a portable validated contract | Durable visual editing and ownership enforcement implemented |
| Repository function manifest | `@flowcordia/workflow` | Declare typed developer-owned exports using a portable strict contract | Version `0.1` catalog, schema, validation, and example implemented |
| GitHub function catalog reader | Studio | Read `.flowcordia/functions.json` at the workflow's exact commit and expose a bounded visual catalog | Exact-commit installation-scoped read and browser-safe projection implemented |
| Studio function-node command | GitHub function catalog reader | Resolve a browser-selected function ID at the durable draft base commit | Server-owned definition resolution and developer-owned node creation implemented |
| Studio structured node editor | Durable draft command | Convert documented visual fields into one exact `set_node_configuration` command without raw JSON or lossy fallback | Forms delivered for every currently supported visual operation; unknown keys and unsupported values fail closed |
| Studio execution policy editor | Trigger-owned runtime policy | Edit queue, machine, duration, and bounded whole-run retry through one strict `set_node_runtime` command | Delivered for visual triggers; concurrency keys and node-scoped policy fail closed |
| TypeScript SDK | `@flowcordia/workflow` | Expose code-authored capabilities to the same workflow identity | Core contract implemented; SDK adapter planned |
| `@flowcordia/github-workflows` | `@flowcordia/workflow` | Validate, migrate, preserve identity, and serialize repository content | Workflow storage integration implemented |
| `@flowcordia/workflow` | GitHub repository | Produce deterministic JSON for history, review, ownership, and rollback | Installation-scoped storage and governed PR proposal layer implemented |
| `@flowcordia/github-proposals` | `@flowcordia/github-workflows` | Store validated content on a deterministic proposal branch with expected-blob concurrency | Proposal lifecycle and webapp binding implemented |
| `@flowcordia/control-plane` | Durable proposal/audit/outbox tables | Reserve immutable tenant/repository identity and record each transition atomically | Prisma schema, migration, and adapter implemented |
| Proposal resource route | Dashboard RBAC and connected GitHub repository | Authorize project actions and derive installation/repository scope from server-owned data | Internal list/create/submit/promote API implemented |
| Flowcordia side menu and workspace loader | Organization feature flags and dashboard RBAC | Roll out the visible Studio surface by cohort and recheck direct navigation server-side | Default-off proposal workspace implemented |
| Proposal workspace loader | Durable proposal store and connected repository scope | Render bounded lifecycle pages without exposing tenant, installation, database, actor, or correlation identity | Browser-safe read projection implemented |
| Proposal workspace command resource | Shared proposal command implementation | Reuse exact-head and policy enforcement while returning only a minimal browser acknowledgement | Submit/promote UI boundary implemented; internal API response unchanged |
| Proposal workspace loader | Durable proposal governance, GitHub snapshot, and function-validation read model | Explain independent exact-head policy evidence for the selected proposal | Connected with fail-closed blocked, pending, and unavailable states |
| Studio governance panel | Authorized governance resource command | Let repository writers create or monotonically strengthen a versioned repository policy | Connected; weakening is rejected server-side and every write is audited |
| Promotion command | Governance policy-selection audit | Bind proposal, exact head, actor, request correlation, policy version, and digest before fresh GitHub evaluation | Connected with idempotent identical-request handling and concurrent-policy rejection |
| Studio readiness panel | Authorized repository-readiness command | Run a manual prerequisite probe without adding GitHub calls to every Studio loader | Exact command, GitHub read permission, and Studio feature access enforced |
| Repository-readiness command | GitHub App installation | Verify exact installation identity plus contents-write, pull-request-write, and checks-read permissions | Read-only installation-scoped probe implemented |
| Repository-readiness command | Production branch and workflow tree | Prove the configured branch, immutable head, and canonical workflow paths | Bounded non-truncated exact-head discovery implemented |
| Repository-readiness command | Durable workflow index | Require an IDLE, exact-head, fully valid index before rollout | Exact source/index comparison implemented |
| Repository-readiness command | `trigger.config.ts` | Prove generated tasks can be discovered under `trigger/flowcordia` | Bounded UTF-8 read plus default/static `dirs` inspection implemented |
| Repository-readiness command | Connected repository preview setting | Make disabled preview deployments an explicit rollout blocker | Read-only exact-binding check implemented |
| Studio testing panel | Durable draft command | Submit one schema-driven structural preview against the exact active draft version | Single browser owner implemented; stale draft, index movement, load failure, and missing write permission disable submission |
| Studio testing panel | Exact-head live-run command | Start one version-locked preview run from the same schema-driven payload surface | Single browser owner implemented; ready deployment, exact proposal head, and task-trigger permission are required |
| Studio canvas | Preview read model | Poll active deployment/run state and project trusted node evidence independently of command submission | Five-second active-only polling and bounded exact-run projection remain canvas-owned |
| `@flowcordia/github-proposals` | GitHub pull requests | Create/resume drafts, read reviews/checks, submit, and merge an exact reviewed head | Proposal lifecycle and Octokit port implemented |
| Proposal policy evaluator | GitHub PR snapshot | Enforce current-head approvals, reviewer rules, checks, and mergeability blockers | Pure policy contract enforced; workspace exposes bounded blocker state |
| Persisted workflow document | Migration registry | Upgrade older contracts through explicit deterministic steps | Migration runner implemented; version migrations added as needed |
| `@flowcordia/workflow` | `@flowcordia/runtime` | Validate topology/configuration and produce deterministic Trigger.dev task artifacts | Compiler, dry-run executor, and live adapter implemented |
| Studio draft command | Proposal control plane | Publish one exact tested draft version into an idempotent governed proposal | Implemented with server-owned proposal identity and compiler preflight |
| `@flowcordia/github-proposals` | Generated artifact store | Commit deterministic Trigger.dev task source beside the canonical workflow on the proposal branch | Implemented; both artifacts share PR review and promotion |
| Generated Trigger.dev task | Runtime adapters | Execute HTTP, durable waits, conditions, code references, and outputs | Implemented with explicit egress allowlist, environment-bound header credentials, and static code imports |
| Generated schedule task | Trigger.dev declarative schedule sync | Bind reviewed cron/timezone configuration to the promoted workflow task | Production-only binding implemented; preview deployments discover the task without activating the schedule |
| Generated API-triggered task | Authenticated task trigger API | Receive JSON through the deployed task's deterministic endpoint | Implemented through the inherited project access-token authentication, task RBAC, payload limit, and idempotency boundaries |
| Trigger-owned workflow retry policy | Generated Trigger.dev task | Apply bounded, jittered retry to an uncaught whole-workflow failure | Implemented for whole-run retry; node-level retry is rejected until an independent durable boundary exists |
| Trigger-owned execution policy | Generated Trigger.dev task | Bind reviewed queue, machine, and maximum duration to the one durable workflow task | Implemented with fail-closed queue/preset/duration validation; node-scoped policy and invocation-time concurrency keys are rejected |
| Proposal publication | Preview branch environment | Prepare the deterministic proposal branch using inherited branch limits, API-key creation, and billing behavior before GitHub mutation | Implemented through `UpsertBranchService`; disabled/unavailable preview does not bypass proposal governance |
| Connected GitHub pull request | Preview deployment | Build the exact proposal head using the project's existing GitHub integration and build settings | Implemented integration handoff; Flowcordia never inserts deployment records |
| Exact-head preview deployment | Studio live-run command | Start the generated Flowcordia task on the deployment's worker version | Implemented through inherited `TriggerTaskService` with server-rechecked scope, task RBAC, proposal/head seed identity, and request idempotency |
| Flowcordia run metadata | Studio canvas | Project bounded node operation/status and correlated rollout proof while excluding payloads, outputs, credentials, internal IDs, generic metadata, and raw errors | Exact proposal/head/idempotency namespace and worker lock are rechecked; five-second polling runs only while state is active |
| GitHub App installation | Flowcordia workflow/proposal client resolvers | Reuse installation credentials only after tenant/project/repository authorization | Existing Octokit factory reused; binding rechecked per resolution |
| GitHub App installation | Organization | Give administrators control of repository access | Existing Trigger.dev foundation |
| Connected GitHub repository | Project | Associate source, branch tracking, and Git metadata with deployments | Existing Trigger.dev foundation |
| GitHub workflow mutation | Durable audit outbox | Persist actor, correlation, installation, path, blob, and commit identity | Proposal-level requested/completed events persisted; workflow event expansion planned |
| GitHub proposal mutation | Durable proposal aggregate and audit outbox | Persist lifecycle intent, PR/head/merge identity, result, and reconciliation state | Durable saga and transactional outbox implemented |
| GitHub proposal webhooks | Proposal projection | Maintain PR/head/check observation without repository-wide polling | Signed receiver, delivery dedupe, and projector implemented |
| Flowcordia outbox | Operator HTTPS event endpoint/consumers | Publish canonical HMAC-signed, dedupe-keyed lifecycle events outside database transactions | Default-off leased operations worker implemented |
| Proposal reconciliation schedule | GitHub App read clients | Prove branch, PR identity, state, and canonical workflow digest without repeating ambiguous mutations | Distributed bounded reconciliation worker implemented |
| Webapp entry lifecycle | Flowcordia operations worker | Start and stop an independently gated loop without registering in legacy/common/run-engine queues | Additive default-off bootstrap implemented |
| GitHub webhook | Project workflow index | Maintain fast enterprise discovery without repository-wide scans | Verified push receiver, replay protection, and exact-commit sync scheduling implemented |
| GitHub webhook | Deployment adapter | Turn reviewed push or pull-request events into preview/release actions | Existing connected integration handoff implemented; authenticated rollout acceptance remains required |
| Compiler output | Trigger.dev task discovery | Build and version executable workflow artifacts | Generated source is stored under `trigger/flowcordia`; explicit config `dirs` must include that directory or its parent |
| Deployment | Background worker | Bind an executable image and task metadata to a version | Existing Trigger.dev foundation |
| Run engine | Supervisor | Dequeue runs and request isolated workloads | Existing Trigger.dev foundation |
| Supervisor | Docker/Kubernetes/compute | Create and manage workload processes | Existing Trigger.dev foundation |
| Runtime events | Observability | Store statuses, traces, logs, metadata, and streams | Existing Trigger.dev foundation |
| Observability | Studio | Display live node progress on the canvas without browser exposure of raw diagnostics | Bounded exact-run projection implemented; inherited Realtime transport remains later |
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
