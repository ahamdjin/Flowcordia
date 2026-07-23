# Support

FlowCordia is currently **internal alpha** open-source software. Community feedback is welcome, but no uptime, response-time, remediation-time, upgrade, compatibility, or professional-support service-level agreement is provided.

## Where to ask

Use GitHub issues for:

- reproducible FlowCordia product defects;
- installation or upgrade failures on a documented supported path;
- documentation corrections;
- bounded feature requests with a concrete user or operator outcome.

Search existing issues before opening a new one. Keep one problem or proposal per issue.

Security vulnerabilities must follow [`SECURITY.md`](SECURITY.md). Never publish credentials, browser state, HMAC secrets, environment values, production payloads, customer data, database archives, private repository content, internal identifiers, or provider responses in an issue.

## Information required for defects

Provide only sanitized information:

- exact FlowCordia application commit or release identifier;
- deployment mode and operating environment;
- Node.js, pnpm, PostgreSQL, Docker, Kubernetes, and browser versions when relevant;
- the documented command, workflow, or UI journey being followed;
- expected and observed bounded behavior;
- minimal synthetic reproduction steps;
- names of failing checks and fixed error codes or redacted messages;
- confirmation that the issue reproduces without private data.

Logs must be reviewed and redacted before attachment. Prefer the bounded evidence produced by FlowCordia's preflight and acceptance tools over raw service logs.

## Supported boundary

During internal alpha, maintainers prioritize:

- the latest maintained `main` revision and active release candidates;
- the documented FlowCordia workflow schema and first-party node catalog;
- the inherited Trigger.dev execution foundation used without unsupported core modifications;
- the documented installation, live-dependency, recovery, upgrade, provider, alert, connected-acceptance, webhook, and release-evidence paths;
- exact versions declared by the repository lockfile, runtime configuration, and release documentation.

Best-effort help may be offered for other environments, but support is not implied for:

- old commits, abandoned branches, or unreviewed forks;
- custom database migrations or modified generated workflow artifacts;
- unsupported Node.js, PostgreSQL, container, browser, or provider versions;
- disabled authorization, secret, protected-environment, recovery, or release gates;
- third-party node packages, custom infrastructure, or external provider behavior outside FlowCordia's documented adapter boundary;
- high availability, point-in-time recovery, regional failover, or service objectives not yet published as supported.

## Maintainer decisions

An issue may be closed when it lacks a safe reproduction, belongs to an upstream project or external provider, depends on unsupported modifications, duplicates an existing issue, or requests a guarantee outside the current maturity level.

A merged pull request, passing repository CI, or implemented contract does not by itself establish production support. Supported claims require the release evidence and compatibility policy applicable to the published release.
