# Governed repository source patch rollout

## Preconditions

- The existing Flowcordia proposal control plane, GitHub App binding, proposal worker, workflow store, and proposal workspace are healthy.
- The deployment uses the repository-pinned Node and pnpm versions.
- A connected test repository contains one canonical workflow, its generated task path, and at least one JavaScript or TypeScript source file that is safe to modify.
- The operator can inspect the created proposal branch and draft pull request directly in GitHub.

## Validation sequence

1. Deploy with no browser code-editing surface enabled. The gateway remains backward compatible because absent source patches validate as an empty set.
2. Create a normal workflow-only proposal and prove its branch, pull request, generated artifact, preview preparation, and proposal receipt remain unchanged.
3. Create a proposal containing one existing-file source patch with the exact base blob SHA.
4. Confirm the draft pull request contains the workflow JSON, generated Trigger.dev artifact, and source change on the same deterministic proposal branch.
5. Retry the same proposal identity and confirm no duplicate source write occurs.
6. Create a two-file proposal, interrupt after the first write in a controlled test, retry, and confirm the completed file is not rewritten while the second file is completed.
7. Change the base source file before proposal creation and confirm the stale blob fails closed.
8. Attempt creation of a new file where one already exists and confirm the `null` expected blob fails closed.
9. Inject an ambiguous write response in the adapter test and confirm success occurs only when exact content is visible afterward.
10. Mutate a requested source file before final-head verification and confirm the proposal returns conflict rather than success.
11. Confirm protected paths, unsupported extensions, oversized files, duplicate paths, malformed UTF-8, and unknown properties are rejected.
12. Submit, build, and deploy the exact proven proposal head through the existing preview path. Do not execute source in the webapp process.

## Operating signals

Observe:

- source patch validation failures by issue code;
- stale-blob and unexpected-existence conflicts;
- ambiguous writes and reconciliation outcomes;
- final-head verification failures;
- GitHub permission, rate-limit, and availability errors;
- proposal creation latency as file count and aggregate bytes increase.

Do not log source text, full patch payloads, GitHub tokens, installation credentials, raw provider bodies, or unbounded paths.

## Rollback

The runtime rollback is to route proposal creation directly through `GitHubProposalService.create` again. No database migration or runtime drain is required. Existing proposal branches remain normal Git branches and pull requests; they can be reviewed, closed, or reverted through GitHub.

Do not delete a proposal branch automatically when a partial source publication exists. Preserve it for inspection, then close or revert it deliberately after confirming no required review evidence will be lost.
