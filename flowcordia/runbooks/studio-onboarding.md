# Guided Studio onboarding

Flowcordia Studio must not leave a user at a disconnected dead end. The first-use surface guides an authorized project writer through the existing GitHub installation and project-integration paths, then returns them to Studio for repository synchronization or governed bootstrap.

## Product sequence

1. Install or review the GitHub App with repository-scoped access.
2. Open project integrations and select the repository plus production branch.
3. Return to Studio and refresh server-owned configuration.
4. Synchronize existing `.flowcordia/workflows/*.json` files or use the existing governed first-workflow bootstrap.
5. Continue through Repository → Build → Review → Preview → Production.

## Trust boundary

- The onboarding surface does not infer or claim that a GitHub App installation exists.
- Repository identity, installation identity, project scope, and production branch remain server-resolved.
- Read-only users receive guidance and a refresh action, but no repository mutation links.
- The browser never receives GitHub credentials, installation IDs, database IDs, or repository tokens.
- Refresh re-runs the normal authenticated Studio loader; it does not create a connection or mutate GitHub.

## Failure behavior

- A bounded server configuration error is shown as the primary explanation.
- Missing repository configuration keeps repository selection active and synchronization waiting.
- A connected repository without available synchronization advances only the synchronization step.
- The product does not mark GitHub installation complete without an authoritative server observation.
- The existing repository readiness check remains required after connection; onboarding is guidance, not release evidence.

## Rollback

Revert the onboarding composition commit. The existing GitHub installation, project integration, repository indexing, workflow bootstrap, proposal, deployment, and runtime contracts are unchanged.
