# Workflow index operating signals

The first rollout must expose or derive these measurements without logging protected data:

- pending synchronization age;
- running synchronization age versus lease expiry;
- idle, pending, running, and failed sync counts;
- failure count by normalized code;
- requested commit versus observed commit lag;
- entry, valid, and invalid counts;
- webhook delivery status and received age;
- webhook replay mismatch count;
- exact-source mismatch count in Studio;
- GitHub rate-limit responses and retry-after budget;
- manual synchronization duration;
- worker synchronization duration.

Payloads, workflow documents, credential values, configuration values, tokens, internal database IDs, and lock tokens must not be dimensions or log fields.
