# GitHub App setup and deploy latest

## Configure once

A platform administrator opens `/orgs/:organizationSlug/settings/flowcordia-setup` and enters the GitHub App ID, slug, private key, and webhook secret. Flowcordia authenticates the App before saving and then redirects through the existing GitHub installation flow. The setup route rejects non-admin and impersonated sessions.

Environment-based GitHub App configuration remains authoritative when present. The UI does not overwrite or reveal environment-managed values. Database-managed private keys and webhook secrets use the existing encrypted secret store and are never serialized back to the browser.

## Connect a repository

After installation, the setup page shows the active GitHub installation instead of offering to install the App again. Use the existing project GitHub settings to choose one repository. The repository default branch remains the initial production tracking branch. Branch tracking is shown only when it needs operator attention.

## Deploy latest

The Deployments page compares the tracked GitHub branch head with the exact current and in-progress deployment commits. It displays one compact state:

- latest deployed;
- deploying;
- ready to promote;
- update available;
- not deployed;
- deploy failed;
- status unavailable.

Automatic tracked-branch deployments remain the primary path. This follows the established Git deployment model: branch activity drives normal deployments, while a manual control clearly targets the latest observed branch head instead of implying an unsupported arbitrary-SHA build.

`Deploy latest commit` is a recovery action for an existing server-side build adapter. The page submits the full commit SHA it displayed, and the server rechecks the tracked branch head and deployment state under deployment-write authorization. If the branch changed after the page loaded, the request fails safely and asks the operator to refresh. The inherited build adapter still owns final branch resolution; Flowcordia never claims an exact-SHA deployment contract that the adapter does not expose, creates deployment records, or promotes a fabricated version.

Bundled self-host currently deploys task images through the supported Trigger.dev CLI, local Buildx, private registry, and supervisor path. When no server-side build adapter is configured, the button remains disabled and the page states that automatic GitHub deployment or the CLI remains authoritative. A future self-host build service may implement the adapter without changing this UI contract.
