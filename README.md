# FlowCordia

FlowCordia is a Git-native workflow platform for teams that need visual authoring and typed code to remain one governed product.

Business users work in Studio. Developers publish typed functions and runtime configuration in the repository. GitHub owns review and durable history. The inherited Trigger.dev execution plane owns deployments, queues, durable waits, retries, workers, and run observability.

> **Current maturity: internal alpha.** The workflow contracts, control plane, compiler, Studio authoring path, governed multi-workflow proposal lifecycle, typed-function bridge, exact-revision subflows, signed production webhooks, release evidence, self-host application-plane contracts, and bounded published-image diagnostics are implemented and covered by repository tests. A preserved connected production release record is still required before FlowCordia should be described as production-ready.

## What works today

- Repository-backed workflow discovery from `.flowcordia/workflows/*.json`.
- Durable Studio drafts with optimistic versioning and stale-source protection.
- Visual graph editing for manual, API, schedule, webhook, HTTP, mapping, condition, wait, subflow, bounded batch, and output nodes.
- Deterministic compilation to Trigger.dev task source under `trigger/flowcordia/`.
- Governed proposal branches and pull requests tied to an exact base and head.
- Immutable root-to-leaf proposal manifests that bind every reachable workflow and generated artifact before review opens.
- Exact-head approvals, checks, policy evidence, and fail-closed promotion.
- Preview-environment handoff through the existing connected GitHub integration.
- Version-locked live runs with proposal, head, worker, and idempotency correlation.
- Repository-owned typed functions declared through `.flowcordia/functions.json`.
- Schema-driven structural and live testing, repository fixtures, and executable validation.
- Exact-revision subflow dependency graphs with cycle prevention, server-bound callable input/output contracts, and bounded same-child batch fan-out.
- Write-only HTTP and webhook credentials backed by the existing encrypted environment store.
- Signed public webhook ingress with immutable production binding, replay protection, rate limits, revocation, replacement, and payload-free delivery evidence.
- Guided Studio onboarding, governed starter templates, and repository bootstrap.
- Installation, dependency, provider, alert, database recovery, controlled-upgrade, and release-candidate gates.
- Immutable self-host release manifests, fail-closed runtime identity, attested no-overwrite image publication, and bounded publication evidence.
- A validated single-host production application plane with one release-confirmed migration phase, immutable web and operations roles, real readiness checks, separated config/secrets, and documented upgrade/rollback.
- A published-image `flowcordia doctor` command and optional one-shot diagnostics service with real read-only dependency probes and owner-only no-overwrite support evidence.
- Digest-bound, atomic, no-overwrite schema `0.2` migration completion evidence for every exact release.
- A protected published-artifact lifecycle harness covering clean install, migration, startup, diagnostics, restart, backup/restore rehearsal, upgrade classification, safe rollback behavior, and teardown with one bounded final artifact.
- Durable audit, outbox, reconciliation, bounded retries, and browser-safe projections.

The detailed coverage table lives in [`flowcordia/product/capability-matrix.md`](flowcordia/product/capability-matrix.md).

## What is not production-ready yet

FlowCordia intentionally does not claim completion where live evidence is missing. The following remain release blockers or later product phases:

- A preserved connected browser → GitHub → preview deployment → execution → promotion → production webhook → revocation/replacement → rollback acceptance record.
- A configured protected image publication and real deployment of the exact single-host topology with installation, diagnostics, provider, alert, database recovery, controlled-upgrade, migration, and release-dossier evidence.
- A reproducible supported installation for the inherited Trigger.dev execution-plane services required to execute workflows.
- A configured successful protected clean-install, restart, upgrade, rollback/recovery-boundary, and teardown run using published artifacts; the harness is implemented but no environment-backed result is preserved yet.
- Exact preview/production installation proof for every workflow in a proposal closure, human approvals, mixed-child parallel control, node-level retry, and realtime streaming.
- Supported high availability, external secret-manager integration, point-in-time recovery, off-site disaster recovery, and tested service objectives.
- SSO, SCIM, broader enterprise policy, configurable retention, and production support commitments.

See [`flowcordia/product/release-readiness.md`](flowcordia/product/release-readiness.md) for the release gates.

## Architecture

```text
Studio and business UI
        │
        ▼
Portable workflow model + deterministic compiler
        │
        ├──────────────► governed GitHub branch and pull request
        │                         │
        │                         ▼
        │                 exact-head review and policy
        │                         │
        ▼                         ▼
Trigger.dev execution plane ◄── deployment and promotion
        │
        ▼
Runs, traces, logs, and bounded canvas evidence
```

