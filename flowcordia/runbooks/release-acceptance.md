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
4. Keep global Studio access disabled and enable one internal organization override.
5. Connect the reference repository and configure its production branch.
6. Enable GitHub preview deployments for the project.
7. Confirm `trigger.config.ts` discovers `trigger/flowcordia`.
8. Use non-sensitive fixtures and environment-bound test credentials.
9. Confirm the operator has GitHub write, task trigger, and proposal promotion permissions required by the test.
10. Record the application head before any mutation.

## Reference repository requirements

The repository must contain:

- one canonical workflow under `.flowcordia/workflows/`;
- one typed repository function in `.flowcordia/functions.json`;
- at least one executable fixture for that function;
- a valid Trigger.dev configuration;
- an HTTP test target that is safe, deterministic, and idempotent;
- no production secret embedded in workflow or fixture content.

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

### 5. Prove preview deployment and live execution

1. Confirm the connected GitHub integration creates exactly one preview deployment for the proposal head.
2. In Studio, confirm preview state moves through waiting/deploying to ready.
3. Confirm the displayed head and deployment version match the provider records.
4. Start a live preview with a non-sensitive payload.
5. Confirm the run is locked to the exact deployed worker version.
6. Confirm proposal ID, workflow ID, head SHA, worker lock, and idempotency namespace all agree.
7. Confirm a newer unrelated run cannot replace the proposal run.
8. Confirm trusted node states appear on the canvas.
9. Confirm proof becomes `VERIFIED` only after successful terminal execution with trustworthy node evidence.
10. Complete a correlated run without trustworthy node metadata and confirm proof becomes `FAILED`, not verified.

### 6. Prove repository-function validation

1. Start the exact-head validation suite from Studio.
2. Confirm every typed function used by the workflow has an executable fixture.
3. Confirm the suite digest matches the exact proposal workflow, function catalog, fixture inputs, and expected outputs.
4. Confirm the deployed validation task executes the real repository handler.
5. Confirm invalid output, thrown exception, missing function, and expected-output mismatch produce bounded failure codes without source, values, outputs, stack traces, or exception text.
6. Confirm promotion remains blocked until validation is `PASSED` or `NOT_REQUIRED`.

### 7. Prove governance and promotion

1. Save or select the repository governance policy.
2. Confirm the immutable application floor remains enforced.
3. Strengthen the policy and confirm an ordinary writer cannot weaken it.
4. Add the required current-head approvals and checks.
5. Confirm dismissed approvals and approvals for an older head do not count.
6. Promote from FlowCordia.
7. Confirm promotion records the unchanged policy ID, version, digest, proposal, exact head, actor, and bounded correlation identity.
8. Confirm the service fetches fresh GitHub evidence and merges only the expected head.
9. Confirm GitHub repository rules remain final authority.

#### Protected promotion evidence

After the exact proposal is `READY`, function validation and governance are satisfied, and required approvals/checks are present, the manual **Flowcordia governed promotion acceptance** workflow may execute the existing **Verify and promote** UI command for the dedicated reference repository. Its artifact proves only the policy-governed merge. Production execution and rollback remain steps 8 and must use a separate acceptance record.

### 8. Prove production and rollback

1. Confirm the merged commit reaches the production deployment path.
2. Trigger the production workflow through its supported authenticated entry point.
3. Confirm schedule bindings are active only in production and proposal preview did not fire them.
4. Confirm the production run uses the promoted workflow version.
5. Revert or promote the preceding known-good commit through the governed path.
6. Confirm the previous workflow and deployment become authoritative.
7. Confirm existing run history and audit evidence remain available.

## Failure matrix

The run must also prove:

- stale draft version;
- stale proposal head;
- missing trigger permission;
- GitHub outage or rate limit;
- preview deployment disabled;
- generated task not discovered;
- malformed run metadata;
- mismatched worker lock;
- invalid fixture or suite digest;
- policy version changed during promotion;
- branch protection or repository rules reject merge;
- database or provider failure does not become a false success.

## Sanitized evidence record

Create a release evidence file outside application runtime state, then commit only a sanitized summary after review.

The summary must contain immutable references and pass/fail results, but must not contain:

- payloads or outputs;
- fixture values or expected values;
- API keys, access tokens, cookies, or credential headers;
- installation, environment, worker, run, or database internal IDs;
- generic provider metadata;
- raw errors, stack traces, or exception text.

## Acceptance decision

The release is accepted only when every required step passes on one unchanged application head and one exact proposal head. Any rerun after a code change starts a new acceptance record.
