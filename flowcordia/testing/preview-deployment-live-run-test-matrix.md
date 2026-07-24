# Preview deployment and live-run test matrix

## Exact deployment and closure

| Case | Expected proof |
| --- | --- |
| no proposal | preview not requested |
| preview integration disabled | proposal remains governed and preview is disabled |
| branch environment absent or archived | waiting for the exact environment |
| deployment belongs to another head | never presented as ready |
| exact deployment building | deploying |
| exact deployment failed | failed without using another deployment |
| legacy proposal has no durable closure identity | fail closed with republish guidance |
| stored closure schema, digest, ordering, uniqueness, or root membership is invalid | fail closed |
| root-only closure task exists once on exact worker | ready |
| every root-to-leaf closure task exists once on exact worker | ready |
| one child task is missing | waiting for closure installation; no run evidence projected |
| one expected task appears more than once | invalid worker inventory; fail closed |
| unrelated worker tasks exist | ignored |
| stale `CREATING` reconciliation observes a remote PR without durable closure | remains retryable `CREATING`, never reconstructed as runnable draft |

## Correlated run identity

| Case | Expected proof |
| --- | --- |
| Studio command | re-resolve exact proposal, closure, environment, worker, and task inventory before the trigger |
| transport retry with the same request UUID | cached run, never a duplicate execution |
| intentional command with another request UUID | separate run in the same exact-head namespace |
| ordinary task run is newer | ignored |
| proposal ID or head differs | ignored |
| unknown seed field or schema version differs | ignored |
| idempotency namespace differs | excluded before metadata projection |
| worker lock differs | ignored |
| more than twenty matching candidates | newest bounded page only |

## Runtime evidence

| Case | Expected proof |
| --- | --- |
| correlated run queued or executing | pending proof and bounded polling |
| correlated run completes successfully with valid node trace | verified proof |
| correlated run terminates unsuccessfully | failed proof; deployment remains ready for another run |
| successful terminal run lacks trustworthy node trace | failed proof |
| malformed, oversized, workflow-mismatched, or invalid node metadata | no node state projected |
| metadata contains provider fields, secrets, raw errors, or arbitrary messages | excluded from loader response |

## Repository gates

The exact pull-request head must pass formatting, lint, typecheck, package tests, database-backed internal and webapp tests, webapp build, workflow checks, and the authenticated rollout procedure. Unit coverage proves the fail-closed selection and persistence contracts; it does not replace recording one real connected-repository preview build with every closure member installed and one verified live run before enabling a production cohort.
