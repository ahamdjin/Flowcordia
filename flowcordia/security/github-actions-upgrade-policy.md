# GitHub Actions upgrade policy

## Purpose

Flowcordia treats GitHub Actions as release infrastructure, not routine text dependencies. Action SHAs remain immutable, and upgrades are grouped by the evidence needed to trust them.

## Curated upgrade set

This release slice accepts updates that are patch/minor within their current contract or whose newer artifact boundary is already exercised by Flowcordia release workflows.

| Action | Accepted version | Repository coverage |
| --- | --- | --- |
| `changesets/action` | `v1.9.0` | 2 pinned use(s) |
| `anthropics/claude-code-action` | `v1.0.175` | 3 pinned use(s) |
| `docker/login-action` | `v4.4.0` | 13 pinned use(s) |
| `actions/upload-artifact` | `v7.0.1` | 26 pinned use(s) |
| `azure/setup-helm` | `v5.0.1` | 4 pinned use(s) |
| `denoland/setup-deno` | `v2.0.5` | 2 pinned use(s) |
| `dorny/paths-filter` | `v4.0.2` | 4 pinned use(s) |
| `actions/attest-build-provenance` | `v4.1.1` | 1 pinned use(s) |
| `docker/setup-buildx-action` | `v4.2.0` | 1 pinned use(s) |
| `softprops/action-gh-release` | `v3.0.2` | 1 pinned use(s) |
| `mitchellh/vouch/action/check-pr` | `v1.5.0` | 1 pinned use(s) |
| `mitchellh/vouch/action/manage-by-issue` | `v1.5.0` | 1 pinned use(s) |

The pull-request matrix, Workflow Checks, full authenticated E2E, and self-host topology remain the merge authority for the exact final commit. Event paths that require production credentials are still governed by their existing protected workflows.

## Deferred majors

| Action | Current pin | Required evidence before upgrade |
| --- | --- | --- |
| `actions/checkout` | `v6.0.2` retained | protected runtime compatibility campaign must be READY |
| `pnpm/action-setup` | `v5.0.0` retained | protected runtime compatibility campaign must be READY |
| `actions/setup-node` | `v6.4.0` retained | protected runtime compatibility campaign must be READY |
| `slackapi/slack-github-action` | `v3.0.3` retained | protected notification paths need a non-mutating credentialed canary |
| `actions/cache` | `v5.0.5` retained | protected runtime compatibility campaign must be READY |
| `zizmorcore/zizmor-action` | `v0.5.6` retained | 0.6.0 reports unresolved findings and must be upgraded with fixes |

Deferred actions must not be bundled back into the curated set merely because ordinary CI is green. Notification and release-only actions require bounded protected canaries. Zizmor must advance only with every new finding resolved or explicitly documented at the exact rule and path boundary; severity must not be weakened.

## Runtime compatibility campaign

The repository owns `.github/workflows/flowcordia-actions-runtime-compatibility.yml` and `flowcordia/runbooks/github-actions-runtime-compatibility.md` as the evidence gate for the four Node 24 runtime candidates.

The campaign must run manually from the exact current `main` SHA with explicit confirmation. It proves:

- GitHub-hosted Linux and Windows
- each configured small, medium, and large runner class, with a documented hosted fallback only when that variable is unset
- the protected dedicated `flowcordia-release` self-hosted runner
- checkout, pnpm setup, Node setup, and cache save/restore behavior
- one immutable six-profile schema `0.1` READY artifact from one workflow run and attempt

Creating or merging the gate does not authorize the candidate upgrades. Repository-wide pins remain unchanged until a protected READY campaign artifact is preserved and referenced by a later upgrade pull request.

## Review rules

1. Keep action references pinned to full commit SHAs with an accurate version comment when one is present.
2. Reject grouped upgrades that mix unresolved scanner findings, runner-runtime majors, and protected notification/release behavior.
3. Require Actionlint and Zizmor on the exact final tree.
4. Require repository CI and the self-host cold image inspection when changed workflows participate in build or release paths.
5. Preserve `persist-credentials: false` unless a reviewed workflow owns a narrowly documented Git mutation.
6. Never accept a mutable tag, unpinned marketplace action, reduced permission boundary, hidden workflow file, or bypassed protected environment to make an upgrade pass.
7. Require the exact protected evidence artifact named by the policy before promoting a deferred major.
