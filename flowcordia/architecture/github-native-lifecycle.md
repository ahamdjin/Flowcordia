# GitHub-native lifecycle

GitHub is not merely an import/export integration. It is Flowcordia's review, history, and release boundary.

## Change lifecycle

1. A visual builder starts a draft from an approved base commit.
2. Flowcordia creates or updates an isolated branch.
3. The normalized workflow document and generated artifacts are committed together.
4. Checks validate schema, compiler determinism, types, tests, policy, and secret leakage.
5. A pull request shows visual and code diffs.
6. CODEOWNERS and branch protection determine approval.
7. A preview deployment is tied to the pull request head SHA.
8. Merge selects the reviewed commit as the release candidate.
9. Promotion ties the production runtime version to that exact commit.
10. Rollback selects an earlier reviewed commit and its compatible deployment.

## GitHub primitives to use

- GitHub App installations for organization-controlled repository access.
- Branches and commits for change isolation and immutable history.
- Pull requests for review and collaboration.
- Checks for validation and policy results.
- Deployments and environments for preview and promotion state.
- CODEOWNERS and protected branches for enterprise approval rules.

## Security rules

- Request the minimum GitHub App permissions needed for each phase.
- Never commit credentials, tokens, decrypted environment values, or connection payloads.
- Validate webhook signatures before accepting events.
- Store delivery IDs and make event processing idempotent.
- Do not claim automatic GitHub deployment until the webhook-to-deployment path is implemented and tested.

