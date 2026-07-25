# Approval reminder and escalation acceptance

## Repository evidence

- legacy approval nodes normalize both policy fields to `null`
- reminder and escalation seconds are strict integers, at least 60 seconds, ordered, and before timeout
- generated waitpoint metadata contains only public workflow/run/node identities and due timestamps
- the inbox deterministically projects `NONE`, `REMINDER_DUE`, or `ESCALATED` and orders urgent items first
- no recipient, callback URL, token, credential, payload, or provider response enters workflow metadata

## Connected evidence still required

A later delivery slice must prove one retry-safe notification per waitpoint/stage through configured existing transports. This PR does not send email, Slack, or webhook traffic.
