# GitHub proposal connections

| Source | Target | Contract | Why | Failure owner |
| --- | --- | --- | --- | --- |
| Flowcordia proposal API | Tenant/project authorization | Actor, tenant, project, installation, repository, base branch, operation | Prevent cross-tenant confused-deputy access before credentials resolve. | API rejects without invoking GitHub. |
| Proposal service resolver | Existing installation Octokit factory | Authorized access scope | Reuse credential rotation and avoid a second token path. | Resolver returns a sanitized access/unavailable failure. |
| `GitHubProposalService` | `@flowcordia/github-workflows` | Proposal-branch scope, desired workflow, expected base blob, mutation context | Preserve canonical validation and lost-update protection. | Workflow store returns structured workflow/conflict/ambiguous errors. |
| `GitHubProposalService` | `@flowcordia/runtime` | Canonical workflow to deterministic Trigger.dev task source | Ensure a proposal cannot be opened for visual intent that has no reviewable executable form. | Compiler rejects unsupported topology, configuration, inline secrets, and missing code references. |
| `GitHubProposalService` | Generated artifact store | `trigger/flowcordia/<workflow>.ts` on the deterministic proposal branch | Review and promote executable source with the visual workflow definition while keeping it discoverable by Trigger.dev builds. | Resume verifies exact generated source; mismatches fail as proposal collisions. |
| Proposal service | Git branch refs | Deterministic branch and exact base commit | Make creation addressable, resumable, and auditable. | Service reconciles once by safe read, then stops or reports ambiguity. |
| Proposal service | GitHub pull requests | Exact base/head mapping, generated metadata, draft state | Put non-developer changes into the native review system. | GitHub rules are authoritative; service rejects collisions. |
| Policy evaluator | Pull-request snapshot | Current head, reviews, checks, statuses, mergeability | Give Studio deterministic blockers without mutation authority. | Evaluator fails closed with structured blocker codes. |
| Proposal service | GitHub ready-for-review mutation | PR number and expected head | Separate editing from review/promotion. | Service re-reads after uncertain outcome. |
| Proposal service | GitHub merge API | PR number, expected head SHA, approved merge method | Prevent reviewed-content substitution and preserve repository policy. | GitHub may decline; service never bypasses. |
| Proposal receipt | Durable audit outbox | Actor, correlation, proposal/PR/commit identities, outcome | Make success and recovery traceable beyond request memory. | API transaction persists; outbox worker delivers at least once. |
| GitHub webhooks | Proposal projection | Signed delivery, installation/repository/PR/head state | Keep enterprise UI and scheduling current without fleet-wide polling. | Webhook worker deduplicates and reconciles gaps. |
| Proposal projection | Studio | Searchable state and blockers with last-observed timestamp | Bridge GitHub concepts into a non-developer workflow experience. | Studio shows staleness; promotion still reads GitHub directly. |

The durable proposal record, not the pull-request body marker or webhook projection, is the product source of proposal identity. GitHub remains the source of repository and merge truth.
