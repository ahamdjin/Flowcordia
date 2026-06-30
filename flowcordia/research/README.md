# Flowcordia repo research

This folder maps the Trigger.dev codebase before adding Flowcordia features.

Rule for this branch:

- research only
- docs only
- no UI changes
- no product behavior changes
- no rebranding yet

## Reading order

1. `00-repo-map.md`
2. `01-routing-map.md`
3. `02-settings-ui-map.md`
4. `03-github-integration-map.md`
5. `04-email-alerts-map.md`
6. `05-env-self-host-map.md`
7. `06-safe-change-plan.md`

## Why this exists

This repo is a large infrastructure product. A small UI change can affect routing, feature flags, permissions, cloud/self-host behavior, or nested Remix layouts.

Before adding Flowcordia features, we need to understand what connects where.