# Production webhook acceptance

This protected acceptance run proves the complete public webhook and incident lifecycle against one deployed FlowCordia application and one dedicated reference workflow.

The run is destructive. It activates an exact production binding, sends signed requests, permanently revokes the public identity, creates a successor generation, activates the successor, and proves the predecessor remains closed.

## Protected environment

Create the GitHub environment `flowcordia-webhook-acceptance` with required reviewers and restrict deployment branches to `main`.

Configure these secrets:

- `FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL` — HTTPS origin of the deployed FlowCordia application.
- `FLOWCORDIA_WEBHOOK_ACCEPTANCE_STORAGE_STATE_B64` — base64 Playwright storage state for an authorized production operator.
- `FLOWCORDIA_WEBHOOK_ACCEPTANCE_PAYLOAD_JSON` — bounded JSON fixture accepted by the dedicated workflow.
- `FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET` — the exact 32–4096-byte secret stored through the write-only Studio credential path for the webhook node.

The environment and operator must have permission to view Studio, trigger the exact task, activate production bindings, revoke an endpoint, and create a replacement. The test never reads the secret from FlowCordia; the protected sender receives the same controlled fixture independently.

## Reference workflow

Use a dedicated workflow whose promoted graph contains one visual `trigger.webhook` node and whose production task can safely execute repeatedly. The node must use `POST` and a bounded JSON path. The workflow may continue through HTTP, mapping, conditions, waits, repository functions, and output, but its external side effects must be isolated for acceptance.

Before dispatch:

1. publish and merge the exact workflow proposal;
2. deploy the exact merge commit to production;
3. store the HMAC secret through Studio;
4. confirm the Studio production projection is READY;
5. record the workflow ID, webhook node ID, Studio path, and deployed application commit.

## Dispatch

Run `.github/workflows/flowcordia-webhook-production-acceptance.yml` from `main` with:

- `studio_path` — relative authenticated Studio route without query or fragment;
- `workflow_id` — exact public workflow ID;
- `node_id` — exact visual webhook node ID;
- `application_commit_sha` — exact deployed FlowCordia application revision;
- `confirmation` — `EXECUTE_EXACT_FLOWCORDIA_WEBHOOK_ACCEPTANCE`.

The workflow checks out its exact `main` revision with persisted credentials disabled, creates mode-`0700` private storage, writes browser state and evidence with mode `0600`, installs an isolated Chromium runtime, runs one worker, uploads only the sanitized evidence file, and removes all secret-bearing files and transient output.

## Proven sequence

The harness:

1. verifies the authenticated connected Studio route and exact application revision;
2. resolves the exact webhook node projection;
3. creates a replacement first when a prior failed run left the current generation revoked;
4. runs the normal exact activation gate and captures generation/revision in memory;
5. signs the exact raw JSON bytes with HMAC-SHA256 over `timestamp.deliveryId.body`;
6. requires the first request to return bounded accepted status `200` or `202`;
7. retries the same delivery identity and body and requires bounded accepted replay status;
8. sends a validly framed request with an invalid signature and requires `401`;
9. refreshes Studio and requires payload-free `DELIVERED` evidence;
10. permanently revokes the public identity with the emergency-stop reason;
11. requires the revoked URL to return `404`;
12. creates the next endpoint generation and requires it to be inactive, have a new identity, and expose no callable URL;
13. activates the exact successor through the normal production binding gate;
14. sends a correctly signed delivery to the successor;
15. proves the predecessor still returns `404` after successor activation.

## Sanitized evidence

The uploaded schema `0.1` artifact contains only:

- workflow ID and application revision;
- start/completion timestamps;
- original and successor generation/revision numbers;
- bounded HTTP statuses for first delivery, replay, invalid signature, revocation closure, successor delivery, and predecessor isolation;
- fixed stage and failure code/message when the run fails.

Evidence rejects keys associated with payloads, outputs, cookies, tokens, secrets, authorization, browser state, headers, actors, installation/worker/database identity, provider data, URLs, public endpoint IDs, delivery IDs, and run IDs.

## Rerun and recovery

The harness is deliberately resumable:

- an existing active endpoint is revalidated through the exact activation gate;
- a revoked current generation is replaced before the normal sequence continues;
- a previous inactive replacement is activated normally;
- no revoked identity is ever reopened.

Do not rerun blindly after an ambiguous GitHub workflow outcome. First inspect the Studio binding state and the uploaded failure stage. The application’s durable state is authoritative; the workflow artifact is evidence only.

## Stop-ship

Stop release when:

- the exact application revision is not visible in Studio;
- production projection is not READY;
- the protected secret does not match the write-only stored credential;
- signed first delivery or replay is not bounded accepted;
- invalid signature does not return `401`;
- a revoked identity remains callable;
- replacement does not create exactly the next generation as inactive;
- successor activation changes its generated public identity;
- the predecessor becomes callable after successor activation;
- the artifact contains forbidden identity, payload, output, or secret fields;
- the run does not execute on the official workflow path from `main`.

This acceptance proves one exact deployment path. It does not prove sustained load, regional failover, provider quotas, DDoS resistance, external secret-manager behavior, high availability, or disaster recovery.
