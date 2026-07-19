# Proposal governance security boundary

## Trust model

GitHub is authoritative for repository identity, pull-request state, reviews, checks, branch protection, repository rules, and merge outcome. Flowcordia owns an additive fail-closed policy, durable proposal identity, exact-head validation proof, and audit correlation.

The Studio panel is not an authorization boundary. Every read and write rechecks the dashboard session, project permission, Studio rollout access, connected repository binding, and GitHub installation status on the server.

## Policy mutation boundary

The browser submits only a strict governance profile and expected public version. Unknown properties, oversized bodies, malformed UTF-8/JSON, invalid reviewer IDs, duplicate or oversized lists, and inconsistent approval constraints are rejected.

The ordinary policy resource accepts strengthening only. It cannot lower approval count, remove required checks/reviewers, remove an allowlist, or expand an allowlist. The immutable application floor cannot be edited at all. No application-side promotion bypass is introduced.

## Exact-head boundary

Workspace evidence binds the selected durable proposal to its expected base branch, proposal branch, PR number, and head SHA. Approvals count only under the effective current-head/self-approval rules. Required checks are selected only from the expected head.

Promotion does not trust loader evidence. It re-resolves scope, requires exact-head function validation, selects and audits an unchanged policy row, and asks the proposal service to fetch fresh GitHub evidence and merge with the expected SHA. A head, branch, policy, review, check, validation, or mergeability change fails closed.

## Data disclosure

Browser projections may include public policy UUID/version/digest, bounded reviewer numeric IDs, required check names, safe blocker codes/messages, exact head, and bounded validation state. They exclude installation credentials, tenant and database IDs, actor IDs, correlation IDs, raw provider responses, source, fixture values, outputs, secrets, and stack traces.

Audit payloads contain policy identity/digest and bounded counts rather than workflow content or credentials. Correlation values are bounded before persistence.

## Administrative recovery

A mistaken strengthening cannot be relaxed through the repository-writer resource. Until a dedicated privileged, dual-controlled, separately audited exception workflow exists, recovery requires an operator-reviewed database/runbook intervention or reverting the unmerged feature. Do not add a hidden UI or API bypass.
