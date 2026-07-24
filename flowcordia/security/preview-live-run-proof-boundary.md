# Preview live-run proof boundary

## Trust decision

A `TaskRun` is accepted as evidence for a Flowcordia proposal only when server-owned database identity, immutable closure identity, exact worker inventory, and bounded run metadata agree. Metadata alone never selects a run.

Required database evidence:

- authorized tenant and project;
- exact proposal branch preview environment;
- deployment commit equal to the current proposal head;
- durable closure schema and digest recovered from the exact verified GitHub head;
- sorted unique closure workflow IDs containing the proposal root;
- one matching `flowcordia-<workflow-id>` task for every closure member on the exact deployed worker;
- root task identifier equal to `flowcordia-<workflow-id>`;
- run locked to that deployment's worker; and
- idempotency key in the workflow/proposal/head namespace created by the Studio command.

The browser cannot supply closure membership, digest, worker identity, installed task rows, or deployment version. Unrecorded, malformed, incomplete, duplicate, or stale closure installation fails closed before a live run is triggered.

Required metadata evidence is a strict versioned `flowcordiaTrigger` object containing the same workflow ID, proposal ID, and head SHA. Unknown identity fields, malformed JSON, excessive size, or an identity mismatch invalidate the candidate. Studio examines at most the newest twenty candidates already constrained by the database evidence.

## Verification result

- A queued or active correlated run is pending proof.
- A successful terminal correlated run with a valid bounded node trace is verified proof.
- An unsuccessful terminal run, or a successful terminal run without trustworthy node evidence, is failed proof.

Failed run proof does not make the immutable deployment healthy or unhealthy; it permits an authorized user to start another intentional run with a new request UUID. Reusing the same UUID returns the idempotently cached run.

## Browser boundary

Studio may receive public proposal identity, closure digest and bounded counts, bounded missing workflow IDs, deployment version and timestamps, run friendly ID and status, bounded node operation/status, and proof state. It never receives the environment or worker database IDs, task row IDs, environment API key, idempotency key, seed metadata, payload, output, credentials, generic metadata, or raw errors.
