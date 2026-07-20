# Connected acceptance harness

## Purpose

Run a real authenticated browser against an already configured Flowcordia environment and produce bounded evidence for one connected boundary. This workflow is separate from pull-request CI because local fixtures cannot prove GitHub App permissions, an exact repository head, a preview deployment, or a deployed Trigger.dev task.

## CI and evidence authority

Pull-request checks validate the harness implementation, browser contract, formatting, builds, and local test fixtures only. They never count as connected acceptance. Only a protected manual `workflow_dispatch` run against the configured environment can create connected evidence, and that evidence remains scoped to the exact mode, workflow, and proposal head recorded in its artifact.

## Modes

### `readiness`

Proves that the configured Studio route is authenticated, connected to the expected workflow, and returns repository readiness `READY` with zero blocked or unavailable checks.

### `structural`

Includes readiness and requires an existing current writable draft. It submits a protected JSON payload through the first-class structural-preview command and requires a passing structural result. Repository code is not executed.

### `preview`

Includes readiness and requires an existing `READY` proposal deployment at one operator-supplied 40-character head SHA. It submits a protected JSON payload through the exact-head live-run command and waits for:

- preview state `READY`;
- the same proposal head before and after execution;
- run status `COMPLETED_SUCCESSFULLY`;
- trusted rollout proof `VERIFIED`.

This harness does not create or mutate a draft, publish a proposal, approve or promote a proposal, execute production, or roll back production. Those remain separate mandatory release evidence.

## Protected environment

The manual workflow uses the GitHub environment `flowcordia-acceptance`. Configure:

- `FLOWCORDIA_ACCEPTANCE_BASE_URL`: HTTPS origin only;
- `FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_B64`: base64-encoded Playwright storage state for a dedicated acceptance account;
- `FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON`: protected payload for structural or preview mode.

The workflow inputs provide the relative Studio path, exact workflow ID, mode, exact deployed application commit, and exact proposal head for preview mode. The application commit must match `FLOWCORDIA_APPLICATION_COMMIT_SHA` rendered by the authenticated deployment.

The acceptance account should have only the organization, GitHub, draft-write, and task-trigger permissions required by the chosen mode. Environment reviewers and branch restrictions should protect execution.

## Secret boundary

- browser storage state is decoded into a mode-`0600` file inside a mode-`0700` temporary directory;
- storage state is never committed, echoed, uploaded, or rewritten;
- payload JSON is passed only through the process environment and browser form;
- traces, screenshots, videos, HTML reports, and Playwright retries are disabled;
- browser session storage is cleared before the test exits;
- the temporary directory is removed on success or failure;
- only the sanitized evidence JSON is uploaded.

## Evidence schema

Evidence schema `0.1` contains only:

- mode, result, stage, workflow ID, deployed application commit, and timestamps;
- readiness state, counts, and bounded repository coordinates;
- structural pass status; or
- preview head, deployment version, public run ID, terminal status, and proof.

It cannot represent payloads, outputs, cookies, tokens, storage state, headers, internal IDs, provider responses, stack traces, screenshots, or raw exceptions. Failure messages are fixed by acceptance stage.

## Stable browser contract

Connected acceptance uses explicit `data-testid` and bounded `data-*` attributes on:

- connected Studio route state;
- repository readiness and counts;
- selected workflow, draft presence, preview head, deployment version, run status, and proof;
- testing mode, advanced JSON input, run command, and structural result.

These attributes expose only values already present in the bounded browser projection. They do not bypass route authorization or add server data.

## Invocation

Run **Flowcordia connected acceptance** manually and choose:

1. the mode;
2. the relative Studio path;
3. the exact public workflow ID;
4. the exact deployed application commit;
5. the exact proposal head for preview mode.

A failed run must be treated as failed evidence. Do not rerun with a different head and attach the newer artifact to the older proposal.

## Negative acceptance

The harness must fail closed when:

- authentication redirects away from Studio;
- Studio is not connected;
- the deployed application commit is absent or differs from the operator-supplied commit;
- the selected workflow differs from the requested workflow;
- readiness is blocked or unavailable;
- structural mode has no current writable draft;
- preview is not `READY`;
- the proposal head differs from the operator-supplied head;
- live execution finishes without trusted node evidence;
- the run is not successful;
- required protected configuration is missing or malformed.

## Rollback

Revert the harness commit. No database schema, repository content, proposal state, deployment state, run state, secret value, or production state is changed by installing or removing the harness.
