# Studio publication rollout

1. Deploy with existing Flowcordia Studio and proposal feature flags disabled.
2. Build all Flowcordia packages and apply the existing proposal/index/draft migrations.
3. Enable Studio for one internal organization with a connected test repository.
4. Synchronize one canonical workflow using only the bounded first-party operations.
5. Start a draft, change a visual-owned node, and run the safe preview.
6. For a condition node, connect explicit true and false branches and verify only the matching path runs while the original payload continues downstream.
7. Confirm no HTTP request, wait, customer code, deployment, or run occurs during preview.
8. Publish the exact draft version and verify the proposal branch contains workflow JSON and generated task TypeScript under `trigger/flowcordia/`.
9. For an authenticated HTTP node, bind its deterministic `FLOWCORDIA_CREDENTIAL_*` environment value to a JSON headers object and confirm the generated source contains only the environment name.
10. Confirm the pull request is draft, the proposal workspace shows it, and current-head checks govern submission and promotion.
11. Retry the same publication request and verify it resumes the same proposal identity.
12. Change the repository base and verify stale publication fails closed.

Rollback disables Studio access. Existing proposal branches, pull requests, deployments, and runs remain auditable. Disable GitHub preview deployments or close the pull request to stop further preview builds; no runtime-engine drain is required.
