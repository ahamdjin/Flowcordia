# Runtime supervisor map

Third pass note.

The supervisor is its own app.

Main path:

- apps supervisor

It has a package file, its own source entry point, and can run dev, build, start, test, and typecheck commands.

The supervisor chooses a workload backend:

- compute
- kubernetes
- docker

It also manages optional systems:

- metrics server
- workload server
- resource monitor
- checkpoint client
- warm start verifier
- pod cleaner
- failed pod handler
- tracing
- backpressure monitors

Runtime flow at a high level:

1. supervisor starts
2. worker session starts
3. run queue messages are received
4. if possible, warm start is attempted
5. otherwise a cold workload is created
6. workload manager creates the actual runtime unit
7. workload server tracks run connect and disconnect events

Flowcordia rule:

Do not modify supervisor behavior during onboarding work.

For GitHub and email setup, we should only need to read statuses and env. Runtime execution changes come much later.