# Launch campaign readiness

## Purpose

Run this gate before spending a release candidate on image publication, provider delivery, browser acceptance, signed webhook lifecycle, rollback, or immutable dossier assembly.

The gate proves that every protected GitHub environment required by the launch campaign is configured for one exact `main` application revision. It does not prove that the later campaign will pass. It prevents known missing configuration, stale browser state, unsafe lifecycle storage, or unusable release-evidence credentials from being discovered only after destructive work has started.

## Non-destructive boundary

The readiness workflow does not:

- build or publish a container image;
- run database migrations, backup, restore, upgrade, rollback, or teardown;
- send provider email or an alert canary;
- open a browser or execute a workflow;
- create, activate, call, revoke, or replace a webhook;
- merge a proposal, deploy production, create a branch, or open a pull request.

The release-evidence stage creates a short-lived GitHub App token and performs one read-only repository request. This proves the same repository installation and requested contents/pull-request permission boundary that dossier assembly will later require. The token is not written to evidence.

## Protected stages

One dispatch reaches these exact environments in parallel:

| Stage | Protected environment | Readiness boundary |
| --- | --- | --- |
| Publication | `flowcordia-self-host-release` | Human approval and exact candidate identity |
| Lifecycle | `flowcordia-self-host-lifecycle` | Dedicated `flowcordia-release` runner, UID `1000`, safe current/target config and owner-only secret files, isolated writable work/evidence directories |
| Provider | `flowcordia-provider-readiness` | Exact application, PostgreSQL, HTTPS origins, web secrets, GitHub App, proposal worker, product email, object store, controlled mailbox |
| Alert | `flowcordia-alert-readiness` | Exact application, database/deployment dependencies, alerts-worker Redis, bounded worker limits, supported alert transport |
| Connected | `flowcordia-acceptance` | HTTPS base URL, bounded JSON fixture, non-empty valid Playwright storage state |
| Promotion | `flowcordia-promotion-acceptance` | HTTPS base URL and non-empty valid operator storage state |
| Production | `flowcordia-production-acceptance` | HTTPS production URL, bounded JSON fixture, non-empty valid operator storage state |
| Webhook | `flowcordia-webhook-acceptance` | HTTPS base URL, bounded JSON fixture, bounded HMAC secret, non-empty valid operator storage state |
| Rollback | `flowcordia-rollback-acceptance` | HTTPS rollback URL and non-empty valid operator storage state |
| Dossier | `flowcordia-release-evidence` | GitHub App credential shape, token issuance, and read-only repository installation probe |

A stage records only fixed check keys, `READY` or `BLOCKED`, fixed messages, exact source metadata, and a canonical digest. Secret values, URLs, payloads, browser cookies, provider responses, database URLs, private paths, and credentials are never projected into evidence.

## Invocation

1. Merge the candidate to `main` and wait for repository CI on that exact commit.
2. Confirm all ten environments restrict deployment to `main` and use the intended human reviewers.
3. Confirm the dedicated lifecycle runner is online with labels `self-hosted`, `linux`, `x64`, and `flowcordia-release`.
4. Dispatch **Flowcordia launch campaign readiness** from the exact candidate revision.
5. Supply:
   - `application_commit_sha`: the exact lowercase 40-character `main` commit shown by the deployment;
   - `confirmation`: `CHECK_FLOWCORDIA_LAUNCH_CAMPAIGN_READINESS`.
6. Approve each protected environment only after verifying the named candidate and operator intent.

The request job rejects a different branch, a different SHA, a repeated placeholder SHA, or a different confirmation before protected environments are entered.

## Evidence

Each stage uploads one bounded artifact named:

```text
flowcordia-launch-campaign-stage-<stage>-<run-id>
```

The aggregate job requires exactly ten stage artifacts from the same repository, workflow, run, attempt, source ref, and application commit. Stage evidence must be no more than four hours old and retain a valid canonical digest.

The final artifact is:

```text
flowcordia-launch-campaign-readiness-<run-id>
```

Its schema is `0.1` and its state is:

- `READY` only when every check in every stage is READY;
- `BLOCKED` when any recorded configuration check is blocked;
- no artifact when source identity, file shape, artifact count, digest, chronology, or atomic output safety is invalid.

Stage artifacts are retained for 14 days. The final sanitized aggregate is retained for 30 days. Output paths are owner-only and never overwritten.

## After READY

A READY artifact permits the operator to begin the protected campaign; it does not replace any campaign evidence. Continue with one unchanged candidate and preserve exact run identities:

1. publish the required current and target self-host images;
2. run published self-host lifecycle acceptance;
3. run provider readiness;
4. run alert readiness and separately confirm human receipt/acknowledgement;
5. complete connected preview acceptance;
6. promote the exact reviewed proposal;
7. run exact production acceptance;
8. exercise the signed production webhook lifecycle;
9. create the governed rollback proposal;
10. deploy and verify rollback production;
11. assemble the schema `0.5` nine-source launch dossier.

Run readiness again when the application commit, environment variables, secrets, browser session, lifecycle files, dedicated runner, GitHub App installation, or environment protections change.

## Stop-ship

Do not begin or continue the launch campaign when:

- a protected job is denied, skipped unexpectedly, queued without an available lifecycle runner, or belongs to another commit;
- any stage or aggregate state is `BLOCKED`;
- any expected stage artifact is absent, duplicated, stale, oversized, modified, or from another run;
- the aggregate cannot be created atomically;
- an operator bypasses an environment reviewer or copies protected values into logs, issues, pull requests, or committed evidence;
- the deployed application no longer reports the exact readiness commit.

A green readiness run proves configuration and access boundaries only. Issues #78 and #84 remain open until the actual protected campaign and reviewed schema `0.5` evidence pull request are complete.
