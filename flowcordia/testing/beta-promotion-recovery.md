# Beta promotion and recovery rehearsal

## Purpose

This gate proves that one immutable Beta candidate can be installed and recovered, promoted into production, and replaced through the governed rollback-production path without mixing release identities or relying on an operator-written summary.

It assembles three existing protected artifacts:

1. `Flowcordia published self-host lifecycle`
2. `Flowcordia production acceptance` in `production` mode
3. `Flowcordia production acceptance` in `rollback_production` mode

No product state is changed by the assembler. The lifecycle and browser acceptance workflows remain the owners of their respective destructive actions.

## Required proof

The lifecycle source must prove:

- a distinct current and target immutable release
- clean installation and restart diagnostics
- a real database backup archive
- a disposable restore rehearsal with migration parity
- upgrade classification
- application rollback or restore-required recovery classification
- rollback boundary observation
- complete teardown of disposable containers, network, and volumes

The production source must prove the exact promoted proposal, merge, deployment version, complete closure inventory, successful public run, and verified node evidence.

The rollback-production source must prove a distinct rollback proposal, merge, deployment, and public run for the same application revision and workflow. Reusing production identity is rejected.

## Chronology

The lifecycle proof must complete before promoted production acceptance starts. Promoted production must complete before rollback-production starts. Assembly occurs last. The three GitHub Actions run IDs must be distinct successful `workflow_dispatch` runs from `main`, and every source workflow commit must equal the candidate application commit.

## Evidence boundary

The output contains only:

- release and application identity
- lifecycle recovery digests and rollback classification
- proposal, merge, deployment, closure, and public run identities
- official workflow/run/artifact lineage
- canonical timestamps and SHA-256 digests

It does not retain payloads, outputs, browser storage state, credentials, private paths, provider responses, database contents, backup contents, or raw logs.

## Operator sequence

1. Publish the current and target immutable self-host images.
2. Run the protected self-host lifecycle workflow with both publication run IDs.
3. Complete governed promotion and run production acceptance in `production` mode.
4. Create and merge the governed rollback proposal.
5. Run production acceptance in `rollback_production` mode.
6. Dispatch `Flowcordia Beta promotion and recovery` with the exact lifecycle, production, and rollback-production run IDs.
7. Preserve the resulting `flowcordia-beta-promotion-recovery-<release>-<run>` artifact for the final Beta dossier.

Any missing, expired, repeated, modified, mismatched, failed, non-main, or chronologically invalid source is a stop-ship failure.
