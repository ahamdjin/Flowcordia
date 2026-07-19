# Flowcordia webapp boundary

This folder contains Flowcordia-specific control-plane features that live inside the inherited web application. Server adapters connect portable Flowcordia packages to existing authentication, database, GitHub App, and future runtime services. Each capability has its own folder so UI code cannot accidentally import credentials or persistence details.

## Rules

- Keep Flowcordia modules isolated from run-engine, queue, supervisor, and deployment internals.
- Prefer adapters around existing services over parallel implementations.
- Never return secret values to browser loaders.
- Add a folder README that records upstream and downstream connections for every feature.
- Keep new routes hidden until permissions, direct navigation, and failure behavior are verified.
- Keep route modules under `app/routes/`; routes compose feature services and validate transport input but do not own GitHub tokens or raw SQL.

## Current features

| Folder | Connects | Why |
| --- | --- | --- |
| `setup/` | Safe configuration-presence checks and the general-email connection test | Diagnose self-hosted configuration without disclosing values. |
| `proposals/` | `@flowcordia/control-plane` to Prisma, dashboard RBAC, and the existing GitHub App | Make governed GitHub changes durable and tenant-safe without duplicating platform infrastructure. |
| `workflows/index/` | Connected repository state to a durable workflow index | Discover exact canonical workflow sources without browser-controlled repository coordinates. |
| `workflows/drafts/` | Studio authoring to safe preview, compiler preflight, and proposal publication | Preserve unfinished work while keeping reviewed Git history authoritative. |
| `workflows/studio/` | Browser-safe workflow graph, ownership, configuration, test, diff, and publication controls | Give operators one coherent working surface without exposing credentials or internal identity. |
| `workflows/readiness/` | Server-owned repository scope to the GitHub App, workflow index, Trigger.dev config, and preview setting | Prove rollout prerequisites explicitly without mutating GitHub or executing customer code. |
| `workflows/preview/` | Proposal heads to inherited preview environments, deployments, exact-version runs, and bounded canvas state | Close the first runtime loop without duplicating deployment or execution infrastructure. |
| `workflows/functions/` | Exact-commit repository manifests to browser-safe Studio function nodes | Let developers publish typed code capabilities without transferring source ownership to the visual editor. |

The visible product surfaces are `workflows/studio/` and `proposals/workspace/`. Studio checks connected-repository readiness, publishes deterministic workflow and discoverable Trigger.dev task artifacts into the proposal lifecycle, follows the connected GitHub preview deployment for the exact proposal head, and projects version-locked run state back onto the canvas.
