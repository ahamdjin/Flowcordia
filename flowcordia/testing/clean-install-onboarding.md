# Clean-install onboarding acceptance

This acceptance is the release gate for the exact first-run journey:

`install → create owner → password login → verify services → configure email → create organization/project → configure and link GitHub → connect and synchronize a repository → deploy → invite a second user → second user signs in`

It does not run on pull requests. It runs only by protected `workflow_dispatch` from `main`, against a published image whose signed provenance and application SHA match that exact `main` revision.

## Protected environment

Create the GitHub environment `flowcordia-clean-install-onboarding` and restrict it to `main` and the release operators who may approve destructive acceptance.

Environment variables:

- `FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_CONFIG_FILE`: absolute path to a validated bundled base configuration.
- `FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_WORK_PARENT`: absolute parent for disposable workspaces.
- `FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_EVIDENCE_DIR`: absolute protected evidence directory.
- `FLOWCORDIA_ACCEPTANCE_GITHUB_APP_ID` and `FLOWCORDIA_ACCEPTANCE_GITHUB_APP_SLUG`: the dedicated acceptance GitHub App identity.
- `FLOWCORDIA_ACCEPTANCE_GITHUB_INSTALLATION_ID`: the App installation that can access only the reference fixture repository.
- `FLOWCORDIA_ACCEPTANCE_REFERENCE_REPOSITORY` and `FLOWCORDIA_ACCEPTANCE_REFERENCE_BRANCH`: a dedicated repository and immutable production branch containing a deployable Trigger project plus Flowcordia workflow index.
- `FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE`: immutable `@sha256:` Mailpit image reference.
- `FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE`: immutable `@sha256:` Caddy image reference.

Environment secrets:

- `FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_SECRETS_FILE`: absolute path to validated bundled base secrets. Do not preconfigure email or GitHub App values in this file.
- `FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_REGISTRY_AUTH_FILE`: absolute path to the bundled registry htpasswd file.
- `FLOWCORDIA_ACCEPTANCE_GITHUB_PRIVATE_KEY`: private key for the dedicated acceptance GitHub App.
- `FLOWCORDIA_ACCEPTANCE_GITHUB_WEBHOOK_SECRET`: webhook secret for that App.

The reference App and repository must not grant access to production customer repositories. Rotate the App private key and webhook secret using the normal GitHub App process; update the protected environment before the next run.

## Run

1. Publish the exact target `main` revision using `flowcordia-publish-self-host-image.yml`.
2. Dispatch `flowcordia-clean-install-onboarding-acceptance.yml` from that same `main` revision.
3. Enter the successful publication run ID.
4. Enter `RUN-CLEAN-INSTALL-ONBOARDING` as confirmation.
5. Approve the protected environment deployment.

The runner rejects a publication from another commit, branch, event, or workflow. It also verifies the signed image attestation before pulling or starting the bundle.

## What is real

- The owner, organization, and project are created through browser-visible product routes.
- Password login is exercised after an explicit logout.
- PostgreSQL, Redis, ClickHouse, object storage, origins, and the bundled services are checked by the setup UI.
- SMTP is configured through the setup UI and tested against an isolated Mailpit mailbox.
- GitHub App credentials are verified by GitHub before persistence.
- A real installation and repository are checked through installation-scoped GitHub APIs.
- Repository selection and synchronization use Flowcordia's production onboarding route and persisted contracts.
- Deployment uses the existing CLI, local Buildx path, bundled private registry, and supervisor topology.
- Invitation delivery uses the configured email transport; the second user requests a magic link and accepts the invitation in a separate browser context.

## Evidence and cleanup

The retained JSON contains only hashes and immutable identities: application commit, image digest, publication evidence digest, reference repository/branch/App/installation hashes, reference commit, project/deployment hashes, ordered journey timestamps, workflow run identity, and teardown status.

It never contains setup tokens, passwords, private keys, webhook secrets, cookies, authorization headers, installation tokens, personal access tokens, environment API keys, email contents, raw provider responses, or private filesystem paths.

Teardown is finalized only after the browser exits, Mailpit is cleared, the complete Compose project is removed with volumes, all named networks and volumes are absent, temporary checkouts and credential files are deleted, and the mailbox port is no longer reachable. A failed run retains no READY evidence.
