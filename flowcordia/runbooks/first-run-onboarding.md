# First-run self-host onboarding

## Purpose

A new self-hosted Flowcordia installation must be claimed before ordinary login methods can create or authenticate users. The claim creates the first platform administrator and a local password without depending on working email, GitHub OAuth, or SSO.

## Operator preparation

Set `FLOWCORDIA_SETUP_TOKEN` in the protected application secrets before starting Flowcordia. Use a cryptographically random value of at least 32 characters. The bundled secret generator creates this value automatically in `deployment.secrets`.

The product calls this value the **one-time installation code**. Do not place it in public configuration, command history, screenshots, support artifacts, URLs, or browser bookmarks.

## Guided first run

1. Start Flowcordia and open its public HTTPS application URL.
2. An unclaimed self-hosted installation redirects `/login` to `/setup/owner`.
3. Enter the one-time installation code, administrator name, administrator email, and a password of at least 15 characters.
4. Flowcordia verifies the code in constant time and rate-limits attempts through Redis.
5. Flowcordia creates or promotes the first administrator and writes the encrypted password credential inside one serializable PostgreSQL transaction.
6. Flowcordia creates the default `My workspace` organization, `My workflows` project, and runtime environments automatically.
7. The browser receives the normal authenticated session and continues directly to `/setup/first-run`.
8. Flowcordia checks the application URL, PostgreSQL, Redis, ClickHouse, and object storage automatically. Healthy services stay hidden; an unhealthy service shows one recovery action.
9. Configure the installation-owned GitHub App in the focused first-run form. Flowcordia authenticates the App before encrypted storage.
10. Install the GitHub App for the desired GitHub account or organization.
11. Choose one repository. Flowcordia uses its default branch automatically, connects it, and starts synchronization.
12. The page polls transient synchronization state and opens Studio automatically when the repository is ready.

The claim route closes permanently as soon as any platform administrator exists. GitHub, Google, magic-link, password, and SSO authentication cannot create the first user around this boundary.

## What stays outside the critical path

General and alert email configuration are optional during activation. Configure email later before invitations, password recovery, or email notifications are required.

Organization naming, project naming, non-default production branches, complete infrastructure diagnostics, and provider tuning remain available after activation. The old setup hub is available only at `/setup?advanced=1` for administrator troubleshooting; it is not part of a successful first run.

## Recovery

- If automatic workspace creation fails after the administrator is claimed, Flowcordia sends the owner to advanced setup with a bounded workspace recovery state.
- If a required dependency is unhealthy, `/setup/first-run` shows only the failed check and its existing recovery action.
- If synchronization fails, the repository remains connected and the page offers one retry-safe synchronization action.
- If GitHub installation access changes, restore access through GitHub and return to the same first-run route.

## After claiming

Remove or rotate `FLOWCORDIA_SETUP_TOKEN` in the protected deployment secrets and restart the web process. The original code is no longer accepted after the installation has an administrator, but removing it reduces unnecessary secret lifetime.

Keep at least one tested administrator recovery path. A local password does not require email delivery, while password reset and user invitations do.
