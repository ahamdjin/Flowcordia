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

Studio lists only project- and environment-scoped MANUAL waitpoints carrying the Flowcordia approval tag and connected to a `flowcordia-<workflow-id>` run. The browser receives a public waitpoint ID, workflow/run/node identity, bounded prompt/instruction, timeout, state, decision receipt, and only the per-item decision capability derived from RBAC. It never receives an internal user ID, environment API key, public access token, callback URL, raw run metadata, payload, or output.

Repository read access controls visibility of the Studio workspace; it does not grant approval authority. Each approval card derives its decision capability from `write` access to that exact waitpoint, and the server independently enforces the same waitpoint permission before resolving or mutating anything.

An authenticated server command re-resolves organization, project, environment, waitpoint, connected run, RBAC, and pending state. It reserves one unique decision claim, completes the existing Trigger.dev waitpoint through the inherited server-side packet and run-engine path, re-reads the authoritative output, and finalizes the actor, decision, bounded comment, and timestamp receipt. The waitpoint is still the execution authority; the receipt exists only for audit and race resolution.

## Race and retry behavior

- waitpoint creation is idempotent per run and node;
- an already completed waitpoint cannot be decided again;
- concurrent decisions are resolved by the inherited one-time completion plus one unique decision receipt;
- the losing command returns a conflict with the observed decision;
- a completion response is accepted only after the authoritative waitpoint is re-read as completed;
- the browser locks one decision, comment, and request ID for an uncertain attempt so a retry reuses the exact reservation instead of creating a competing claim;
- timeout and malformed output fail closed;
- comments never enter workflow configuration or repository source.

## Verification boundary

Repository verification covers the strict workflow contract, catalog/editor behavior, deterministic preview, generated waitpoint source, live adapter output validation, metadata filtering, required-comment policy, concurrent claim fencing, uncertain-completion recovery, authoritative output mismatch, Prisma generation, database types, Studio configuration, and dependency-aware webapp types. Connected release acceptance must still prove the deployed waitpoint pauses and resumes on the protected production environment before launch evidence can claim this capability operationally proven.

## Exclusions

This boundary does not add email/Slack notifications, public approval links, approval delegation, multi-approver quorum, scheduled escalation, policy-driven auto-approval, or a cross-project inbox. Those require separate product and governance decisions after the single-approver path is proven.
