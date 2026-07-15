# Validation runbook

## Documentation and schema

1. Validate Markdown links and Mermaid syntax during review.
2. Validate every JSON document against its declared schema.
3. Validate `specs/workflow.schema.json` as JSON Schema Draft 2020-12.
4. Confirm the connection registry reflects every changed component.

## Web application foundation

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck --filter webapp
pnpm run test --filter webapp -- --run
pnpm run lint --filter webapp
```

## Setup-status manual test

1. Start the existing core Docker services.
2. Start the webapp from the feature branch.
3. Sign in and open the hidden organization setup URL directly.
4. Confirm only presence/missing status appears; no secret value may be present in HTML or loader data.
5. Confirm the general email test is disabled or returns a safe error when configuration is incomplete.
6. With a test transport, send one message and confirm it targets only the signed-in user.
7. Confirm unexpected failures are logged server-side and return a generic user-facing message.

## Proposal workspace manual test

1. Follow `proposal-workspace-rollout.md` with the global flag off and one organization override enabled.
2. Confirm direct routes recheck feature access and GitHub read permission, and command routes recheck GitHub write permission.
3. Inspect loader and successful command payloads for the documented browser DTO; no internal scope, credential, actor, correlation, version, workflow content, or raw provider error may appear.
4. Confirm filters reset pagination, each page is at most 50 records, and the selected proposal remains within the loaded page.
5. Prove `DRAFT -> submit`, `READY -> promote`, and no action for missing head, reconciliation, failure, or terminal states.
6. Prove a stale expected head and unsatisfied GitHub policy fail without an automatic mutation retry.
7. Confirm disabling the Studio flag removes navigation and direct access without changing the internal proposal API, worker, deployment, or runtime behavior.

## Pull-request acceptance

- Required checks pass on the exact head SHA.
- Required checks start on GitHub-hosted runners when no Flowcordia runner variables are configured.
- Optional enterprise runner variables resolve to labels that are online and authorized for the repository.
- Zizmor completes with console results when `ENABLE_WORKFLOW_SECURITY_SCAN` is unset, ignores informational-only advice, and blocks low-or-higher findings.
- When `ENABLE_WORKFLOW_SECURITY_SCAN=true`, GitHub Advanced Security is enabled and accepts the SARIF upload.
- No run-engine, supervisor, queue, database schema, Docker service name, or CLI behavior changed.
- The PR explains validation limitations when a check could not be executed.
