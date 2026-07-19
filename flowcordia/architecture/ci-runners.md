# CI runner portability

The inherited workflows referenced private Blacksmith runner labels. Those labels left pull-request jobs queued indefinitely in repositories without that runner provider.

## Decision

Standard workflows use GitHub-hosted runners by default:

- Linux jobs fall back to `ubuntu-latest`.
- Cross-platform matrices use `ubuntu-latest` and `windows-latest`.
- Organizations may set repository variables to use approved larger or self-hosted labels:
  - `FLOWCORDIA_CI_RUNNER_SMALL`
  - `FLOWCORDIA_CI_RUNNER_MEDIUM`
  - `FLOWCORDIA_CI_RUNNER_LARGE`
- The Zizmor audit always runs and blocks low-or-higher findings. Informational advice remains visible without failing the build. Set `ENABLE_WORKFLOW_SECURITY_SCAN=true` only when GitHub Advanced Security is available and SARIF should be published to the Security tab.

## Why variables are used

GitHub-hosted runners make a fresh fork operational without external infrastructure. Repository variables let enterprises route heavy jobs to private runners without maintaining a second workflow copy.

Security scanning is separated from security-result publishing. This keeps the audit useful in private forks where GitHub Advanced Security is not enabled, while retaining an explicit enterprise integration when it is licensed and configured.

The Claude comment handler and documentation-drift audits are optional integrations. They remain
default-off so a repository without the Claude GitHub App does not accumulate permanent failed
checks. After installing the app, set `ENABLE_CLAUDE_CODE=true` to enable event-driven runs. The two
drift audits may also be started manually after installation without enabling automatic PR runs.

## Explicit exception

`pr-testbox.yml` and `pr-testbox-windows.yml` remain Blacksmith-specific manual workflows because their actions implement Blacksmith Testbox sessions, not ordinary CI. They are not part of required pull-request checks and must not be presented as portable until replaced by a Flowcordia-owned debugging workflow.
