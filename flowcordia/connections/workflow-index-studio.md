# Workflow index and Studio connection registry

| Source | Target | Why | State | Failure owner |
| --- | --- | --- | --- | --- |
| connected project repository | workflow-index scope | bind tenant, project, active installation, repository, and production branch | implemented | webapp scope resolver |
| signed GitHub push webhook | workflow-index delivery ledger | deduplicate and replay-protect repository changes | implemented | webhook ingestion |
| matching tracked production branch | durable sync request | schedule the exact pushed commit instead of a later branch head | implemented | workflow-index repository |
| authorized Studio command | exact sync claim | make first-use synchronization immediately useful without requiring the background worker | implemented | Studio command resource |
| Flowcordia operations lifecycle | workflow-index worker | recover push requests and missed request completion with leases | implemented, default off | workflow-index worker |
| sync claim | GitHub workflow catalog | discover bounded canonical files at one immutable commit | implemented | GitHub discovery package |
| catalog entry | GitHub workflow store | read and validate exact commit/blob/path content | implemented | GitHub workflow store |
| complete snapshot | durable workflow entries | replace catalog only after every read succeeds | implemented | index service/repository |
| durable workflow entry | Studio query | select public workflow identity within authorized repository scope | implemented | Studio query |
| Studio query | exact GitHub reread | prove commit, blob, path, ID, and canonical digest before rendering | implemented | Studio query |
| browser-safe DTO | read-only canvas | display real nodes, edges, runtime hints, credential references, and code references | implemented | Studio UI |
| workflow Studio | proposal workspace | navigate between workflow inspection and governed change lifecycle | implemented | Flowcordia routes |
| canvas edits | proposal creation | save a visual change through Git branch and PR | planned | future Studio edit boundary |
| merged workflow | compiler/deployment | create executable Trigger.dev artifacts | planned | future compiler adapter |
| runtime observability | canvas | display live execution state on graph nodes and edges | planned | future observability adapter |
