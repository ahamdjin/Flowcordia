# Connected release campaign

The protected **Flowcordia connected release campaign** executes the complete release path on one unchanged `main` application revision. It coordinates existing official workflows; it does not replace their protected environments, browser sessions, credentials, policy approvals, or evidence contracts.

The campaign is complete only when it preserves:

```text
immutable bundled clean install
  -> published self-host lifecycle
  -> provider readiness
  -> alert readiness
  -> non-maintainer Studio author journey
  -> exact-head preview deployment and execution
  -> governed promotion
  -> exact production deployment and closure discovery
  -> production execution
  -> signed webhook activation, delivery, replay, revocation, and replacement
  -> governed rollback proposal
  -> governed rollback promotion
  -> exact rollback deployment and closure discovery
  -> rollback-production execution
  -> schema 0.6 immutable launch dossier
```

Repository CI proves the controller and individual harnesses. Only a configured successful protected run proves the connected product.

## Preconditions

1. Merge and deploy the exact Flowcordia `main` revision being accepted.
2. Publish two official immutable self-host images:
   - the currently installed release;
   - the exact target `main` revision.
3. Configure the dedicated bundled clean-install runner and every existing protected environment used by the nested workflows.
4. Configure a dedicated internal organization, project, environment, and reference repository containing:
   - the release reference workflow;
   - at least one typed repository function and executable fixture;
   - an approved HTTP node, deterministic mapping node, ready credential binding, and signed webhook trigger;
   - a previously accepted proposal/head/merge identity that is safe to restore during rollback.
5. Keep all fixtures, credentials, webhook payloads, and provider recipients synthetic.
6. Confirm the campaign application SHA equals the exact repository `main` head and deployed web application.
7. Confirm no unrelated merge is expected during the campaign. The controller stops when `main` moves.

## Protected campaign plan

Store one base64-encoded JSON object in the `flowcordia-connected-release-campaign` environment secret:

`FLOWCORDIA_CONNECTED_CAMPAIGN_PLAN_B64`

The decoded schema is:

```json
{
  "schemaVersion": "0.1",
  "releaseId": "flowcordia-0.6.0-rc.1",
  "applicationCommitSha": "0123456789abcdef0123456789abcdef01234567",
  "workflowId": "release_workflow",
  "studioPath": "/orgs/internal/projects/reference/env/production/flowcordia/workflows",
  "proposalPath": "/orgs/internal/projects/reference/env/production/flowcordia/proposals",
  "replacementName": "Release acceptance 0.6.0-rc.1",
  "repository": {
    "owner": "reference-owner",
    "name": "flowcordia-reference",
    "branch": "main"
  },
  "mergeMethod": "squash",
  "allowGlobalStudio": false,
  "publications": {
    "currentRunId": "100000001",
    "targetRunId": "100000002"
  },
  "alert": {
    "projectRef": "project_reference",
    "channelRef": "channel_reference",
    "maxPendingAlerts": 0,
    "maxOldestPendingAgeMs": 300000
  },
  "webhookNodeId": "incoming_webhook",
  "rollbackTarget": {
    "proposalId": "proposal_previous",
    "headSha": "89abcdef0123456789abcdef0123456789abcdef",
    "mergeCommitSha": "fedcba9876543210fedcba9876543210fedcba98",
    "reason": "Restore the previously accepted reference workflow after release proof."
  },
  "stageTimeoutSeconds": 3600
}
```

The plan contains bounded public release identities only. Do not put tokens, cookies, storage state, endpoints containing credentials, payloads, outputs, database IDs, provider responses, or customer data in the plan.

The browser storage states and provider credentials remain in their existing stage-specific protected environments. The campaign controller never reads or copies those secrets.

## Human approval boundaries

The campaign dispatches each official workflow and waits for its exact run. Environment reviewers must inspect the pending stage before approving it.

### Bundled clean install

Approve only after confirming:

