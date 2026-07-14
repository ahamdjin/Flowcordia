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

## Why variables are used

GitHub-hosted runners make a fresh fork operational without external infrastructure. Repository variables let enterprises route heavy jobs to private runners without maintaining a second workflow copy.

## Explicit exception

`pr-testbox.yml` and `pr-testbox-windows.yml` remain Blacksmith-specific manual workflows because their actions implement Blacksmith Testbox sessions, not ordinary CI. They are not part of required pull-request checks and must not be presented as portable until replaced by a Flowcordia-owned debugging workflow.