The execution foundation remains Trigger.dev unless an explicit architecture decision replaces a subsystem. FlowCordia does not duplicate the run engine, queue, supervisor, deployment lifecycle, or credential system.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `packages/flowcordia-workflow` | Portable workflow, node-package, webhook, credential, and typed-function contracts |
| `packages/flowcordia-github-workflows` | Installation-scoped exact-commit workflow and function-catalog storage |
| `packages/flowcordia-github-proposals` | Deterministic proposal branches, immutable workflow closures, pull requests, evidence, and exact-head promotion |
| `packages/flowcordia-control-plane` | Durable proposal state, audit, outbox, reconciliation, webhook binding, and operations ownership |
| `packages/flowcordia-runtime` | Compiler, structural preview, live adapters, webhook signatures, and generated Trigger.dev source |
| `apps/webapp/app/features/flowcordia` | Authenticated Studio, onboarding, proposal, source, validation, credential, webhook, and operator adapters |
| `docker/flowcordia-self-host.yml` | Initial digest-bound single-host Flowcordia application plane and optional diagnostics service |
| `docker/scripts/flowcordia-doctor.mjs` | Published-image bounded installation diagnostics and support evidence |
| `flowcordia` | Product contracts, architecture, connection registry, security boundaries, tests, and runbooks |

Start with the [`FlowCordia engineering index`](flowcordia/README.md).

## Local development

FlowCordia currently develops inside the inherited Trigger.dev monorepo.

Requirements:

- Node.js `20.20.2`
- pnpm `10.33.2`
- Docker for database-backed and end-to-end suites

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:packages
pnpm run test:webapp
pnpm run build --filter webapp
```

For the complete inherited development environment, follow [`CONTRIBUTING.md`](CONTRIBUTING.md). FlowCordia-specific changes must also follow [`flowcordia/CONTRIBUTING.md`](flowcordia/CONTRIBUTING.md).

## Self-host application plane

The initial supported application topology is deliberately single-host and non-HA. It requires external PostgreSQL, Redis, ClickHouse, Electric, S3-compatible object storage, email delivery, HTTPS ingress, and the inherited Trigger.dev execution plane.

1. Publish and verify one immutable release image.
2. Prepare external config, owner-only secrets, release manifest, migration-state, and diagnostics-state paths.
3. Run `pnpm flowcordia:self-host:validate`.
4. Apply the release-confirmed one-shot migration service.
5. Start and wait for operations, then web.
6. Run the one-shot diagnostics profile and preserve its bounded schema `0.1` artifact.
7. Run the protected published self-host lifecycle workflow for the exact current/target publication pair and preserve schema `0.1` lifecycle evidence.
8. Execute protected connected acceptance and preserve the schema `0.5` dossier.

Follow [`flowcordia/runbooks/self-host-deployment.md`](flowcordia/runbooks/self-host-deployment.md) and [`flowcordia/runbooks/self-host-diagnostics.md`](flowcordia/runbooks/self-host-diagnostics.md), and [`flowcordia/runbooks/self-host-lifecycle-acceptance.md`](flowcordia/runbooks/self-host-lifecycle-acceptance.md). Do not deploy by mutable image tag or expose the container port directly to the public internet.

## Enabling Studio safely

Studio is default-off for ordinary users.

1. Configure the existing application, database, GitHub App, Trigger.dev runtime, object store, and email/alert providers.
2. Apply controlled migrations and deploy the dedicated FlowCordia operations worker.
3. Run the installation, live dependency, diagnostics, provider, alert, database recovery, and controlled-upgrade gates for the exact application revision.
4. Connect a GitHub repository to a project and set its production branch.
5. Keep `FLOWCORDIA_STUDIO_ENABLED=0` globally.
6. Enable the `hasFlowcordiaStudioAccess` organization feature flag for one internal organization.
7. Run the connected acceptance procedure in [`flowcordia/runbooks/release-acceptance.md`](flowcordia/runbooks/release-acceptance.md).

Global Studio access must not be enabled merely because repository CI, container health, or a single diagnostics artifact is green.

## Workflow repository contract

A connected repository may contain:

```text
.flowcordia/
  workflows/
    <workflow-id>.json
  proposals/
    <proposal-id>.json
  functions.json
trigger/
  flowcordia/
    <generated-workflow>.ts
```

Canonical workflow JSON and generated task source are committed together on the proposal branch. When subflows are reachable, the proposal manifest locks the exact root-to-leaf workflow and artifact closure before the draft pull request opens. Repository-owned functions remain outside the generated directory and are imported statically from reviewed paths.

## Security, support, and compatibility

- Report vulnerabilities privately through [`SECURITY.md`](SECURITY.md).
- Use [`SUPPORT.md`](SUPPORT.md) for supported issue types and sanitized diagnostics.
- Review the versioned [compatibility policy](flowcordia/product/compatibility-policy.md) before deployment or upgrade.

## Quality rule

A FlowCordia capability is not complete until configuration, validation, serialization, compilation, execution, observability, failure behavior, rollback, documentation, and round-trip tests agree.

Every pull request must remain one reviewable product outcome, pass the complete required matrix on its exact final head, document limitations honestly, and leave `main` releasable. PR count is never a substitute for a connected product.

## Upstream and license

FlowCordia is built from the open-source Trigger.dev codebase and preserves its durable execution foundation. Upstream notices and licensing remain authoritative under the repository's Apache 2.0 license.
