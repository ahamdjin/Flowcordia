# Proposal governance connections

| Source | Target | Contract | Why | Failure owner |
| --- | --- | --- | --- | --- |
| Proposal workspace loader | Durable governance policy | Authorized project/repository scope | Display the effective repository policy without browser-supplied identity. | Loader returns a bounded unavailable state. |
| Proposal workspace loader | GitHub snapshot reader | Selected PR number, expected proposal head, authorized installation | Explain current reviews, checks, mergeability, and branch identity. | GitHub reader; promotion remains disabled. |
| Proposal workspace loader | Function validation read model | Workflow, proposal, and exact head | Keep repository-code proof visible beside GitHub proof. | Validation read model; other GitHub evidence remains visible. |
| Studio governance panel | Governance resource command | Expected policy version and strict profile only | Allow authorized repository writers to strengthen policy. | Command returns bounded validation, weakening, conflict, or unavailable errors. |
| Governance resource command | Policy repository | Server-derived tenant, project, installation, repository, actor, and correlation | Prevent confused-deputy scope selection and lost updates. | Repository transaction rolls back atomically. |
| Policy repository | Governance audit table | Public policy identity, version, digest, bounded counts, actor, correlation | Preserve change provenance without storing workflow or secret payloads. | Transaction fails; policy write does not commit. |
| Promotion command | Function validation gate | Proposal ID and expected head | Reject stale, absent, failed, or untrusted repository-code proof. | Gate blocks before GitHub merge mutation. |
| Promotion command | Governance policy-selection audit | Exact policy ID, version, digest, proposal, head, actor, correlation | Prove which immutable policy snapshot governed the attempt. | Audit mismatch or write failure blocks promotion. |
| Proposal service | Fresh GitHub snapshot and merge API | Effective policy, durable proposal identity, expected head, merge method | Re-evaluate authority immediately before exact-head promotion. | Proposal service returns structured safe failure; GitHub remains final authority. |

The browser never supplies tenant, project, installation, repository, policy ID, actor, correlation, creator reviewer identity, or effective enterprise-floor flags. The selected proposal query parameter is resolved only inside the authorized repository scope.
