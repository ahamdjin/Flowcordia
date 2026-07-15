# Workflow discovery

`GitHubWorkflowCatalog` is the bounded, read-only discovery boundary for canonical Flowcordia workflow files.

## Contract

- The caller supplies a fully authorized `GitHubWorkflowAccessScope`.
- The injected resolver returns only an installation-scoped GitHub client after rechecking tenant, project, installation, repository, and branch ownership.
- A branch or revision is resolved once to an immutable commit SHA.
- Repository tree discovery is performed against that exact commit.
- Only flat files matching `.flowcordia/workflows/<valid-workflow-id>.json` are returned.
- Truncated trees and catalogs above the configured bound fail closed; partial discovery is never presented as complete.
- Discovery returns paths, blob SHAs, sizes, and the immutable commit. It does not read or validate workflow content; `GitHubWorkflowStore` owns exact content reads.

The adapter treats GitHub's response `data.sha` as the tree object SHA, not the commit SHA. The catalog identity always remains the requested immutable commit.

## Exclusions

This package does not persist an index, process webhooks, authorize dashboard users, expose browser DTOs, or scan credentials. Those connections are owned by the webapp workflow-index feature.
