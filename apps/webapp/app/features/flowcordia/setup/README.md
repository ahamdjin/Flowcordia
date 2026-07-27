# Flowcordia setup

The setup route gives a platform administrator one protected place to configure installation-wide connections without returning secret values to the browser.

## GitHub App

- Environment variables remain supported and take precedence when present.
- Otherwise, the administrator enters the App ID, slug, private key, and webhook secret once.
- Flowcordia validates the PEM key, authenticates the GitHub App, requires the returned App ID and slug to match, and only then saves the configuration through the existing AES-256-GCM database secret store.
- The response contains only configuration status, App ID, slug, and source. It never returns the private key or webhook secret.
- Successful setup continues through the existing GitHub installation route and callback. Repository selection and project connection remain owned by the existing GitHub settings surface.

All GitHub consumers resolve the same server-side configuration: installation callbacks, repository clients, proposal reconciliation, workflow-index webhooks, dashboard-agent snapshots, and branch checks. No second GitHub integration is introduced.

## Other readiness checks

`configuration.server.ts` retains the non-secret presence checks for general email, alert email, object storage, app origin, and self-host mode. The general-email live test still uses the existing product mailer.

## Direct URL

`/orgs/:organizationSlug/settings/flowcordia-setup`

The route is platform-admin-only and rejects impersonated sessions. It intentionally remains outside ordinary workspace navigation.
