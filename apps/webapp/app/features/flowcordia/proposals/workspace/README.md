# Proposal workspace webapp boundary

This folder owns the first visible Flowcordia Studio surface: a read/inspect/advance workspace for durable GitHub workflow proposals. It does not create visual workflow drafts, compile code, deploy versions, or execute runs.

## File ownership

| File | Connects | Why |
| --- | --- | --- |
| `access.server.ts` | Dashboard session, organization membership, global flag, and organization override | Recheck staged-rollout access on the server; hidden navigation is not authorization. |
| `query.server.ts` | Authorized project context to the connected repository and proposal store | Derive tenant, installation, and repository scope from server-owned records before listing. |
| `presentation.ts` | Internal proposal aggregate to an explicit browser DTO | Keep tenant, project, installation, database, actor, correlation, version, and provider-error details off the client. |
| `ProposalWorkspace.tsx` | Browser DTO to the native dashboard shell | Present lifecycle state and exact-head actions in normal product language. |
| `apps/webapp/test/flowcordia/proposalWorkspacePresentation.test.ts` | Aggregate fixtures to the browser contract | Prove redaction, URL handling, state/action gating, labels, and page summaries. |

The route module lives under `app/routes/` and only composes these feature services. The workspace command resource uses `../commands.server.ts`, which is also used by the established internal proposal resource. The internal endpoint retains its existing response; Studio receives only `{ ok, proposalId, state, updatedAt }` after a successful mutation.

## Routes

| Route | Permission | Response boundary |
| --- | --- | --- |
| `/:org/:project/env/:environment/flowcordia/proposals` | GitHub `read` plus Studio feature access | Redacted proposal workspace DTO only. |
| `/resources/orgs/:org/projects/:project/flowcordia/proposal-workspace` | GitHub `write` | Minimal acknowledgement or bounded error. |
| `/resources/orgs/:org/projects/:project/flowcordia/proposals` | Existing GitHub read/write contract | Unchanged internal proposal API. |

The environment segment places Studio in the existing dashboard shell. Proposal authority is project plus connected repository; selecting a different environment does not silently create a second proposal namespace.

## Invariants

- Direct navigation and mutation re-run server authorization.
- Browser input never chooses tenant, installation, repository database ID, or GitHub repository ID.
- Submit and promote include the currently observed head SHA; the service checks it again.
- Promotion policy remains server-owned and GitHub is read immediately before merge.
- `RECONCILING` and every state without a proven head fail closed in the UI.
- Pull-request links must be credential-free HTTPS URLs.
- Persisted provider error text stays server-side; the browser receives a normalized explanation.
- List pagination is bounded to 50 proposals. The browser carries only public proposal identity and timestamp; the server resolves the internal keyset anchor inside authorized repository scope.
- No run-engine, queue, supervisor, deployment, secret, or worker-fleet module is imported here.

## Rollout

Studio is dark by default. Access resolution follows organization override, global database flag, then `FLOWCORDIA_STUDIO_ENABLED`; platform admins and active impersonation sessions retain diagnostic access. The side menu uses the resolved organization flag, and the loader independently enforces the same rule. See `flowcordia/runbooks/proposal-workspace-rollout.md` for release and rollback steps.
