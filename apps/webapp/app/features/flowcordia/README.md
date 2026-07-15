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

The workflow Studio will receive its own folder after the durable proposal API is accepted; this PR intentionally adds no visible navigation.
