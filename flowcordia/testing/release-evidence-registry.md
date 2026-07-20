# Release evidence registry

## Purpose

The protected **Flowcordia assemble release evidence** workflow converts five successful connected acceptance artifacts into one sanitized, immutable release manifest. It never writes to `main`. It creates a draft pull request containing exactly one versioned manifest for human review and normal repository checks.

This registry proves the connected journey already covered by the acceptance harnesses. It does not turn missing acceptance into a pass, execute a workflow, merge a product proposal, deploy code, or perform rollback.

## Required source journey

Run these protected workflows from `main`, in order, against one unchanged deployed Flowcordia application commit and workflow:

1. **Flowcordia connected acceptance** in `preview` mode.
2. **Flowcordia governed promotion acceptance** for the same proposal head.
3. **Flowcordia production acceptance** in `production` mode for the resulting merge.
4. **Flowcordia rollback proposal acceptance** for that current production proposal and one earlier reviewed target.
5. Review and merge the generated rollback proposal normally, then run **Flowcordia production acceptance** in `rollback_production` mode for the new rollback proposal head and its new merge commit.

Assemble the manifest before the shortest source-artifact retention period expires. Failed workflow runs, reruns with a different identity, expired artifacts, and artifacts from branches other than `main` are not accepted.

## Protected environment

Configure `flowcordia-release-evidence` with required reviewers and a deployment-branch restriction that allows only `main`.

Use a dedicated GitHub App installed only on this repository for the evidence proposal step. Grant it repository contents write and pull requests write permissions, then configure:

- environment variable `FLOWCORDIA_RELEASE_PR_APP_CLIENT_ID`;
- environment secret `FLOWCORDIA_RELEASE_PR_APP_PRIVATE_KEY`.

The job's ordinary `GITHUB_TOKEN` remains read-only. A short-lived, least-privilege App installation token is created only after the manifest has passed validation. That token may create the versioned evidence branch and draft pull request; it is never used to change `main`.

## Invocation

Dispatch **Flowcordia assemble release evidence** from the exact `main` revision containing the assembler. Supply:

- a unique lowercase release ID;
- the exact deployed Flowcordia application commit;
- the public workflow and original promoted proposal IDs;
- the five successful workflow run IDs in journey order.

Artifact names are not operator inputs. The workflow derives their exact official names from the stage, workflow or proposal identity, and run ID.

## Source validation

For every supplied run, assembly requires:

- the current Flowcordia repository;
- event `workflow_dispatch` on branch `main`;
- status `completed` and conclusion `success`;
- the exact official acceptance workflow path;
- a bounded run attempt and lowercase commit SHA;
- exactly one unexpired artifact with the derived official name;
- an archive no larger than 64 KiB with a GitHub SHA-256 digest;
- exactly one regular `evidence.json` file no larger than 32 KiB.

Raw GitHub run metadata and downloaded source artifacts stay in a private temporary directory and are deleted on success or failure. Only the sanitized manifest is preserved as a recovery artifact and proposed for review.

## Exact lineage contract

The manifest rejects unsupported fields and recursively rejects payloads, outputs, credentials, browser state, provider data, internal IDs, reasons, stack traces, and raw errors. Every source must have result `PASSED`, stage `complete`, the same application commit, and the same workflow ID.

The accepted chain binds:

- preview observed head to preview expected head;
- promotion governance and expected head to that preview head;
- production proposal, head, merge commit, deployment commit, version, and verified run to the promoted proposal;
- rollback current proposal, head, and merge to that production lineage;
- the historical rollback target to the new governed rollback proposal ID and head;
- rollback production to the **new rollback merge commit**, not the historical target merge commit;
- a new rollback deployment version and verified run;
- canonical timestamps in non-overlapping journey order.

The source workflow path, workflow commit, run attempt, artifact name, archive digest, exact evidence-file digest, and timestamps are retained for every stage. The manifest receives its own canonical SHA-256 digest.

## Evidence pull-request review

The workflow refuses to overwrite an existing release path or release branch. It creates:

```text
flowcordia/evidence/releases/<release-id>.json
release-evidence/<release-id>
```

The pull request remains a draft. Before marking it ready:

1. Require normal repository checks on the exact evidence commit.
2. Confirm there is one manifest file and no raw artifact or metadata file.
3. Confirm the application, repository, proposal, production, target, rollback proposal, and rollback production identities match the operator record.
4. Confirm the rollback proposal merge commit is new and distinct from both the production merge and historical target merge.
5. Recompute the digest if needed:

   ```bash
   canonical="$(jq -cS 'del(.manifestSha256)' flowcordia/evidence/releases/<release-id>.json)"
   printf '%s' "$canonical" | shasum -a 256
   ```

6. Merge only after the human reviewer accepts the evidence. Never edit an accepted release manifest in place; create a new release ID for a new journey.

## Failure behavior

Any source mismatch, duplicate or missing stage, reused run, unexpected field, sensitive key, oversized artifact, invalid digest, noncanonical timestamp, broken lineage, existing branch, or existing manifest path stops assembly. A failed proposal step leaves the sanitized recovery artifact available for inspection but does not weaken the overwrite rules.

## Boundary

This five-stage manifest is necessary connected release evidence, but it does not by itself satisfy every private-beta or public-beta gate in `flowcordia/product/release-readiness.md`. Repository CI, installation and recovery proof, product usability evidence, performance and isolation tests, and any additional release-record fields required by the advertised maturity level remain separate stop-ship gates.
