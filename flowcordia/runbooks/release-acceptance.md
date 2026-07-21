# Connected release acceptance

This procedure proves the complete FlowCordia path in a real configured environment. Repository CI does not replace it.

## Scope

The acceptance run covers:

```text
browser Studio
  -> durable draft
  -> deterministic workflow and generated task
  -> governed GitHub pull request
  -> exact-head preview deployment
  -> version-locked execution
  -> trusted canvas evidence
  -> exact-head function validation
  -> policy-governed promotion
  -> production execution
  -> rollback
```

Use a dedicated internal organization, project, and reference repository. Do not run the first acceptance against customer data or credentials.

## Preconditions

1. Deploy the exact FlowCordia application commit being accepted.
2. Apply all required database migrations.
3. Configure the existing authentication, database, GitHub App, object storage, email, and Trigger.dev runtime dependencies.
4. Set `FLOWCORDIA_APPLICATION_COMMIT_SHA` to the exact lowercase 40-character commit used to build the deployed web application.
5. Keep global Studio access disabled and enable one internal organization override.
6. Connect the reference repository and configure its production branch.
7. Enable GitHub preview deployments for the project.
8. Confirm `trigger.config.ts` discovers `trigger/flowcordia`.
9. Use non-sensitive fixtures and environment-bound test credentials.
10. Confirm the operator has GitHub write, task trigger, and proposal promotion permissions required by the test.
11. Record the application head before any mutation.

## Reference repository requirements

The repository must contain:

- one canonical workflow under `.flowcordia/workflows/`;
- one typed repository function in `.flowcordia/functions.json`;
- at least one executable fixture for that function;
- a valid Trigger.dev configuration;
- an HTTP test target that is safe, deterministic, and idempotent;
- no production secret embedded in workflow or fixture content.

## Release reference workflow

The exact preview proposal used for release assembly must contain at least one approved `action.http` node, one `data.map` node, and one credential reference whose selected protected environment status is `READY`. The connected browser records only positive counts; reference names, environment keys, header names, and values remain excluded from evidence.

## Verification boundary

The schema `0.2` evidence boundary has passed deterministic transformation, formatting, connected acceptance contract tests, release-manifest and assembly tests, Playwright test discovery, Prisma generation, the FlowCordia workflow-package build, and the full monorepo typecheck on one exact branch head. Temporary validation workflows, scripts, and diagnostics are excluded from review.

These checks prove the harness and mixed-version manifest contract. They do not prove a connected deployment. Release evidence is valid only after a protected environment produces a real preview artifact for the exact application commit, proposal head, verified run, and positive HTTP, mapping, and ready-credential counts.

## Acceptance sequence

### 1. Synchronize and inspect

1. Open FlowCordia Studio through the authenticated project environment.
2. Synchronize the connected production branch.
3. Confirm the observed commit equals the repository production head.
4. Confirm the workflow is valid and the graph matches repository content.
5. Inspect loader data and confirm it excludes configuration values, credentials, installation identity, database IDs, and raw provider errors.

### 2. Author a durable draft

1. Start editing the workflow.
2. Move and rename one visual node.
3. Add one supported first-party node and connect it.
4. Add the repository function from the exact-commit catalog.
5. Leave and reopen Studio; confirm the same active draft resumes.
6. Push an unrelated repository commit and confirm the draft is not silently rebased.
7. Restore the expected source state or explicitly discard and restart as required.

### 3. Test before publication

1. Run a structural preview with a repository fixture.
2. Confirm repository code does not execute in structural mode.
3. Confirm downstream schema-shaped output and traces are bounded and useful.
4. Submit malformed input and confirm field-level validation blocks execution.
5. Submit a secret-like value and confirm it is not retained in browser session storage.

### 4. Publish the governed proposal

1. Publish the exact durable draft version.
2. Confirm the proposal branch contains both:
   - `.flowcordia/workflows/<workflow-id>.json`;
   - `trigger/flowcordia/<workflow-id>.ts`.
3. Confirm the pull request is a draft and identifies the expected base and proposal head.
4. Confirm the workflow digest and generated artifact are deterministic on a repeated local or CI compile.
5. Confirm no source patch targets workflow, generated, control, or GitHub workflow paths outside the allowed boundary.
