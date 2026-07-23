# FlowCordia

FlowCordia is a Git-native workflow platform for teams that need visual authoring and typed code to remain one governed product.

Business users work in Studio. Developers publish typed functions and runtime configuration in the repository. GitHub owns review and durable history. The inherited Trigger.dev execution plane owns deployments, queues, durable waits, retries, workers, and run observability.

> **Current maturity: internal alpha.** The workflow contracts, control plane, compiler, Studio authoring path, governed proposal lifecycle, typed-function bridge, signed production webhooks, and operator preflight harnesses are implemented and covered by repository tests. A preserved connected release acceptance record is still required before FlowCordia should be described as production-ready.

## What works today

- Repository-backed workflow discovery from `.flowcordia/workflows/*.json`.
- Durable Studio drafts with optimistic versioning and stale-source protection.
- Visual graph editing for manual, API, schedule, webhook, HTTP, mapping, condition, wait, and output nodes.
- Deterministic compilation to Trigger.dev task source under `trigger/flowcordia/`.
- Governed proposal branches and pull requests tied to an exact base and head.
- Exact-head approvals, checks, policy evidence, and fail-closed promotion.
- Preview-environment handoff through the existing connected GitHub integration.
- Version-locked live runs with proposal, head, worker, and idempotency correlation.
- Repository-owned typed functions declared through `.flowcordia/functions.json`.
- Schema-driven structural and live testing, repository fixtures, and executable validation.
- Write-only HTTP and webhook credentials backed by the existing encrypted environment store.
- Signed public webhook ingress with immutable production binding, replay protection, rate limits, revocation, replacement, and payload-free delivery evidence.
- Guided Studio onboarding, governed starter templates, and repository bootstrap.
- Installation, dependency, provider, alert, database recovery, and controlled-upgrade preflight harnesses.
- Durable audit, outbox, reconciliation, bounded retries, and browser-safe projections.

The detailed coverage table lives in [`flowcordia/product/capability-matrix.md`](flowcordia/product/capability-matrix.md).

## What is not production-ready yet

FlowCordia intentionally does not claim completion where live evidence is missing. The following remain release blockers or later product phases:

- A preserved connected browser → GitHub → preview deployment → execution → promotion → production webhook → revocation/replacement → rollback acceptance record.
- Configured production evidence for installation, provider, alert, database recovery, controlled upgrade, and release-manifest gates.
- Human approvals, subflows, batch and parallel control, node-level retry, and realtime streaming.
- A polished public self-host installation experience and versioned release distribution; public support remains best-effort under [`SUPPORT.md`](SUPPORT.md).
- Supported high availability, point-in-time recovery, off-site disaster recovery, and tested service objectives.
- SSO, SCIM, broader enterprise policy, configurable retention, and external secret-store support.

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
| `packages/flowcordia-github-proposals` | Deterministic proposal branches, pull requests, evidence, and exact-head promotion |
| `packages/flowcordia-control-plane` | Durable proposal state, audit, outbox, reconciliation, webhook binding, and operations ownership |
| `packages/flowcordia-runtime` | Compiler, structural preview, live adapters, webhook signatures, and generated Trigger.dev source |
| `apps/webapp/app/features/flowcordia` | Authenticated Studio, onboarding, proposal, source, validation, credential, webhook, and operator adapters |
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

## Enabling Studio safely

Studio is default-off for ordinary users.

1. Configure the existing application, database, GitHub App, Trigger.dev runtime, object store, and email/alert providers.
2. Apply controlled migrations and deploy the dedicated FlowCordia operations worker.
3. Run the installation, live dependency, provider, alert, database recovery, and controlled-upgrade gates for the exact application revision.
4. Connect a GitHub repository to a project and set its production branch.
5. Keep `FLOWCORDIA_STUDIO_ENABLED=0` globally.
6. Enable the `hasFlowcordiaStudioAccess` organization feature flag for one internal organization.
7. Run the connected acceptance procedure in [`flowcordia/runbooks/release-acceptance.md`](flowcordia/runbooks/release-acceptance.md).

Global Studio access must not be enabled merely because repository CI is green.

## Workflow repository contract

A connected repository may contain:

```text
.flowcordia/
  workflows/
    <workflow-id>.json
  functions.json
trigger/
  flowcordia/
    <generated-workflow>.ts
```

Canonical workflow JSON and generated task source are committed together on the proposal branch. Repository-owned functions remain outside the generated directory and are imported statically from reviewed paths.

## Security, support, and compatibility

- Report vulnerabilities privately through [`SECURITY.md`](SECURITY.md).
- Use [`SUPPORT.md`](SUPPORT.md) for supported issue types and sanitized diagnostics.
- Review the versioned [compatibility policy](flowcordia/product/compatibility-policy.md) before deployment or upgrade.

## Quality rule

A FlowCordia capability is not complete until configuration, validation, serialization, compilation, execution, observability, failure behavior, rollback, documentation, and round-trip tests agree.

Every pull request must remain one reviewable boundary, pass the complete required matrix on its exact final head, document limitations honestly, and leave `main` releasable. PR count is never a substitute for a connected product.

## Upstream and license

FlowCordia is built from the open-source Trigger.dev codebase and preserves its durable execution foundation. Upstream notices and licensing remain authoritative under the repository's Apache 2.0 license.
