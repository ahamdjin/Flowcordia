# GitHub App setup and deploy latest

## Configure once

A platform administrator opens `/orgs/:organizationSlug/settings/flowcordia-setup` and enters the GitHub App ID, slug, private key, and webhook secret. Flowcordia authenticates the App before saving and then redirects through the existing GitHub installation flow. The setup route rejects non-admin and impersonated sessions.

Environment-based GitHub App configuration remains authoritative when present. The UI does not overwrite or reveal environment-managed values. Database-managed private keys and webhook secrets use the existing encrypted secret store and are never serialized back to the browser.

## Connect a repository

After installation, use the existing project GitHub settings to choose one repository. The repository default branch remains the initial production tracking branch. Branch tracking is shown only when it needs operator attention.

## Deploy latest

The Deployments page compares the tracked GitHub branch head with the exact current and in-progress deployment commits. It displays one compact state:

- latest deployed;
- deploying;
- ready to promote;
- update available;
- not deployed;
- deploy failed;
- status unavailable.

`Deploy latest` is a recovery action for an existing server-side build adapter. It rechecks the repository head and deployment state under deployment-write authorization before requesting the inherited initial-deployment path. It never creates deployment records or promotes a fabricated version.

Bundled self-host currently deploys task images through the supported Trigger.dev CLI, local Buildx, private registry, and supervisor path. When no server-side build adapter is configured, the button remains disabled and the page states that automatic GitHub deployment or the CLI remains authoritative. A future self-host build service may implement the adapter without changing this UI contract.
