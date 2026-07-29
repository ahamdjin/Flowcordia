# Hosted onboarding simplification

The hosted customer path is intentionally separate from self-host installation administration.

## Customer journey

A first hosted user should complete only these product decisions:

1. Name the workspace and first project on one screen.
2. Authorize Flowcordia's platform-owned GitHub App.
3. Choose the repository and production branch.
4. Continue directly into Flowcordia Studio.

Additional projects ask only for a project name before using the same project-scoped GitHub setup.

## Hidden operator concerns

Hosted customers must not configure or inspect:

- the installation owner;
- PostgreSQL, Redis, ClickHouse, object storage, or internal service readiness;
- email transport credentials or live transport tests;
- the GitHub App ID, slug, private key, or webhook secret;
- self-host recovery and release evidence.

Those remain self-host or platform-operator responsibilities. A hosted GitHub App outage is presented as a platform problem rather than asking the customer to create an App.

## Product rule

Survey data such as company size, company URL, technologies, and goals cannot block activation. Collect it later only when it clearly benefits the user.
