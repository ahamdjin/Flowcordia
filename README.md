# FlowCordia

FlowCordia is a Git-native workflow platform for teams that need visual authoring and typed code to remain one governed product.

Business users work in Studio. Developers publish typed functions and runtime configuration in the repository. GitHub owns review and durable history. The inherited Trigger.dev execution plane owns deployments, queues, durable waits, retries, workers, and run observability.

> **Current maturity: internal alpha.** The workflow contracts, control plane, compiler, Studio authoring path, governed multi-workflow proposal lifecycle, typed-function bridge, exact-revision subflows, signed production webhooks, immutable application and bundled-dependency release contracts, protected blank-host and lifecycle harnesses, and the complete connected release campaign are implemented and covered by repository tests. One configured successful protected campaign and reviewed schema `0.6` release dossier are still required before FlowCordia should be described as production-ready.

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
- Immutable self-host release manifests, fail-closed runtime identity, attested no-overwrite application-image publication, and bounded publication evidence.
- An immutable bundled dependency manifest that binds PostgreSQL, Redis, Electric, ClickHouse, MinIO, registry, BusyBox, Docker socket proxy, Trigger.dev supervisor, and S2 to exact `@sha256` references.
- A final supported Compose overlay that refuses to render any bundled dependency without an exact immutable reference.
- A validated single-host production application plane with one release-confirmed migration phase, immutable web and operations roles, real readiness checks, separated config/secrets, and documented upgrade/rollback.
- A published-image `flowcordia doctor` command and optional one-shot diagnostics service with real read-only dependency probes and owner-only no-overwrite support evidence.
- Digest-bound, atomic, no-overwrite schema `0.2` migration completion evidence for every exact release.
- A protected blank-host bundle workflow that verifies official publication and attestation, uses isolated migration/diagnostic/project/network/volume identities, installs the exact application and dependency set, runs diagnostics, and proves complete teardown.
- A protected published-artifact lifecycle harness covering clean install, migration, startup, diagnostics, restart, backup/restore rehearsal, upgrade classification, safe rollback behavior, and teardown with one bounded final artifact.
- A fixed protected connected release controller covering non-maintainer authoring, preview, governed promotion, production discovery/execution, signed webhook lifecycle, governed rollback, rollback production, and schema `0.6` evidence assembly without bypassing stage-specific protected environments.
- Durable audit, outbox, reconciliation, bounded retries, and browser-safe projections.

The detailed coverage table lives in [`flowcordia/product/capability-matrix.md`](flowcordia/product/capability-matrix.md).

## What is not production-ready yet

FlowCordia intentionally does not claim completion where live evidence is missing. The following remain release blockers or later product phases:

- One configured protected connected release campaign on the exact deployed `main` revision, including blank-host bundle proof, published lifecycle proof, non-maintainer Studio authoring, preview execution, human-governed promotion, production execution, signed webhook lifecycle, and governed rollback.
- Independent review and merge of the resulting schema `0.6` ten-source release-evidence pull request.
- A configured protected image publication and real deployment of the exact single-host topology with installation, diagnostics, provider, alert, database recovery, controlled-upgrade, migration, and release-dossier evidence.
- A reproducible supported installation for every inherited Trigger.dev execution-plane service required to execute workflows outside the supported bundled topology.
- Configured successful protected blank-host, restart, upgrade, rollback/recovery-boundary, and teardown runs using published artifacts; the harnesses are implemented but no environment-backed result is preserved yet.
- Exact preview/production installation proof for every workflow in a proposal closure, human approvals, mixed-child parallel control, node-level retry, and realtime streaming.
- Supported high availability, external secret-manager integration, point-in-time recovery, off-site disaster recovery, load/outage evidence, and tested service objectives.
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
| `docker/flowcordia-self-host.yml` | Digest-bound single-host Flowcordia application plane and optional diagnostics service |
| `docker/flowcordia-bundled.yml` | Additive bundled dependency and Trigger.dev supervisor topology |
| `docker/flowcordia-bundled-immutable.yml` | Final supported overlay requiring every bundled dependency by exact digest |
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

The initial supported topology is deliberately single-host and non-HA. Operators may use the external-dependency application plane or the exact bundled dependency set. Both require email delivery, HTTPS ingress, GitHub App configuration, protected credentials, and the inherited Trigger.dev execution boundary.

1. Publish and verify one immutable FlowCordia application image.
2. Select and preserve one ordered bundled dependency manifest when using the bundled path; every reference must end in exact `@sha256` identity.
3. Prepare external config, owner-only secrets, application release manifest, bundled manifest, migration-state, diagnostics-state, and registry-auth paths.
4. Run the applicable self-host and bundled validators before Docker access.
5. Apply the release-confirmed one-shot migration service.
6. Start and wait for operations, web, the exact dependencies, and the supervisor.
7. Run the one-shot diagnostics profile and preserve its bounded schema `0.1` artifact.
8. Run protected bundled blank-host acceptance and preserve the exact bundle/cleanup evidence.
9. Run the protected published self-host lifecycle workflow for the exact current/target publication pair and preserve schema `0.1` lifecycle evidence.
10. Execute the protected connected release campaign and preserve the schema `0.6` ten-source dossier.

Follow [`flowcordia/runbooks/self-host-deployment.md`](flowcordia/runbooks/self-host-deployment.md), [`flowcordia/runbooks/bundled-release-reproducibility.md`](flowcordia/runbooks/bundled-release-reproducibility.md), [`flowcordia/runbooks/self-host-diagnostics.md`](flowcordia/runbooks/self-host-diagnostics.md), [`flowcordia/runbooks/self-host-lifecycle-acceptance.md`](flowcordia/runbooks/self-host-lifecycle-acceptance.md), and [`flowcordia/runbooks/connected-release-campaign.md`](flowcordia/runbooks/connected-release-campaign.md). Do not deploy by mutable image tag or expose the container port directly to the public internet.

## Enabling Studio safely

Studio is default-off for ordinary users.

1. Configure the existing application, database, GitHub App, Trigger.dev runtime, object store, and email/alert providers.
2. Apply controlled migrations and deploy the dedicated FlowCordia operations worker.
3. Run the installation, live dependency, diagnostics, provider, alert, database recovery, controlled-upgrade, and bundled release gates for the exact application revision.
4. Connect a GitHub repository to a project and set its production branch.
5. Keep `FLOWCORDIA_STUDIO_ENABLED=0` globally.
6. Enable the `hasFlowcordiaStudioAccess` organization feature flag for one internal organization.
7. Run the connected acceptance procedure through the protected campaign described in [`flowcordia/runbooks/connected-release-campaign.md`](flowcordia/runbooks/connected-release-campaign.md).

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
