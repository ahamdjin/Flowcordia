# FlowCordia contribution discipline

FlowCordia changes must preserve one connected product. A pull request is accepted because its boundary is complete and verified, not because it adds visible surface area.

## Required sequence

1. Start from the current verified `main` head.
2. Define one product or infrastructure boundary and list explicit exclusions.
3. Map every changed upstream and downstream connection before implementation.
4. Keep browser, server, GitHub, database, deployment, and runtime ownership explicit.
5. Add or update validation, failure, security, rollout, and rollback documentation with the code.
6. Run focused tests while developing.
7. Run the complete repository-required matrix on the exact final head.
8. Keep the pull request in draft while any required check is red, missing, stale, or unreadable.
9. Merge only the reviewed exact head.
10. Verify `main` after merge before beginning the next pull request.

## Pull-request contract

Every FlowCordia pull request must explain:

- the user or operator outcome;
- the exact trust boundary;
- what existing platform service is reused;
- what is deliberately excluded;
- schema, identity, authorization, idempotency, retry, timeout, and failure behavior;
- browser-visible and browser-hidden data;
- tests executed and their exact result;
- connected-environment validation that was completed;
- connected-environment validation that was not completed;
- rollout and rollback.

Do not describe repository-only tests as a live deployment proof.

## Architectural rules

- Git remains the governed history for workflow definitions, generated artifacts, reviews, releases, and rollbacks.
- Trigger.dev remains the execution foundation unless an accepted decision record replaces a subsystem.
- The browser never chooses tenant, installation, repository, branch, database identity, actor, credentials, deployment worker, or policy identity.
- Unreviewed repository code never executes inside the webapp process.
- Secrets are referenced, never embedded in workflow JSON, generated source, audit events, or browser projections.
- Unknown remote write outcomes are reconciled; they are not retried blindly.
- Unsupported runtime intent fails publication instead of being silently ignored.
- A feature flag is a rollout control, not proof that the feature works.

## Testing rules

At minimum, changed boundaries require:

- contract and validation tests;
- authorization and browser-redaction tests;
- stale identity and optimistic-concurrency tests;
- malformed, oversized, duplicate, and unknown-property tests where applicable;
- remote outage, rate-limit, timeout, and ambiguous-write behavior where applicable;
- deterministic serialization or compilation tests;
- production build and relevant end-to-end coverage;
- failure-oriented acceptance steps in a runbook.

Tests must prove the actual owning layer. A mock of the same implementation is not independent evidence.

## Documentation ownership

Update the relevant files under:

- `flowcordia/architecture/`
- `flowcordia/connections/README.md`
- `flowcordia/security/`
- `flowcordia/testing/`
- `flowcordia/runbooks/`
- `flowcordia/product/`

Documentation must describe delivered behavior, not intended behavior. Planned work belongs in the roadmap or capability matrix.

## Merge rules

Do not merge when:

- a required job failed, was cancelled, or did not run for the final head;
- the branch diverged from the reviewed parent unexpectedly;
- temporary diagnostics, generated logs, or formatter artifacts remain;
- a migration is not reproducible;
- a connected acceptance claim lacks evidence;
- the pull request mixes unrelated product boundaries;
- the rollback path is unknown.

After merge, confirm the new `main` commit and its required checks before stacking the next change.
