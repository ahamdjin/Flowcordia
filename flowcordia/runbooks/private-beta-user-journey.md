# Private beta standard-account author journey

This acceptance proves that a non-privileged Flowcordia account can author a real governed proposal through Studio. It does not replace the connected preview, promotion, production, or rollback acceptance workflows.

## Honest proof boundary

The browser verifies server-rendered assertions that the session is not a platform admin, has no super capability, and is not impersonated. The app cannot independently derive whether the human account is a maintainer of the connected GitHub repository, so non-maintainer status and zero intervention are explicit operator attestations in the evidence—not inferred facts.

A passing run also proves:

1. the browser reached the exact deployed application commit;
2. the connected workflow opened under the expected public workflow ID;
3. the account started or resumed a durable draft;
4. a bounded workflow-name edit advanced the draft version;
5. the edited draft passed structural preview with a non-sensitive fixture;
6. Studio published that draft as a governed proposal and returned bounded proposal, head, and pull-request identities.

The run does not approve, merge, deploy, execute live or production work, or roll back. Those authorities remain in the existing protected release-acceptance chain.

## Protected environment setup

Create a GitHub environment named `flowcordia-private-beta`, restrict deployments to `main`, and require the appropriate human reviewer. Store only these secrets:

- `FLOWCORDIA_PRIVATE_BETA_BASE_URL`: the deployed HTTPS origin;
- `FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON`: a non-sensitive structural input accepted by the reference workflow;
- `FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_B64`: base64 Playwright storage state for the dedicated standard account.

The dedicated account must not be a platform admin, must not have super capability, must not be impersonated, and must not maintain the connected reference repository. Give it only the Studio and GitHub-write permissions needed to author a proposal. Rotate the browser state as a credential and never attach it to evidence or logs.

The deployed webapp must set `FLOWCORDIA_APPLICATION_COMMIT_SHA` to its exact lowercase 40-character source commit. A run fails if the Studio route does not report the same commit supplied to the workflow dispatch.

## Reference workspace

Use a dedicated internal organization, project, repository, and workflow with no customer data. The repository must already satisfy repository readiness and contain a deterministic workflow that accepts the protected structural fixture. Start the first proof with no active draft. Use a unique replacement name that differs from the repository workflow and any resumed draft.

## Run procedure

Dispatch **Flowcordia private beta author journey** from `main` and provide:

- the relative Studio path ending in `/flowcordia/workflows`;
- the public workflow ID;
- the unique replacement name;
- the exact deployed application commit;
- `false` for repository-maintainer account;
- `0` for assistance count;
- the exact confirmation `STANDARD_NON_MAINTAINER_ZERO_INTERVENTION`.

After the run begins, a maintainer must not edit the repository, alter the draft, replace browser state, choose a different fixture, or take over the UI. If intervention occurs, stop and rerun with a nonzero assistance count; that run must fail configuration and cannot qualify.

## Evidence and recovery

The workflow uploads one JSON artifact containing public workflow/proposal identities, exact application commit, the three browser-observed identity booleans, operator attestations, fixed stage results, and durations. It excludes payloads, outputs, browser state, cookies, tokens, email, user IDs, tenant/project/repository database IDs, provider responses, screenshots, traces, video, stack traces, and raw exceptions.

The proposal is real and is intentionally not cleaned up by the harness. On success, use that exact proposal in the normal preview, validation, review, promotion, production, and rollback acceptance sequence. On failure, inspect and discard any remaining draft through the standard Studio UI before starting a clean rerun. Do not repair the proof by directly editing the repository.

Private-beta readiness cannot be claimed from repository CI alone. It requires one successful protected run against a real deployment and connected reference repository.
