# Database map

Second pass note.

Main schema file:

- internal database Prisma schema

Important model groups:

- Organization
- Project
- RuntimeEnvironment
- BackgroundWorker
- BackgroundWorkerTask
- TaskRun
- WorkerDeployment
- WorkerDeploymentPromotion
- TaskSchedule
- ProjectAlert
- ProjectAlertChannel
- GithubAppInstallation
- GithubRepository
- ConnectedGithubRepository
- SecretReference
- SecretStore

Project is a central model. It links to environments, workers, tasks, task runs, deployments, schedules, alerts, environment variables, and the connected GitHub repository.

Deployment state is stored in WorkerDeployment.

GitHub connection state is split into three concepts:

- app installation
- repository
- connected project repository

Secrets use references and a secret store pattern.

Flowcordia rule:

Do not add new tables for GitHub or email setup until the existing models are fully reused or proven insufficient.

First safe work:

- read existing records
- display status
- avoid schema changes
