# Flowcordia provider readiness

Flowcordia provider readiness verifies two external services required by the supported production path:

1. the configured packet/object-store bucket can be accessed through the same `ObjectStoreClient` used by runtime packet offload; and
2. the configured general product-email provider accepts one fixed, explicitly authorized readiness message through the same `EmailClient` used for magic links and product communication.

This is a manual release gate. It does not run automatically at application startup and never retries provider mutations.

## Evidence boundary

A `READY` result proves only:

- release configuration was already `READY`;
- product email is not using the null/console transport;
- sender, reply-to, and provider-specific email configuration are complete;
- object-store endpoint and credential mode are structurally complete;
- the existing object-store client completed a non-mutating bucket verification request;
- the existing general email client submitted one fixed message and the configured provider accepted the request.

It does not prove:

- the email reached the recipient's inbox;
- DNS, SPF, DKIM, DMARC, reputation, spam placement, bounces, or complaints are healthy;
- alert email uses the same provider or has been tested;
- an object can be written, read back, retained, encrypted, replicated, or deleted;
- object-store lifecycle rules, quotas, object locks, or disaster recovery are correct;
- any provider remains available after the point-in-time check.

## Security and mutation boundary

The object-store probe is read-only:

- static-signature mode sends a signed `HEAD` request to the configured bucket endpoint;
- AWS credential-chain mode sends `HeadBucket` through the existing S3 client;
- no object key, payload, upload, presign, download, or delete is created.

The email probe is an intentional external mutation. It is permitted only when an operator supplies:

- one syntactically valid recipient address; and
- the exact confirmation `EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST`.

The command never prints or records the recipient. The message subject and body are fixed in source and contain no secret, payload, output, customer data, repository identity, or provider response.

Run this check only with a controlled operator mailbox. Do not use a customer address.

## Configuration requirements

### General product email

`EMAIL_TRANSPORT` must be exactly one of:

- `smtp`
- `resend`
- `aws-ses`

An unset transport is the inherited null transport that prints messages to the application console; it is blocked for provider readiness.

All transports require valid `FROM_EMAIL` and `REPLY_TO_EMAIL` values.

Additional requirements:

- Resend: `RESEND_API_KEY` must be present and non-placeholder.
- SMTP: `SMTP_HOST` and a valid port are required. `SMTP_USER` and `SMTP_PASSWORD` must either both be present or both be absent for an intentionally unauthenticated relay.
- AWS SES: the runtime credential chain and region/account behavior are resolved by the inherited AWS SDK/Nodemailer transport during the live send.

### Object storage

The check uses `OBJECT_STORE_DEFAULT_PROTOCOL` when present and otherwise uses the legacy/default provider.

The selected provider requires:

- a valid HTTP or HTTPS base URL without embedded username/password credentials;
- either a complete static access-key pair or credential-chain mode;
- `OBJECT_STORE_BUCKET` in credential-chain mode;
- a valid bounded named protocol when `OBJECT_STORE_DEFAULT_PROTOCOL` selects `OBJECT_STORE_<PROTOCOL>_*` settings.

Static credentials may use either:

- a path-style endpoint plus explicit bucket; or
- a virtual-hosted bucket endpoint whose path is already the bucket root.

## Run the check

From the repository root:

```bash
pnpm run flowcordia:providers:preflight -- \
  --email-recipient operator@example.com \
  --confirm-email-send EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST \
  --json
```

Use `--allow-global-studio` only when the same explicit release-configuration acknowledgement is required by installation preflight. It does not bypass organization rollout, RBAC, provider checks, or connected acceptance.

## Execution order

The command is deliberately ordered to minimize mutation:

1. deterministic `release` installation preflight;
2. provider configuration validation;
3. read-only object-store bucket verification;
4. one fixed email-provider submission.

When installation or provider configuration is blocked, no provider is contacted.

When object-store verification is unavailable, no email is sent.

The email provider is contacted only after every non-mutating prerequisite passes.

## Output contract

Schema `0.1` output contains only:

- `READY`, `BLOCKED`, or `UNAVAILABLE`;
- installation or provider phase;
- exact application commit;
- fixed email transport category;
- static-credential, credential-chain, or unconfigured object-store mode;
- fixed check keys, states, and messages;
- check timestamp.

It excludes:

- recipient, sender, and reply-to addresses;
- endpoints, hosts, bucket names, regions, protocol names, usernames, account IDs, or provider IDs;
- access keys, passwords, API keys, tokens, partial secrets, or secret lengths;
- provider response bodies, status text, raw errors, commands, or stack traces;
- object keys, payloads, outputs, or email contents.

## Stop conditions

A release must stop when:

- release installation preflight is blocked;
- general product email is null/console-backed or incompletely configured;
- object storage is absent, malformed, or has incomplete credential settings;
- the exact email-send confirmation is absent;
- bucket verification fails or is unavailable;
- the configured email provider does not accept the fixed readiness message;
- output contains any value outside the bounded projection;
- the application commit differs from the release candidate.

Do not work around a failed provider check by switching to console email, local disk, an unreviewed bucket, or a different provider after connected acceptance. Correct the configured release environment and rerun the complete gate.

## Verification boundary

Repository tests can prove configuration classification, no-call behavior, object-first ordering, fixed failure projection, redaction, and signed bucket-request shape. The inherited MinIO integration test proves the new verification method against the same object-store implementation used by packet uploads.

Those tests do not claim a configured production bucket or email provider has returned `READY`. A real operator run with the exact deployed application, controlled mailbox, and production provider configuration remains mandatory.
