# Workflow index worker model

The worker polls durable sync requests with no overlapping cycles. Claims use row locking, a unique lock token, and expiry. The worker shares the existing Flowcordia operations deployment flag and process signals but performs no proposal, run-engine, deployment, supervisor, or customer-runtime work.
