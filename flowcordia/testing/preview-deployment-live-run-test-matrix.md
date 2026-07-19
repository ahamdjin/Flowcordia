# Preview deployment and live-run test matrix

## Exact deployment

| Case | Expected proof |
| --- | --- |
| no proposal | preview not requested |
| preview integration disabled | proposal remains governed and preview is disabled |
| branch environment absent or archived | waiting for the exact environment |
| deployment belongs to another head | never presented as ready |
| exact deployment building | deploying |
| exact deployment failed | failed without using another deployment |
| exact deployment completed | ready to run the discovered task |

## Correlated run identity

| Case | Expected proof |
| --- | --- |
| Studio command | strict versioned workflow/proposal/head seed metadata and namespaced idempotency key |
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

The exact pull-request head must pass formatting, lint, typecheck, package tests, webapp tests,
workflow checks, and the authenticated rollout procedure. Unit coverage proves the fail-closed
selection contract; it does not replace recording one real connected-repository preview build and
verified live run before enabling a production cohort.
