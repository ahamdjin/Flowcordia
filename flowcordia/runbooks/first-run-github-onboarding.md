# First-run GitHub repository onboarding

## Purpose

After the installation owner, infrastructure, email, organization, and project are ready, `/setup/github` owns the first GitHub repository connection. It reuses the existing encrypted GitHub App configuration, installation records, project repository binding, production branch policy, workflow index, and governed starter-workflow proposal.

Flowcordia does not create a second integration model and does not ask the browser for an installation token or personal access token.

## States and recovery

The setup page reports one authoritative state and one recovery action:

| State | Meaning | Recovery |
| --- | --- | --- |
| GitHub App missing | No environment or encrypted App configuration exists. | Configure and verify the App. |
| GitHub App invalid | GitHub rejected the App identity or private key. | Replace the App credentials. |
| GitHub unreachable | The live App identity check could not complete. | Restore outbound access or GitHub availability and retry. |
| Installation missing | The App is configured but not installed for the organization. | Install the App. |
| Installation suspended | The linked installation is suspended. | Resume or reinstall it. |
| Installation deleted | The previous installation was removed. | Reinstall it. |
| Repository access missing | The installation exposes no repositories. | Grant repository access in GitHub. |
| Repository selection required | Accessible repositories exist but the project has no binding. | Select one repository and production branch. |
| Repository permission lost | Contents, pull-request, checks, or commit-status permissions are missing. | Restore installation permissions. |
| Production branch missing | The configured branch is absent or not visible. | Select an existing branch. |
| Repository content required | A canonical workflow, `trigger.config.ts`, or generated-task discovery is missing. | Import a repository or create the governed starter proposal. |
| Synchronization required | The exact production head has not been indexed. | Run synchronization. |
| Synchronization running | A bounded synchronization owns the current lease. | Wait and check again. |
| Synchronization failed | The last synchronization failed or readiness is unavailable. | Resolve the reported cause and retry. |
| Ready | Required repository checks passed at one exact production head. | Continue to Studio. |

Preview deployments are intentionally not a first-run completion requirement. They remain an optional project capability and can be enabled later.

## Repository connection

The repository selector only returns repositories belonging to an active, non-deleted, non-suspended installation for the current organization. The server verifies the selected production branch through the installation-scoped GitHub client before persisting the existing `ConnectedGithubRepository` and branch-tracking contracts.

If production-branch persistence fails after a new connection, the new connection is removed rather than leaving a partially configured project.

## First workflow

When no canonical workflow exists, setup can call the existing governed repository-bootstrap command to create the manual starter workflow as a proposal. The administrator reviews and merges that proposal in Studio, then synchronizes the exact production branch.

## Completion boundary

`/setup` advances to Studio only after `/setup/github` reports `ready`. Readiness requires the active installation, repository identity, required permissions, production branch, canonical workflow catalog, durable workflow index, `trigger.config.ts`, and generated-task discovery to pass. Stored environment secrets, private keys, webhook secrets, repository contents, and provider responses are never projected into setup responses.

The live GitHub App identity check fails closed when GitHub returns an absent or mismatched identity instead of treating an incomplete provider response as configured.

Both setup routes return no-store responses so a browser or intermediary cannot reuse an earlier credential, installation, or repository-readiness projection after the underlying state changes.

This onboarding slice is rebased on the current main branch and remains isolated from Studio editing, runtime execution, image publication, and other open pull requests.
