# Workflow index test matrix

| Layer | Required proof |
| --- | --- |
| discovery | invalid scope never resolves credentials; exact commit; filtering; truncation; max catalog; normalized rate limits |
| push normalization | branch push; tag ignored; deletion ignored; malformed installation/repository/SHA rejected |
| delivery ledger | same ID/same hash idempotent; same ID/different hash rejected |
| persistence | scope predicates; generation; exact lease; stale completion blocked; full snapshot rollback; absent deletion |
| service | valid and invalid files; blob/path mismatch; transient read preserves catalog; exact pushed commit |
| presentation | configuration values omitted; internal IDs omitted; graph and source projection exact |
| route | feature gate; read/write authorization; unsupported command rejected; server-owned scope |
| UI | empty, syncing, failed, invalid, stale, valid graph, node selection, read-only boundary |
| integration | manual synchronize and push→worker paths converge on identical durable output |
| isolation | no run-engine, queue, supervisor, deployment, CLI, or customer-runtime imports |
