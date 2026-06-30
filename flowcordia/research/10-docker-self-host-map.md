# Docker self host map

Second pass note.

The local Docker stack has a core file and an extras file.

Core services:

- Postgres database
- optional Postgres replica profile
- Redis
- MinIO object storage
- MinIO init bucket setup
- Electric
- ClickHouse
- ClickHouse migrator
- S2 lite stream service

Extras services:

- second Electric shard
- ClickHouse UI
- toxiproxy
- HTTP2 proxy
- OpenTelemetry collector
- Prometheus
- Grafana

Root commands:

- pnpm run docker starts core services
- pnpm run docker full starts core plus extras

Important self host idea:

Docker services are infrastructure only. The app code still runs from the current Git branch when using local dev mode.

Flowcordia rule:

Do not rename service names or compose project names yet.

First improve docs and env grouping. Later add setup checks.