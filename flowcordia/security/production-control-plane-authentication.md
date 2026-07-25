# Production control-plane authentication boundary

Flowcordia inherits coordinator, provider, shared-queue, and managed-worker authentication surfaces from Trigger.dev. These credentials are control-plane authority, not ordinary application settings.

## Required production secrets

Every production web deployment must provide three independent random values:

- `PROVIDER_SECRET` authenticates inherited provider and shared-queue Socket.IO namespaces.
- `COORDINATOR_SECRET` authenticates the inherited coordinator Socket.IO namespace.
- `MANAGED_WORKER_SECRET` authenticates supervisor/bootstrap worker requests and must match the supervisor deployment.

Each value must contain 32 to 4096 non-placeholder characters. The public development defaults (`provider-secret`, `coordinator-secret`, and `managed-secret`) are rejected in `NODE_ENV=production`. Reusing one value for multiple roles is also rejected.

## Logging boundary

Raw bearer tokens, managed-worker secrets, Slack access tokens, refresh tokens, OAuth responses, and stored secret objects must never be passed to application loggers. Authentication failures may record only bounded SHA-256 fingerprints and non-sensitive metadata. Fingerprints are correlation aids and are not credentials.

## Verification

The environment parser fails closed before the HTTP server starts. The Flowcordia installation preflight uses the same shared evaluator, so the self-host validator cannot claim readiness for a deployment the application will later reject. Source-contract tests also forbid the previously unsafe log fields.
