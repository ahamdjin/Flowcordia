# Security Policy

FlowCordia handles workflow definitions, repository access, runtime credentials, public webhook ingress, and production execution. Please report suspected vulnerabilities privately and avoid testing against systems you do not own or have explicit permission to assess.

## Supported versions

FlowCordia is currently **internal alpha**. Security fixes are made on the latest maintained `main` revision and, when published, the latest supported release candidate. Older commits, unreviewed branches, third-party forks, and modified deployment images are not supported unless a release notice explicitly says otherwise.

No security response or remediation service-level agreement is offered during internal alpha.

## Report a vulnerability

Use GitHub's private **Report a vulnerability** action in this repository's **Security** tab. Do not publish exploit details, credentials, payloads, customer data, internal identifiers, or proof-of-concept code in a public issue, pull request, discussion, or commit.

When private vulnerability reporting is unavailable, open a public issue titled **Private security contact requested** containing no technical details. A maintainer can then establish a private reporting path.

Include, when safely available:

- the affected FlowCordia commit, release, deployment mode, and component;
- the security impact and conditions required to reproduce it;
- bounded reproduction steps using synthetic data;
- whether secrets, repository authority, tenant isolation, workflow execution, webhook authenticity, or evidence integrity are affected;
- any temporary mitigation already tested;
- your preferred disclosure name or request for anonymity.

Never include live tokens, HMAC secrets, environment values, browser storage state, production payloads, database archives, provider responses, or customer information.

## Coordinated disclosure

Please allow maintainers a reasonable opportunity to validate, contain, repair, and distribute a fix before public disclosure. Maintainers may request additional evidence, assign a severity, coordinate an advisory, and credit the reporter when requested.

A report may be closed as not applicable when it depends on unsupported modifications, requires authorized administrator behavior with no boundary bypass, describes intended documented behavior, or cannot be reproduced on a supported revision.

## Security boundaries

FlowCordia's documented security boundary includes:

- tenant, organization, project, repository, environment, workflow, deployment, task, and run authorization;
- GitHub App installation and exact-commit proposal governance;
- write-only credential handling and browser redaction;
- generated workflow source and repository-owned code isolation;
- public webhook request framing, HMAC verification, replay ownership, rate limiting, revocation, and immutable replacement;
- audit, outbox, reconciliation, release evidence, backup, restore, and upgrade integrity;
- protected GitHub Actions environments and sanitized acceptance artifacts.

Operational weaknesses such as an exposed deployment secret, improperly configured reverse proxy, publicly accessible database, disabled protected environment, or compromised GitHub administrator account should still be reported when FlowCordia documentation or defaults contributed to the unsafe state.

## Safe research

Use a dedicated self-hosted installation, synthetic repositories, synthetic payloads, and accounts you control. Do not perform denial-of-service testing, social engineering, destructive data modification, credential harvesting, persistence, lateral movement, or access to another user's resources.

This policy does not grant authorization to test third-party infrastructure, managed installations, or systems operated by FlowCordia users.
