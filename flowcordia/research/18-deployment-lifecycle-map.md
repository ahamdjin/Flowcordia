# Deployment lifecycle map

Fourth pass note.

Mapped flow:

1. CLI calls deployment API
2. API checks auth
3. InitializeDeploymentService creates WorkerDeployment
4. status starts as pending or building
5. timeout job is queued
6. build creates image and worker metadata
7. worker metadata creates or links BackgroundWorker
8. finalize service marks deployment deployed
9. promotion can mark it current
10. deployment alerts are queued

Important services:

- InitializeDeploymentService
- createDeploymentWithNextVersion
- CreateDeploymentBackgroundWorkerServiceV3
- FinalizeDeploymentService
- FailDeploymentService
- TimeoutDeploymentService
- PerformDeploymentAlertsService

Deployment states:

- pending
- installing
- building
- deploying
- deployed
- failed
- canceled
- timed out

Important note:

Finalize expects the deployment to already be in deploying state and have a worker.

Flowcordia rule:

Setup UI should only read deployment status. It should not change deployment records.