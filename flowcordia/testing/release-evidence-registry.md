# Release evidence registry

## Purpose

The registry assembles two protected operational-readiness artifacts and six protected connected/product-acceptance artifacts into one exact-lineage launch manifest. Provider and alert artifacts must be fresh READY results for the exact application. Preview must prove the supported HTTP, mapping, and credential slice. Production webhook acceptance must prove signed delivery, replay, invalid-signature rejection, permanent revocation, inactive successor creation, exact successor activation, successor delivery, and predecessor isolation.

The registry validates evidence already produced by protected workflows. It does not execute workflows, contact providers, deploy code, merge proposals, mutate webhook state, or perform rollback during assembly.

## Required source journey

Run these official workflows from `main`, in order, against one unchanged deployed Flowcordia application commit and workflow:

1. **Flowcordia provider readiness** for the exact deployed application and controlled operator mailbox.
2. **Flowcordia alert readiness** for the same release/application and one exact production channel.
3. **Flowcordia connected acceptance** in `preview` mode.
4. **Flowcordia governed promotion acceptance** for the same proposal head.
5. **Flowcordia production acceptance** in `production` mode for the resulting merge.
6. **Flowcordia production webhook acceptance** for the promoted workflow, including revocation and successor generation.
7. **Flowcordia rollback proposal acceptance** for that current production proposal and one earlier reviewed target.
8. Review and merge the generated rollback proposal normally, then run **Flowcordia production acceptance** in `rollback_production` mode for the new rollback proposal head and merge commit.

Assemble before the shortest source-artifact retention period expires. Failed runs, artifacts from non-`main` branches, expired artifacts, unofficial workflow paths, or reruns with different lineage are rejected.

## Protected environment

Configure `flowcordia-release-evidence` with required reviewers and a deployment-branch restriction allowing only `main`.

Use a dedicated GitHub App installed only on this repository for the evidence proposal step. Grant repository contents write and pull requests write, then configure:

- environment variable `FLOWCORDIA_RELEASE_PR_APP_CLIENT_ID`;
- environment secret `FLOWCORDIA_RELEASE_PR_APP_PRIVATE_KEY`.

The ordinary `GITHUB_TOKEN` remains read-only. A short-lived App installation token is created only after schema `0.4` validation succeeds. It may create the versioned evidence branch and draft pull request; it never changes `main`.

## Invocation

Dispatch **Flowcordia assemble release evidence** from the exact `main` revision containing the assembler. Supply:

- a unique lowercase release ID;
- the exact deployed Flowcordia application commit;
- the public workflow and original promoted proposal IDs;
- one strict JSON object containing exactly eight successful run IDs keyed by `provider`, `alert`, `preview`, `promotion`, `production`, `webhook_production`, `rollback_proposal`, and `rollback_production`.

Artifact names are derived, never accepted as operator input. Every run ID must be distinct.

## Source validation

For every supplied run, assembly requires:

- the current Flowcordia repository;
- event `workflow_dispatch` on branch `main`;
- status `completed` and conclusion `success`;
- the exact official workflow path;
- a bounded run attempt and lowercase commit SHA;
- exactly one unexpired artifact with the derived official name;
- an archive no larger than 64 KiB with a GitHub SHA-256 digest;
- exactly one regular `evidence.json` file no larger than 32 KiB.

The webhook source additionally requires its official workflow commit to equal the release application commit and its artifact name to be `flowcordia-webhook-production-<workflow-id>-<run-id>`.

Raw run metadata and downloaded artifacts stay in a private temporary directory and are deleted on success or failure. Only the sanitized manifest is preserved and proposed for review.

## Exact lineage contract

The existing schema `0.3` validator remains authoritative for provider, alert, preview, promotion, production, and both rollback stages. Schema `0.4` wraps that accepted result with one exact webhook source rather than reimplementing the proven seven-source logic.

The launch manifest binds:

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
- canonical non-overlapping timestamps and eight distinct workflow runs.

Every source retains workflow path, workflow commit, run attempt, artifact name, archive digest, exact evidence-file digest, and timestamps. The final manifest receives a new canonical SHA-256 digest.

## Sensitive-data boundary

The manifest recursively rejects payloads, outputs, cookies, tokens, secrets, authorization, browser state, headers, actors, internal installation/worker/database identity, provider bodies/errors, stack traces, raw errors, webhook URLs, public endpoint IDs, delivery IDs, and run IDs embedded inside evidence payloads.

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
3. Confirm schema version `0.4` and exactly eight ordered source runs.
4. Confirm the webhook source follows production and precedes rollback.
5. Confirm original/successor generations and bounded statuses match the protected operator record.
6. Confirm application, repository, proposal, production, rollback, and source workflow identities match the same release lineage.
7. Recompute the digest if needed:

   ```bash
   canonical="$(jq -cS 'del(.manifestSha256)' flowcordia/evidence/releases/<release-id>.json)"
   printf '%s' "$canonical" | shasum -a 256
   ```

8. Merge only after human review. Never edit an accepted manifest in place; use a new release ID for a new journey.

## Failure behavior

Any missing/duplicate source, reused run, unofficial workflow, stale or expired artifact, invalid archive/evidence digest, sensitive key, malformed webhook status, nonconsecutive generation, chronology violation, existing branch, or existing manifest path stops assembly.

## Boundary

Schema `0.4` is necessary launch evidence, not a claim of general availability. Repository CI, the release-candidate gate, configured source runs, queued-alert consumption, human incident response, load/abuse testing, isolation, high availability, PITR, disaster recovery, support, and compatibility guarantees remain separate maturity gates.
