# Repository readiness rollout

## Preconditions

1. Deploy with Flowcordia Studio still limited to an internal organization.
2. Connect one dedicated GitHub repository and configure its production branch.
3. Ensure the GitHub App installation is active.
4. Keep preview deployments disabled until the probe is visible to the rollout operator.

## Acceptance

1. Open Flowcordia Studio and run **Check readiness**.
2. Confirm the browser request contains only `{ "operation": "check" }`.
3. Confirm the repository identity and immutable head match the connected production branch.
4. Confirm contents write, pull-request write, and checks read permissions pass.
5. Confirm at least one canonical workflow path is discovered.
6. Synchronize the repository and confirm every indexed workflow belongs to the same head and is
   valid.
7. Confirm `trigger.config.ts` is readable.
8. With no explicit `dirs`, confirm default task discovery passes.
9. With explicit `dirs`, confirm `trigger` or `trigger/flowcordia` is required.
10. Enable preview deployments and confirm the final blocked check becomes passed.
11. Inspect the response and rendered HTML for tokens, installation IDs, database IDs, provider
    request IDs, raw errors, workflow content, and configuration source. None may appear.
12. Continue with `preview-deployment-rollout.md`; readiness alone is not execution proof.

## Failure exercises

- Suspend or remove the installation and confirm the probe blocks.
- Remove contents write, pull-request write, or checks read permission and confirm the exact
  permission blocks.
- Point branch tracking at a missing branch and confirm branch/workflow checks block.
- Add a dynamic `dirs` expression and confirm generated task discovery blocks.
- Exclude `trigger/flowcordia` from a static `dirs` list and confirm it blocks.
- Change the production head without synchronizing and confirm the durable index blocks.
- Disable preview deployments and confirm no other passed check hides that blocker.
- Return a transient GitHub failure and confirm the overall state is unavailable, not ready.

## Rollback

Remove the panel and resource route. No migration, durable row cleanup, worker drain, GitHub mutation,
or runtime rollback is required.
