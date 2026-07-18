# Exact-head function validation security boundary

## Trust model

Repository functions and fixtures are developer-owned executable material. Flowcordia may execute them only inside the exact Trigger.dev preview deployment built from a governed proposal head.

The Flowcordia webapp:

- resolves authorization and repository identity;
- rereads exact-head workflow and catalog documents;
- constructs a bounded suite;
- triggers the exact deployed task version;
- projects bounded status metadata;
- blocks promotion when proof is absent or failed.

It never imports, evaluates, transpiles, or executes repository source.

## Browser boundary

The browser cannot supply:

- organization, installation, repository, or branch identity;
- proposal ID;
- source path or export name;
- function schemas;
- fixture inputs or expected outputs;
- suite digest;
- worker or deployment version;
- runtime credentials.

The command accepts only workflow ID, expected head SHA, and request UUID. Every other identity is resolved again on the server.

## Exact-head proof

Suite construction fails closed unless the durable proposal, workflow document, and function catalog all resolve to the same exact head. Every workflow node must match its catalog function across function ID, path, export, input schema, and output schema.

Validation execution is locked to the worker version whose deployment commit equals that proposal head. Results from another branch, deployment, worker, proposal, workflow, head, or suite digest are ignored.

## Content integrity

The suite digest covers complete canonical fixture content. It is calculated server-side and independently recomputed inside the deployed task before repository code runs. A content mutation with a reused digest becomes `invalid_suite` and invokes no handler.

The suite is bounded to 200 cases and 256 KiB. Unknown fields, duplicate case identities, invalid JSON values, unsafe IDs, malformed object IDs, and digest mismatches are rejected.

## Result boundary

Task metadata contains only:

- schema version;
- workflow, proposal, head, and suite identities;
- running/passed/failed state;
- pass/fail counts;
- function ID, fixture ID, status, and bounded failure code;
- update timestamp.

It excludes fixture input, expected output, actual output, repository source, stack traces, exception messages, credentials, installation tokens, and arbitrary metadata. The browser projector rejects unknown properties, oversized payloads, duplicate cases, inconsistent counts, malformed timestamps, and identity mismatches.

## Promotion boundary

The canonical promotion command resolves the durable proposal and invokes the same validation read model used by Studio before GitHub policy evaluation or merge mutation begins. Promotion is permitted only when validation is `PASSED` or the exact proposal workflow contains no typed repository functions and is therefore `NOT_REQUIRED`.

A failed, queued, running, stale, unavailable, malformed, or missing validation result blocks promotion.

## Failure handling

- GitHub read failures preserve proposal state and expose bounded retryability.
- Missing fixtures block validation and promotion without executing code.
- Missing deployment or task discovery remains retryable only where recovery is possible.
- Repository exceptions become `execution_failed`; private exception text stays in inherited runtime logs.
- Metadata observer failure cannot change case execution results.
- A terminal task run without trustworthy metadata is treated as failed, never passed.
