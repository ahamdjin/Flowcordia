# Deployment flow map

Second pass note.

Deployment UI reads from the deployment presenter.

Important route area:

- project environment deployments route

Important presenter:

- DeploymentListPresenter

Important database model:

- WorkerDeployment

WorkerDeployment stores:

- version
- runtime
- image reference
- image platform
- status
- deployment type
- project id
- environment id
- worker id
- triggered user
- trigger source
- commit sha
- git metadata
- timestamps
- error data

Deployment status moves through states such as pending, installing, building, deploying, deployed, failed, canceled, and timed out.

The deployments page also reads connected GitHub repository data and branch tracking so it can show Git context near deployments.

Flowcordia rule:

Do not modify deployment creation yet.

First understand:

- where deploy requests enter
- how CLI deploy reaches the webapp
- how build metadata is stored
- how deployment promotion works
- how GitHub push or PR creates deployment

Safe first change later:

A read only setup page can link to deployment status. It should not create deployments.