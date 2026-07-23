# Release evidence registry

## Purpose

The registry assembles one protected published self-host lifecycle artifact, two protected operational-readiness artifacts, and six protected connected/product-acceptance artifacts into one exact-lineage launch manifest. The lifecycle artifact must prove clean published-image installation, migration ownership, startup, diagnostics, idempotent restart, controlled upgrade, rollback or restore-required recovery, and teardown for the exact launch candidate. Provider and alert artifacts must then be fresh READY results for that same application. Preview must prove the supported HTTP, mapping, and credential slice. Production webhook acceptance must prove signed delivery, replay, invalid-signature rejection, permanent revocation, inactive successor creation, exact successor activation, successor delivery, and predecessor isolation.

The registry validates evidence already produced by protected workflows. It does not execute workflows, contact providers, deploy code, merge proposals, mutate webhook state, or perform rollback during assembly.

## Required source journey

Run these official workflows from `main`, in order, against one exact target Flowcordia release, deployed application commit, and workflow:

1. **Flowcordia published self-host lifecycle** for one exact current and target publication pair. The target release ID and application commit must equal the launch candidate.
2. **Flowcordia provider readiness** for the exact deployed target application and controlled operator mailbox.
3. **Flowcordia alert readiness** for the same release/application and one exact production channel.
4. **Flowcordia connected acceptance** in `preview` mode.
5. **Flowcordia governed promotion acceptance** for the same proposal head.
6. **Flowcordia production acceptance** in `production` mode for the resulting merge.
7. **Flowcordia production webhook acceptance** for the promoted workflow, including revocation and successor generation.
8. **Flowcordia rollback proposal acceptance** for that current production proposal and one earlier reviewed target.
9. Review and merge the generated rollback proposal normally, then run **Flowcordia production acceptance** in `rollback_production` mode for the new rollback proposal head and merge commit.

The lifecycle must complete before provider readiness begins. Assemble before the shortest source-artifact retention period expires. Failed runs, artifacts from non-`main` branches, expired artifacts, unofficial workflow paths, or reruns with different lineage are rejected.

## Protected environment

Configure `flowcordia-release-evidence` with required reviewers and a deployment-branch restriction allowing only `main`.

Use a dedicated GitHub App installed only on this repository for the evidence proposal step. Grant repository contents write and pull requests write, then configure:

- environment variable `FLOWCORDIA_RELEASE_PR_APP_CLIENT_ID`;
- environment secret `FLOWCORDIA_RELEASE_PR_APP_PRIVATE_KEY`.

The ordinary `GITHUB_TOKEN` remains read-only. A short-lived App installation token is created only after schema `0.5` validation succeeds. It may create the versioned evidence branch and draft pull request; it never changes `main`.

## Invocation

Dispatch **Flowcordia assemble release evidence** from the exact `main` revision containing the assembler. Supply:

- the exact target self-host release ID;
- the exact deployed Flowcordia application commit;
- the public workflow and original promoted proposal IDs;
- one strict JSON object containing exactly nine successful run IDs keyed by `self_host_lifecycle`, `provider`, `alert`, `preview`, `promotion`, `production`, `webhook_production`, `rollback_proposal`, and `rollback_production`.

Artifact names are derived, never accepted as operator input. Every run ID must be distinct. The lifecycle artifact includes the run attempt in its derived name.

## Source validation

For every supplied run, assembly requires:

- the current Flowcordia repository;
- event `workflow_dispatch` on branch `main`;
- status `completed` and conclusion `success`;
- the exact official workflow path;
- a bounded run attempt and lowercase commit SHA;
- exactly one unexpired artifact with the derived official name;
- an archive no larger than 64 KiB with a GitHub SHA-256 digest;
- exactly one regular evidence file no larger than 32 KiB.

The lifecycle source additionally requires:

- official workflow `.github/workflows/flowcordia-self-host-lifecycle.yml`;
- workflow commit equal to the target application commit;
- artifact `flowcordia-self-host-lifecycle-<run-id>-<run-attempt>`;
- internal source run, attempt, workflow path, and commit equal to GitHub metadata;
- target release ID and target application commit equal to the launch candidate;
- state `READY`, all required ordered phases, and valid canonical lifecycle digest.

