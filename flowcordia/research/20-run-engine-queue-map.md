# Run engine and queue map

Fourth pass note.

Main webapp entry:

- v3 run engine server

The webapp creates a singleton RunEngine.

RunEngine config includes:

- Prisma clients
- worker settings
- queue settings
- run lock settings
- machine presets
- master queue consumers
- concurrency sweeper
- TTL system
- worker queue observer
- heartbeat timeout settings
- batch queue settings
- debounce settings

Runtime database model:

- TaskRunExecutionSnapshot

Snapshot stores run execution state, run status, attempt number, environment, project, organization, worker id, runner id, heartbeat time, checkpoint id, and metadata.

Supervisor relation:

The supervisor receives run queue messages and creates workloads through Docker, Kubernetes, or compute backend.

Flowcordia rule:

This is core engine territory.

Do not change run engine or queue behavior during early Flowcordia setup work.

Safe future work:

Only read health or queue status after we fully map existing presenters and admin endpoints.