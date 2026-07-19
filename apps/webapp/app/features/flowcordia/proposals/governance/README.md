# Proposal governance webapp boundary

This folder connects a repository-scoped policy to the existing proposal workspace and canonical promotion command. It does not replace GitHub rules, execute repository code, or introduce a merge bypass.

| File | Connects | Why |
| --- | --- | --- |
| `types.ts` | Repository/service errors and durable record shape | Keep failure codes explicit and exhaustively mapped at resource boundaries. |
| `repository.server.ts` | Authorized repository scope to raw governance/audit tables | Own integrity, optimistic concurrency, monotonic writes, and atomic audit. |
| `service.server.ts` | Default or stored profile to the immutable effective policy | Give reads and promotion one resolved contract. |
| `audit.server.ts` | Promotion request to exact policy-selection proof | Bind actor, correlation, proposal, head, policy version, and digest before GitHub evaluation. |
| `correlation.server.ts` | Parent request identity to bounded child operation identity | Preserve traceability without exceeding durable column limits. |
| `commands.server.ts` | Authorized resource request to policy service | Enforce strict body limits and return bounded errors. |
| `presentation.ts` | Stored policy, GitHub snapshot, and function validation to browser DTO | Explain selected exact-head evidence without granting authority or exposing scope. |
| `ProposalGovernancePanel.tsx` | Browser DTO to policy editor and evidence view | Help operators distinguish action, wait, and outage states. |
| `presentation.test.ts` | Review/check/validation combinations to evidence states | Keep UI semantics aligned with the pure promotion evaluator. |

The route and workspace composition live outside this folder so dashboard authorization and page layout remain owned by their established boundaries. See `flowcordia/architecture/proposal-governance.md` for the end-to-end contract.