- the target publication run belongs to the unchanged campaign revision;
- every dependency reference in the protected bundle configuration is immutable and matches the reviewed bundle set;
- the dedicated runner and isolated external paths are available;
- no shared production dependency or volume will be reused.

### Self-host lifecycle, provider, and alert

Approve only when their existing runbooks and protected configuration are satisfied. A successful clean install does not replace upgrade, recovery, provider, or alert evidence.

### Non-maintainer author and preview

Approve the private-beta author journey only for the dedicated standard-user browser session. After it publishes the exact proposal, the preview stage may be approved only when the connected GitHub deployment path is configured for that proposal head.

### Governed promotion

The campaign deliberately does not bypass governance. Before approving the promotion environment:

1. inspect the exact proposal ID and head produced by the author journey;
2. review the visual and generated-code diff;
3. require the configured GitHub checks and approvals on that exact head;
4. confirm repository policy is `SATISFIED` and the selected merge method is allowed.

The same review applies to the generated rollback proposal before rollback promotion.

### Production identity and execution

Production identity discovery is read-only. It waits for Studio to report the exact merge deployment and complete immutable closure as `READY`, then preserves only:

- deployment commit and version;
- closure digest and workflow count;
- rollback base commit and workflow blob identity.

Approve production execution only after the deployment and closure match the promoted proposal. The rollback-production stage repeats this boundary for the restored proposal.

### Signed webhook lifecycle

Approve only for the synthetic HMAC credential, bounded test endpoint, and independent signed sender. The stage must prove valid delivery, invalid signature rejection, replay recovery, permanent revocation, successor replacement, successor delivery, and predecessor isolation.

## Dispatch

Run **Flowcordia connected release campaign** from `main` with:

- `application_commit_sha`: the exact deployed 40-character `main` SHA;
- `confirmation`: `RUN-CONNECTED-RELEASE-CAMPAIGN`.

The campaign has one six-hour outer limit. Individual stage timeouts are bounded by the plan. If a protected approval, deployment, or run exceeds those limits, start a new release campaign rather than editing or resuming evidence manually.

## Dispatch reconciliation

The controller records the existing official run set before each dispatch. After dispatch it accepts exactly one new `workflow_dispatch` run that:

- belongs to this repository;
- uses branch `main`;
- uses the unchanged application commit;
- was created after the dispatch boundary.

If dispatch returns an uncertain response, the controller does not retry the mutation. It reconciles the resulting run once. Zero or multiple exact candidates stop the campaign.

## Evidence

Each successful stage must preserve its own official bounded artifact. The controller downloads it into a temporary private directory, verifies the expected result and public lineage needed for the next stage, computes a deterministic artifact-set digest, and removes the downloaded files.

The final campaign receipt contains:

- release, application, workflow, proposal, merge, and rollback identities;
- bundled compatibility version and bundle manifest digest;
- each official workflow path, run ID, exact head, chronology, and artifact-set digest;
- the ten run IDs supplied to the release assembler;
- one receipt digest.

The release assembler independently downloads and verifies the ten official source artifacts and creates a draft evidence pull request containing one schema `0.6` launch manifest. The controller receipt does not replace that manifest.

## Stop-ship

Stop or reject the release when:

- `main` changes after the campaign starts;
- a workflow dispatch cannot be reconciled to exactly one official run;
- a stage runs from another branch or commit;
- a successful stage has no bounded artifact or has multiple ambiguous evidence files;
- a protected reviewer cannot independently verify the pending mutation;
- the bundle clean install is not READY or leaves a container, network, or volume;
- the proposal, merge, deployment, closure, webhook generation, or rollback lineage disagrees;
- any stage exposes or preserves credentials, payloads, outputs, cookies, internal IDs, provider responses, or raw errors;
- the final dossier is not schema `0.6`, has fewer or more than ten distinct official source runs, or omits the bundled manifest digest.

## First-run maturity boundary

Merging the controller proves only that the campaign can be configured and tested. Flowcordia remains internal alpha until one exact protected campaign completes in the real reference environment and its schema `0.6` evidence pull request is independently reviewed.
