# GitHub Actions Slack compatibility

## Purpose

Flowcordia keeps `slackapi/slack-github-action` v3 pinned in production notification workflows until the exact v4 candidate authenticates successfully through the same protected credential boundary.

The compatibility workflow calls Slack Web API `auth.test`. It does not post, update, delete, schedule, or react to a message. It does not read or preserve the API response, workspace identity, bot identity, user identity, channel identity, token, payload, URL, or headers.

## Protected ownership

- Workflow: `.github/workflows/flowcordia-slack-action-compatibility.yml`
- Protected environment: `dependabot-summary`
- Required environment secret: `SLACK_BOT_TOKEN`
- Candidate: `slackapi/slack-github-action` v4.0.0 at `dcb1066f776dd043e64d0e8ba94ca15cc7e1875d`
- API method: `auth.test`
- Evidence schema: `0.1`

The token must belong to the same Slack application and credential boundary used by the Dependabot critical-alert and weekly-summary workflows. No channel variable is required because the canary performs no message operation.

## Execute the canary

1. Merge the compatibility gate into `main`.
2. Open **Actions → Flowcordia Slack action compatibility → Run workflow**.
3. Select `main`.
4. Enter the exact current lowercase `main` commit in `application_commit_sha`.
5. Enter `CHECK_FLOWCORDIA_SLACK_ACTION_COMPATIBILITY` in `confirmation`.
6. Approve the `dependabot-summary` environment only after confirming the selected commit.
7. Require both jobs to complete successfully without rerunning on a different commit.
8. Preserve the exact artifact named `flowcordia-slack-action-compatibility-<run-id>-<run-attempt>`.

## READY evidence

A reviewable READY artifact contains only:

- schema, state, and evidence kind
- exact Flowcordia commit
- workflow run and attempt
- protected environment name
- immutable candidate action identity
- `auth.test` as the exercised method
- runner operating system and architecture
- `authentication: VERIFIED`
- `mutation: NONE`
- canonical SHA-256 evidence digest

The evidence contract rejects credential, token, authorization, payload, response, channel, team, user, bot, URL, email, header, raw-error, and stack fields. Output is owner-only and no-overwrite.

## Stop-ship conditions

Do not promote Slack v4 when any of the following is true:

- the run is not a manual dispatch from the exact current `main` commit
- the protected environment was bypassed or changed
- `auth.test` fails or returns `ok != true`
- the action SHA or version differs from the policy candidate
- the run posts or otherwise mutates Slack state
- the evidence is missing, overwritten, modified, or contains identity or credential material
- the production notification workflows changed before the READY artifact was reviewed

## Promotion boundary

Creating or merging this canary does not authorize the major upgrade. A later pull request must reference one reviewed READY artifact from the exact `main` run, update both production Slack pins together, keep full-SHA references, validate their existing payload-file contract, and pass Workflow Checks plus repository CI on its unchanged final head.
