# Private Beta dossier

## Purpose

This is Flowcordia's final code-enforced Private Beta graduation boundary. It does not create test results and it does not change product maturity by itself. It validates and preserves six successful protected evidence artifacts for one exact `main` commit.

## Required source runs

All six runs must be distinct successful `workflow_dispatch` runs from `main`, use the exact candidate commit, contain exactly one unexpired official artifact, and complete before dossier assembly:

1. schema `0.5` connected launch dossier;
2. clean bundled supervisor and S2 execution;
3. connected API-trigger reliability;
4. promotion, rollback-production, backup and restore recovery;
5. load, queue saturation, worker-loss and provider-outage recovery;
6. human browser, accessibility, touch, low-resolution and 70/300-node canvas evidence.

Every source must contain one required JSON evidence object. The assembler independently verifies each artifact archive digest, raw JSON digest, canonical evidence digest, workflow identity, application commit, release identity, reference workflow identity and relevant READY outcomes.

## Dispatch

Run **Flowcordia Private Beta dossier** from the exact candidate on `main` behind the `flowcordia-release-evidence` protected environment. Supply:

- the exact lowercase release ID;
- the exact 40-character candidate commit;
- the exact connected reference workflow ID;
- the six successful source run IDs;
- confirmation `ASSEMBLE-PRIVATE-BETA-DOSSIER`.

The workflow downloads each source into a private temporary directory, assembles one sanitized dossier, uploads a 90-day artifact, creates a no-overwrite draft evidence pull request at `flowcordia/evidence/beta/<release-id>.json`, and removes downloaded/private material.

## Review boundary

Before merging the generated evidence pull request, verify:

- all six source run IDs and attempts are distinct;
- every source workflow path and commit matches the candidate;
- artifact archive, raw evidence and canonical evidence digests are present and unchanged;
- every source completed before final assembly;
- the proposed pull request contains exactly one dossier file;
- no credentials, payloads, private paths, provider responses or raw errors appear;
- the dossier still states the unsupported boundaries honestly.

## Honest maturity limit

A READY dossier supports **Private Beta** only. It does not prove Public Beta, general availability, high availability, point-in-time recovery, cross-region disaster recovery, unlimited graph scale, unlimited throughput or a public service-level objective.

Do not change Flowcordia's maturity declaration until the generated dossier pull request has been reviewed and merged and the user has completed their independent verification.
