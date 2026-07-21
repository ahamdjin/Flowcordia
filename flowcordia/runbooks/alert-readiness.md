# Alert readiness canary

FlowCordia uses the inherited Trigger.dev alert subsystem for task-run, deployment, and error-group notifications. Repository configuration alone does not prove that the alerts worker can reach its Redis queue, that a production channel is correctly scoped, or that the selected delivery adapter accepts a request.

The protected `Flowcordia alert readiness` workflow performs one bounded, explicitly authorized canary against an existing alert channel. It never creates, edits, enables, disables, or deletes an alert channel.

## What the gate verifies

The gate binds one canary to:

- a versioned release identity;
- an independently configured deployed application commit;
- one exact production reference project;
- one exact existing alert-channel friendly reference;
- bounded pending-alert count and age policies;
- the exact confirmation `EXECUTE_EXACT_FLOWCORDIA_ALERT_CANARY`.

The live sequence is fixed:

1. reject invalid release, application, target, worker, policy, or confirmation configuration before loading Prisma, Redis, Slack, email, webhook, or secret-store code;
2. send one bounded `PING` to the same Redis endpoint and options used by the alerts worker;
3. read the exact channel and its pending backlog from PostgreSQL;
4. require the channel to be enabled, cover `PRODUCTION`, and include both `TASK_RUN` and `DEPLOYMENT_FAILURE` alerts;
5. validate the selected channel properties and any required Slack integration without serializing them;
6. reject excessive or stale pending alerts;
7. submit one fixed canary through the existing alert email, Slack, or signed-webhook adapter;
8. preserve only bounded `READY`, `BLOCKED`, or `UNAVAILABLE` evidence.

## Channel behavior

### Email

The canary uses the dedicated alert email transport, not the general magic-link/product transport. The existing destination address is read from the selected channel and is never written to evidence or logs by the preflight.

### Slack

The canary uses the existing organization Slack integration, bot token resolution, retry behavior, and channel ID. The channel ID, integration identity, and token are never written to evidence.

### Webhook

The canary uses the existing encrypted channel secret, HMAC-SHA256 signature header, five-second timeout, and HTTPS endpoint. The endpoint, signature, secret, response body, and provider error are never written to evidence.

## Backlog policy

The defaults are:

- at most 100 pending alerts for the selected channel;
- oldest pending alert no older than 300,000 milliseconds.

Operators may choose stricter values. Supported bounds are zero to 10,000 pending alerts and 60,000 milliseconds to 24 hours for the oldest pending alert.

A blocked backlog prevents the canary. This avoids treating a channel that accepts a new direct request as healthy while its durable alert queue is already falling behind.

## Evidence boundary

A `READY` artifact proves, at one point in time:

- the expected and deployed application revisions matched;
- the alerts-worker Redis endpoint accepted a ping;
- the exact existing channel was enabled and covered production failures;
- the channel backlog satisfied policy;
- the selected existing delivery adapter accepted one fixed canary.

It does **not** prove:

- that a separate alerts-worker process consumed a queued production alert;
- inbox delivery, spam placement, human acknowledgement, or escalation;
- downstream webhook processing after HTTP acceptance;
- Slack notification visibility or incident ownership;
- error-group evaluator schedules;
- alert rate-limiter health under load;
- provider quotas, retention, replay, high availability, or disaster recovery.

A real release still requires connected application acceptance, operator ownership, and incident-response evidence. Repository CI cannot replace the protected canary run.

## Protected environment

Configure the `flowcordia-alert-readiness` environment with required reviewers and the deployed installation's existing database, alerts Redis, encryption, alert email, and application-origin settings. The environment variable `FLOWCORDIA_APPLICATION_COMMIT_SHA` must be maintained independently from the workflow input so the workflow can reject a mismatched deployment identity.

For Slack channels, the selected organization's existing encrypted integration is read from the production database. For webhook channels, the selected channel's existing encrypted secret is used. No extra Slack or webhook secret is supplied to the workflow.
