# Simplified self-host first run

A new self-host owner should reach a usable Flowcordia Studio without understanding the product's internal deployment topology.

## Intended journey

1. Open the new installation.
2. Enter the protected setup token, administrator name, email, and password.
3. Let Flowcordia create the first organization, project, and production environment automatically.
4. Let Flowcordia verify the application URL, PostgreSQL, Redis, ClickHouse, storage, and email transport automatically.
5. Configure the installation-owned GitHub App through one administrator-only form.
6. Install the GitHub App on the desired GitHub account.
7. Choose one repository. Flowcordia uses its default branch during first run.
8. Synchronize automatically and continue directly into Studio.

## Critical-path rules

- Healthy bundled dependencies appear as completed checks; they are not configuration forms.
- An unhealthy dependency presents one precise cause and one recovery action.
- Email transport does not block local owner creation or repository connection. When invitations or notifications require email, Flowcordia explains that capability boundary explicitly.
- Organization and project naming are optional refinements after activation; safe defaults are created during first run.
- Branch selection, infrastructure diagnostics, provider tuning, backup settings, and release evidence stay outside the critical path.
- GitHub App credentials remain encrypted and administrator-only.
- The owner never leaves the guided flow for a generic dashboard or settings page.
- Refresh, synchronize, and retry operations happen automatically where safe and idempotent.

## Completion definition

The successful path is:

`install -> create administrator -> automatic readiness -> configure GitHub App -> install App -> select repository -> synchronize -> Studio`

The final acceptance must use a clean bundled installation and prove password login, repository synchronization, Studio entry, logout, and password login again.

## Isolation

This work may change only self-host onboarding routes, setup orchestration, onboarding-specific services, tests, and documentation. It must not modify Trigger.dev's task-run state machine, queues, workers, checkpoint/resume behavior, deployment engine, SDK execution contracts, or unrelated Studio work.