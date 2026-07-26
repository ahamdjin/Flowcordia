# Approval notification delivery acceptance

## Delivered contract

The existing alerts worker now reconciles due Flowcordia human approvals once per minute. A notification is eligible only when an existing project alert channel is enabled, covers the approval environment, and is configured for both task-run and deployment-failure operational alerts.

For every eligible waitpoint, reminder or escalation stage, and channel, Flowcordia creates one durable payload-free delivery row. The unique `(waitpointId, stage, channelId)` scope prevents parallel ownership. Workers must acquire an expiring lease before contacting a provider. Expired leases can be reclaimed after worker loss.

Transient provider failures return the row to `PENDING` with bounded exponential backoff. Invalid channels fail without retry. Exhausted attempts become terminal. Pending delivery is cancelled when the waitpoint is completed, expires, the environment is archived, or the channel becomes ineligible.

## Existing transports

Delivery reuses the existing alert infrastructure:

- alert email transport through `sendAlertPlainTextEmail`
- Slack through `postAlertSlackMessage`
- signed HTTPS webhook through `deliverAlertWebhook`

Each message carries the stable delivery ID. Webhook requests retain the existing HMAC-SHA256 signature contract. The ledger does not store workflow payloads, provider response bodies, decrypted credentials, recipient secrets, or raw provider errors.

## Delivery semantics

Internal delivery ownership is unique and retry-safe. External delivery is at-least-once across the unavoidable provider-accepted/database-write crash window. Email, Slack, and webhook recipients can use the stable delivery ID to identify repeated delivery. A provider-specific exactly-once claim is not made.

## Repository validation

The permanent validation gate proves:

- schema and migration ownership match
- the unique scope and due/lease indexes exist
- the existing alerts worker owns the cron schedule
- reminder and escalation stage projection is deterministic
- retry backoff and terminal-state boundaries are bounded
- all three existing adapters are reused
- no temporary publisher or credential-bearing evidence enters the product diff

Connected provider outage, redrive, worker-loss, and saturation evidence is collected by the later Beta failure campaign rather than this product PR.