The webhook source additionally requires its official workflow commit to equal the release application commit and its artifact name to be `flowcordia-webhook-production-<workflow-id>-<run-id>`.

Raw run metadata and downloaded artifacts stay in a private temporary directory and are deleted on success or failure. Only the sanitized manifest is preserved and proposed for review.

## Exact lineage contract

The existing schema `0.3` validator remains authoritative for provider, alert, preview, promotion, production, and both rollback stages. Schema `0.4` continues to wrap that accepted result with one exact webhook source. Schema `0.5` wraps the complete eight-source launch result with one exact self-host lifecycle source rather than reimplementing either proven validator.

The schema `0.5` launch manifest binds:

- current and target self-host release identity, exact target image digest, installation identity, recovery evidence, upgrade classification, migration delta, rollback mode, and lifecycle evidence digest;
- lifecycle target release and application commit to the launch candidate;
- lifecycle completion before provider and connected acceptance begins;
- provider configuration, object-store access, and email acceptance to the exact application;
- alert worker Redis, production-channel coverage/backlog, and canary acceptance to the exact release/application;
- preview head, capability counts, and verified run;
- promotion governance and merge to that exact preview head;
- production deployment and verified execution to the promoted merge;
- webhook acceptance to the same application and workflow after production and before rollback;
- first delivery and replay to bounded accepted status `200` or `202`;
- invalid signature to `401`;
- revocation and predecessor isolation to `404`;
- successor generation to exactly original generation plus one;
- successor delivery to bounded accepted status;
- rollback proposal and rollback production to new, distinct proposal, merge, deployment, and run identities;
- canonical non-overlapping timestamps and nine distinct workflow runs.

Every source retains workflow path, workflow commit, run attempt, artifact name, archive digest, exact evidence-file digest, and timestamps. The final manifest receives a new canonical SHA-256 digest.

## Sensitive-data boundary

The manifest recursively rejects payloads, outputs, cookies, tokens, secrets, authorization, browser state, headers, actors, internal installation/worker/database identity, provider bodies/errors, stack traces, raw errors, webhook URLs, public endpoint IDs, delivery IDs, and run IDs embedded inside connected evidence payloads. The lifecycle parser separately enforces its fixed sanitized schema and canonical digest.

Bounded public workflow/proposal identities and source-run metadata remain allowed only in their explicit manifest fields.

## Evidence pull-request review

The workflow refuses to overwrite an existing release path or branch. It creates:

```text
flowcordia/evidence/releases/<release-id>.json
release-evidence/<release-id>
```

Before marking the draft evidence PR ready:

1. Require normal checks on the exact evidence commit.
2. Confirm the PR contains exactly one manifest and no downloaded artifact or metadata file.
3. Confirm schema version `0.5` and exactly nine ordered source runs.
4. Confirm self-host lifecycle is first, targets the release/application, and completes before provider readiness.
5. Confirm the webhook source follows production and precedes rollback.
6. Confirm original/successor generations and bounded statuses match the protected operator record.
7. Confirm application, repository, proposal, production, rollback, lifecycle, and source workflow identities match the same release lineage.
8. Recompute the digest if needed:

   ```bash
   canonical="$(jq -cS 'del(.manifestSha256)' flowcordia/evidence/releases/<release-id>.json)"
   printf '%s' "$canonical" | shasum -a 256
   ```

9. Merge only after human review. Never edit an accepted manifest in place; use a new release ID for a new journey.

## Failure behavior

Any missing/duplicate source, reused run, unofficial workflow, stale or expired artifact, invalid archive/evidence digest, lifecycle target mismatch, lifecycle chronology violation, sensitive key, malformed webhook status, nonconsecutive generation, connected chronology violation, existing branch, or existing manifest path stops assembly.

## Boundary

Schema `0.5` is necessary launch evidence, not a claim of general availability. Repository CI, configured source runs, queued-alert consumption, human incident response, load/abuse testing, isolation, high availability, PITR, disaster recovery, support, and compatibility guarantees remain separate maturity gates.
