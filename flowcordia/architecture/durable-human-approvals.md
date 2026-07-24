# Durable human approvals

## Decision

Flowcordia approvals are real durable workflow pauses backed by the inherited Trigger.dev MANUAL waitpoint primitive. They are not polling loops, browser-only state, or a parallel Flowcordia queue.

## Workflow contract

The first bounded approval node owns:

- a human-readable prompt between 1 and 500 characters;
- an optional instruction between 0 and 2,000 characters;
- a timeout between 60 seconds and 30 days; and
- an optional required-comment flag.

The node returns one strict result:

```json
{
  "decision": "approved | rejected",
  "comment": "string | null",
  "decidedAt": "ISO timestamp"
}
```

A timeout fails the workflow at the approval node. Rejection is data, not an implicit runtime failure, so a workflow can route or map the decision explicitly.

## Runtime ownership

The generated task creates one idempotent waitpoint token for the exact workflow run and node, tags it as a Flowcordia approval, writes only bounded current-approval identity into run metadata, and waits through `wait.forToken`. The inherited waitpoint remains the pending/completed authority and resumes the checkpointed run.

Preview never creates a waitpoint. Structural preview returns a deterministic simulated approval result and marks the trace as simulated.

## Inbox and decision boundary

Studio lists only project- and environment-scoped MANUAL waitpoints carrying the Flowcordia approval tag and connected to a `flowcordia-<workflow-id>` run. The browser receives a public waitpoint ID, workflow/run/node identity, bounded prompt/instruction, timeout, state, and decision receipt. It never receives the environment API key, public access token, callback URL, raw run metadata, payload, or output.

An authenticated server command re-resolves organization, project, environment, waitpoint, connected run, RBAC, and pending state. It completes the existing Trigger.dev waitpoint through the server-owned environment API key, then records one unique Flowcordia decision receipt containing actor, decision, bounded comment, and timestamp. The waitpoint is still the execution authority; the receipt exists only for audit and race resolution.

## Race and retry behavior

- waitpoint creation is idempotent per run and node;
- an already completed waitpoint cannot be decided again;
- concurrent decisions are resolved by the inherited one-time completion plus one unique decision receipt;
- the losing command returns a conflict with the observed decision;
- a completion response is accepted only after the authoritative waitpoint is re-read as completed;
- timeout and malformed output fail closed;
- comments never enter workflow configuration or repository source.

## Exclusions

This boundary does not add email/Slack notifications, public approval links, approval delegation, multi-approver quorum, scheduled escalation, policy-driven auto-approval, or a cross-project inbox. Those require separate product and governance decisions after the single-approver path is proven.
