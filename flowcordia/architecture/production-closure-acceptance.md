# Production closure acceptance evidence

## Decision

Protected production and rollback-production acceptance must prove the same immutable workflow closure that gates Studio execution. A successful root run is not sufficient launch evidence when a reviewed child workflow could be missing from the authoritative worker.

## Operator-supplied identity

The protected workflow requires:

- the exact application commit;
- proposal head and merge commit;
- authoritative deployment version;
- immutable closure digest; and
- expected closure workflow count between 1 and 100.

The browser harness compares those values only with bounded server-owned Studio attributes. It cannot choose the environment, worker, task rows, repository installation, credentials, or runtime metadata.

Production mode binds the original promoted closure. Rollback-production mode binds the newly governed rollback proposal's own closure rather than inheriting or assuming the earlier production closure.

## Browser proof

Before execution and again after verified completion, the harness requires:

- production state `READY`;
- closure state `READY`;
- exact closure digest equality;
- expected task count equal to the operator-supplied count; and
- installed task count equal to the expected count.

Only then may the harness execute the existing authenticated Studio production command and preserve sanitized schema `0.2` evidence.

## Launch dossier binding

The immutable launch-dossier validator accepts production and rollback-production artifacts only when their schema `0.2` closure proof is complete and internally consistent. The source artifact digest already binds the exact evidence bytes into the dossier; no worker IDs, task IDs, payloads, outputs, credentials, or raw provider data are copied into the manifest.

## Exclusions

This contract does not run the protected environment automatically, activate schedules or webhooks, create a second runtime path, or replace human review of the connected evidence artifact.
