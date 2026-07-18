# Exact-head repository function validation

## Purpose

Flowcordia executes repository-owned typed-function fixtures only after the governed proposal head has been built by the existing Trigger.dev preview deployment. The webapp prepares identity and reads results; it never imports or executes repository source.

```text
exact active proposal head
  -> exact workflow and function catalog reread
  -> node / function / path / export / schema proof
  -> server-owned fixture suite
  -> canonical SHA-256 suite identity
  -> exact proposal preview deployment and worker version
  -> generated flowcordia-validate-<workflow-id> task
  -> real repository function execution
  -> input, output, and expected-output validation
  -> status-only TaskRun metadata
  -> Studio projection and promotion gate
```

## One build and runtime boundary

The deterministic compiler emits two Trigger.dev tasks in the same generated module:

- `flowcordia-<workflow-id>` executes the reviewed workflow;
- `flowcordia-validate-<workflow-id>` executes the reviewed function fixtures.

Both tasks use the same static repository imports and the same generated typed handler wrappers. The validation task is discovered by the same connected GitHub preview build and runs on the exact deployed worker version. Flowcordia does not create a second CI system, deployment service, queue, worker, or customer-code runtime.

## Suite construction

The browser submits only:

- workflow ID;
- expected proposal head SHA;
- one request UUID.

The server resolves the active durable proposal and rereads the workflow plus `.flowcordia/functions.json` at that exact head. For every typed function used by the workflow, it proves:

- function ID;
- repository source path;
- export name;
- input schema;
- output schema;
- repository fixture ID and input identity.

Every used typed function must have at least one valid repository fixture. Functions and fixtures are sorted deterministically. The suite is limited to 200 cases and 256 KiB of serialized JSON.

## Suite identity

The suite digest is a SHA-256 over the canonical JSON representation of:

- schema version;
- workflow ID;
- proposal ID;
- exact head SHA;
- complete ordered fixture cases, including input and expected output.

The server computes the digest before triggering. The deployed runtime recomputes it before any repository handler is invoked. A caller cannot preserve a valid digest while changing fixture content.

## Execution contract

For each case, the validation runtime:

1. proves the deployed function registry contains the requested function ID;
2. validates fixture input against the reviewed input schema;
3. validates expected output against the reviewed output schema;
4. executes the real statically imported repository handler;
5. converts its result to bounded JSON;
6. validates actual output against the reviewed output schema;
7. compares actual and expected output through canonical JSON equality.

Cases execute sequentially. Results contain only function ID, fixture ID, pass/fail status, and a bounded failure code. Repository exception messages, stack traces, fixture values, source, outputs, and credentials are not returned.

## Read model and promotion

Studio and promotion use the same exact-head validation query. A run is considered passed only when all of these agree:

- project and preview environment;
- proposal ID and exact head SHA;
- validation task ID;
- exact deployed worker version;
- canonical suite digest;
- trustworthy status-only metadata;
- `TaskRun` terminal status `COMPLETED_SUCCESSFULLY`;
- passed count equals the complete suite case count;
- failed count is zero.

Promotion is allowed only for `PASSED` or `NOT_REQUIRED`. A new proposal head or fixture change necessarily creates a different suite identity and invalidates prior evidence.

## Deliberate limits

This slice does not execute arbitrary repository commands, package scripts, test runners, or browser-provided expected outputs. It does not attach a GitHub check run yet; proposal-head validation is enforced by the Flowcordia promotion command. Broader GitHub policy/check integration remains a later governance slice.
