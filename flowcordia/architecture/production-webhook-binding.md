# Immutable production webhook binding

## Purpose

A public webhook URL must never discover its workflow, deployment, task, or credential identity dynamically. Activation therefore creates one stable endpoint for an exact production workflow trigger node and points it at an append-only immutable revision resolved from the exact promoted workflow and exact deployed worker.

## Activation authority

Activation succeeds only when all of the following still agree:

- the latest merged Flowcordia proposal matches the expected proposal ID and merge commit;
- the active production environment belongs to the same organization and project;
- the latest production deployment is `DEPLOYED`, has a worker, and was built from the exact merge commit;
- that worker contains the generated `flowcordia-<workflowId>` task;
- the workflow can be loaded from GitHub at the exact merge commit;
- the workflow ID, source commit, source path, source blob, and canonical SHA-256 are captured;
- the selected node is a valid `trigger.webhook` node with the signed-ingress contract;
- the derived webhook HMAC environment key exists in production as a secret value.

Activation reads only the credential key and version metadata. It never reads, copies, hashes, logs, or persists the secret value.

## Data model

`FlowcordiaWebhookEndpoint` owns the stable public identity for one production environment, workflow, and webhook trigger node. The compound identity prevents sibling trigger nodes from sharing or overwriting an active revision pointer. The endpoint contains a nullable pointer to the active revision and may be revoked.

`FlowcordiaWebhookRevision` is append-only. Each revision freezes:

- proposal and merge commit identity;
- workflow path, Git blob, and canonical digest;
- webhook node, method, path, body limit, and timestamp tolerance;
- credential reference, deterministic environment key, and credential version;
- deployment, worker, worker version, and generated task identity;
- a canonical SHA-256 fingerprint over the complete immutable binding.

The adapter checks that every revision's node identity matches its owning endpoint before returning or activating it. The active revision pointer is swapped transactionally under serializable isolation. Re-activating the same fingerprint is idempotent. A changed deployment, workflow source, webhook contract, or credential version creates a new revision without mutating history.

## Request-path consequence

The future public ingress route will resolve the endpoint by public ID, load only its active immutable revision, compare the configured method and path, resolve the exact HMAC key, and trigger the exact stored task and worker version. It will not call GitHub or infer the latest deployment during a request.

## Deliberate exclusions

This slice remains the activation authority. The separate public ingress route consumes only its active immutable revision, publishes the exact callable URL in Studio, resolves one exact secret key, verifies signatures, owns endpoint-scoped replay, applies distributed limits, and invokes the exact stored task version.
