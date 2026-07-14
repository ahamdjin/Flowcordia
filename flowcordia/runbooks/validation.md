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

## Pull-request acceptance

- Required checks pass on the exact head SHA.
- Required checks start on GitHub-hosted runners when no Flowcordia runner variables are configured.
- Optional enterprise runner variables resolve to labels that are online and authorized for the repository.
- Zizmor completes with console results when `ENABLE_WORKFLOW_SECURITY_SCAN` is unset.
- When `ENABLE_WORKFLOW_SECURITY_SCAN=true`, GitHub Advanced Security is enabled and accepts the SARIF upload.
- No run-engine, supervisor, queue, database schema, Docker service name, or CLI behavior changed.
- The PR explains validation limitations when a check could not be executed.
