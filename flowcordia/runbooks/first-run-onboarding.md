# First-run self-host onboarding

## Purpose

A new self-hosted Flowcordia installation creates its first platform administrator through a focused local account screen. The administrator receives a password and enters guided setup without depending on working email, GitHub OAuth, SSO, or a separate setup code.

## Operator preparation

Keep an unclaimed installation private until the first administrator has been created. The bundled configuration binds the web port to `127.0.0.1` by default; preserve that boundary, use an SSH tunnel, or restrict the reverse proxy to a trusted network during first run.

Do not expose `/setup/owner` to an untrusted public network before claiming the installation. Removing the shared setup code makes the account flow smoother, so network ownership is the installation-owner proof during this short bootstrap window.

## Guided first run

1. Start Flowcordia and open the installation through the trusted local or private connection.
2. An unclaimed self-hosted installation redirects `/login` to `/setup/owner`.
3. Enter the administrator name, email, and a password of at least 15 characters.
4. Flowcordia accepts only a same-origin browser submission and rate-limits attempts through Redis.
5. Flowcordia creates or promotes the first administrator and writes the encrypted password credential inside one serializable PostgreSQL transaction.
6. A PostgreSQL advisory transaction lock ensures competing requests cannot create two first administrators.
7. Flowcordia creates the default `My workspace` organization, `My workflows` project, and runtime environments automatically.
8. The browser receives the normal authenticated session and continues directly to `/setup/first-run`.
9. Flowcordia checks the application URL, PostgreSQL, Redis, ClickHouse, and object storage automatically. Healthy services stay hidden; an unhealthy service shows one recovery action.
10. Configure the installation-owned GitHub App in the focused first-run form. Flowcordia authenticates the App before encrypted storage.
11. Install the GitHub App for the desired GitHub account or organization.
12. Choose one repository. Flowcordia uses its default branch automatically, connects it, and starts synchronization.
13. The page polls transient synchronization state and opens Studio automatically when the repository is ready.

The owner route closes permanently as soon as any platform administrator exists. GitHub, Google, magic-link, password, and SSO authentication cannot create the first user around this boundary.

## What stays outside the critical path

General and alert email configuration are optional during activation. Configure email later before invitations, password recovery, or email notifications are required.

Organization naming, project naming, non-default production branches, complete infrastructure diagnostics, and provider tuning remain available after activation. The old setup hub is available only at `/setup?advanced=1` for administrator troubleshooting; it is not part of a successful first run.

## Recovery

- If automatic workspace creation fails after the administrator is claimed, Flowcordia sends the owner to advanced setup with a bounded workspace recovery state.
- If a required dependency is unhealthy, `/setup/first-run` shows only the failed check and its existing recovery action.
- If synchronization fails, the repository remains connected and the page offers one retry-safe synchronization action.
- If GitHub installation access changes, restore access through GitHub and return to the same first-run route.

## After claiming

The public application may be exposed normally after the administrator account exists and `/setup/owner` redirects permanently to login.

Keep at least one tested administrator recovery path. A local password does not require email delivery, while password reset and user invitations do.
