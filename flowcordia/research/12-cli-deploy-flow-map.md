# CLI deploy flow map

Third pass note.

The deploy API entry point is the deployments API route.

POST request flow:

1. API route checks request method
2. API route authenticates API key
3. request body is parsed with deployment schema
4. InitializeDeploymentService is called
5. service creates or finds a WorkerDeployment record
6. response returns deployment id, content hash, version, image tag, image platform, and event stream data

Important service:

- InitializeDeploymentService

Important helper:

- createDeploymentWithNextVersion

The helper calculates the next deployment version and retries on version collisions.

Important deployment behavior:

- v4 CLI sends deployment type
- old v3 CLI can be detected by missing type
- self hosted deployment has special constraints
- native build can start as pending
- normal deploy can start as building
- deployment timeout is enqueued after creation

Flowcordia rule:

Do not change CLI deploy behavior until we understand every start, build, complete, and promotion endpoint.

Safe future work:

A setup page can read deployment status. It should not create deployments.