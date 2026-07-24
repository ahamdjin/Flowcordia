# GitHub Actions runtime compatibility campaign

## Purpose

This campaign proves that the deferred Node 24 GitHub Action runtimes can execute safely across every Flowcordia runner class before repository workflow pins are upgraded.

It tests these exact candidates without changing any production workflow reference:

- `actions/checkout` `v7.0.0`
- `pnpm/action-setup` `v6.0.9`
- `actions/setup-node` `v7.0.0`
- `actions/cache` `v6.1.0`

The campaign is non-destructive. It does not publish, deploy, send notifications, call providers, mutate Git, or use repository secrets.

## Runner profiles

One run must preserve READY evidence for exactly six profiles:

1. GitHub-hosted Linux
2. GitHub-hosted Windows
3. configured small runner, or the documented GitHub-hosted fallback when unset
4. configured medium runner, or the documented GitHub-hosted fallback when unset
5. configured large runner, or the documented GitHub-hosted fallback when unset
6. the protected dedicated `self-hosted`, `linux`, `x64`, `flowcordia-release` runner

The dedicated release runner remains behind the existing `flowcordia-self-host-lifecycle` environment.

## What each profile proves

Each profile must:

- check out the exact `main` commit with checkout v7 and no persisted credentials
- install pnpm `10.33.2` with pnpm setup v6
- install Node `20.20.2` with setup-node v7
- save a uniquely keyed bounded payload with cache v6
- remove the local payload
- restore the exact cache key with cache v6
- verify the restored SHA-256
- preserve only allow-listed runner, toolchain, candidate, cache-digest, and workflow-lineage evidence

Runner names and cache keys are represented only by SHA-256. No environment dump, filesystem path, URL, credential, token, secret, or raw error belongs in evidence.

## Operator sequence

1. Merge the gate implementation after ordinary pull-request CI is green.
2. Open **Actions → Flowcordia GitHub Actions runtime compatibility**.
3. Select `main`.
4. Copy the exact current 40-character lowercase `main` commit SHA into `application_commit_sha`.
5. Enter `CHECK_FLOWCORDIA_ACTIONS_RUNTIME_COMPATIBILITY` as the confirmation.
6. Approve the protected release-runner job when GitHub requests environment approval.
7. Confirm all six stage jobs and the aggregate job succeed.
8. Download `flowcordia-actions-runtime-readiness-<run-id>`.
9. Verify the aggregate has schema `0.1`, state `READY`, six ordered profiles, the exact commit SHA, and the exact four candidate SHAs.

## Stop-ship conditions

Do not upgrade the repository-wide action pins when any of these is true:

- the workflow is not running from the exact current `main` SHA
- a configured custom runner falls back unexpectedly
- the dedicated release runner is unavailable, uses the wrong labels, is not Linux/X64, or does not run as UID `1000`
- checkout, pnpm setup, Node setup, cache save, or cache restore fails on any profile
- the cache payload digest changes
- stage evidence is absent, duplicated, mixed across runs, modified, or contains forbidden fields
- the aggregate is not READY

Reruns create a new `run_attempt` and new cache keys. Evidence from different attempts must never be combined.

## Promotion after READY

A later, separate pull request may upgrade the four repository-wide pins only after a protected READY artifact is preserved. That upgrade PR must reference the exact workflow run, commit SHA, and aggregate evidence digest, then pass Workflow Checks, authenticated E2E, repository CI, and self-host topology again.

The successful campaign proves runner compatibility. It does not prove Slack v4 behavior or resolve Zizmor 0.6 findings; those remain separate review boundaries.
