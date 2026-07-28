# First-run self-host onboarding

## Purpose

A new self-hosted Flowcordia installation must be claimed before ordinary login methods can create or authenticate users. The claim creates the first platform administrator and a local password without depending on working email, GitHub OAuth, or SSO.

## Operator preparation

Set `FLOWCORDIA_SETUP_TOKEN` in the protected application secrets before starting Flowcordia. Use a cryptographically random value of at least 32 characters. The bundled secret generator creates this value automatically in `deployment.secrets`.

Do not place the token in the public configuration file, command history, screenshots, support artifacts, URLs, or browser bookmarks.

## Claim the installation

1. Start Flowcordia and open its public HTTPS application URL.
2. An unclaimed self-hosted installation redirects `/login` to `/setup/owner`.
3. Enter the one-time setup token, administrator name, administrator email, and a password of at least 15 characters.
4. Flowcordia verifies the token in constant time and rate-limits attempts through Redis.
5. Flowcordia creates or promotes the first administrator and writes the encrypted password credential inside one serializable PostgreSQL transaction.
6. The browser receives the normal authenticated session and continues to `/setup`.

The claim route closes permanently as soon as any platform administrator exists. GitHub, Google, magic-link, password, and SSO authentication cannot create the first user around this boundary.

## Continue setup

The `/setup` hub guides the owner to:

1. create the first organization;
2. create the first project and runtime environments;
3. review platform readiness;
4. configure email and the GitHub App;
5. install the GitHub App and connect the first repository;
6. synchronize or create the first workflow and deploy it.

Provider configuration, connected infrastructure checks, repository onboarding, and clean-install acceptance are delivered in their own bounded changes so each security and recovery boundary can be validated independently.

## After claiming

Remove or rotate `FLOWCORDIA_SETUP_TOKEN` in the protected deployment secrets and restart the web process. The original token is no longer accepted after the installation has an administrator, but removing it reduces unnecessary secret lifetime.

Keep at least one tested administrator recovery path. A local password does not require email delivery, while password reset and user invitations do.
