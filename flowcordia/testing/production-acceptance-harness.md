# Production acceptance harness

## Purpose

The protected **Flowcordia production acceptance** workflow executes the existing authenticated Studio production command and preserves bounded proof for one exact promoted version. It does not call Trigger.dev or a deployment provider directly.

Run it once in `production` mode after normal promotion and again in `rollback_production` mode after the governed rollback proposal has been reviewed, promoted, and deployed.

## Required identity

The operator supplies:

- exact deployed Flowcordia application commit;
- workflow and merged proposal public IDs;
- proposal head and merge commit;
- authoritative production deployment version;
- immutable promoted closure digest;
- exact promoted closure workflow count between 1 and 100;
- mode-specific destructive confirmation.

The browser must observe all of those values on the authenticated Studio route and production proof panel before it can execute. `production` requires `EXECUTE_EXACT_FLOWCORDIA_PRODUCTION_ACCEPTANCE`; `rollback_production` requires `EXECUTE_EXACT_FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE`.

## Protected environment

Configure `flowcordia-production-acceptance` with required reviewers and branch restrictions. Store only:

- `FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL`;
- `FLOWCORDIA_PRODUCTION_ACCEPTANCE_STORAGE_STATE_B64` for a least-privilege production acceptance operator;
- `FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON`, containing a non-sensitive, deterministic, idempotent fixture.

The storage state, payload, browser output, and temporary directory are never uploaded. Traces, screenshots, videos, retries, and HTML reports are disabled.

## Proof boundary

The harness waits for a new run friendly ID, rejects a previously displayed run, and requires:

- the same proposal head and merge commit after execution;
- the same authoritative deployment commit and version;
- closure state `READY` before and after execution;
- the exact immutable closure digest;
- installed task count equal to the expected closure workflow count;
- terminal status `COMPLETED_SUCCESSFULLY`;
- trusted node proof `VERIFIED`.

Schema `0.2` evidence contains only immutable application, proposal, deployment, closure state/digest/counts, and public run identity. The writer rejects payloads, outputs, secrets, browser state, headers, actor or policy identity, internal installation, worker or database IDs, provider data, stack traces, and raw errors. Any application or workflow identity change requires a new acceptance run.
