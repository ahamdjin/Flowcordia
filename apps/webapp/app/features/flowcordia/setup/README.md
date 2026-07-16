# Flowcordia setup foundation

The setup foundation gives self-hosted operators a safe view of required connections without exposing configuration values.

## Files

- `configuration.server.ts` — pure presence checks for GitHub App, email, alert email, object storage, app origin, and self-host mode.
- `configuration.server.test.ts` — verifies transport rules, missing states, and secret-value isolation.
- Route: `app/routes/_app.orgs.$organizationSlug.settings.flowcordia-setup/route.tsx`.

## Connections and why

| From         | To                   | Why                                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------------------- |
| Setup loader | `env.server.ts`      | Read already-validated configuration without creating a second settings store    |
| Setup loader | `featuresForRequest` | Detect managed versus self-hosted product mode                                   |
| Setup action | `requireUser`        | Restrict the test target to the signed-in user                                   |
| Setup action | `sendPlainTextEmail` | Exercise the existing general email transport instead of creating another mailer |
| Setup UI     | Browser              | Return status and guidance only, never configuration values                      |

## Deferred connections

- Alert email test: the existing alert client sends typed alert templates; add a dedicated safe test contract before exposing it.
- Object storage test: use the existing packet/output storage client after its least-privilege probe is mapped.
- GitHub live test: use the existing GitHub App client after installation permissions and rate-limit behavior are mapped.

## Direct URL

`/orgs/:organizationSlug/settings/flowcordia-setup`

The route intentionally has no settings-navigation link during the foundation phase.
