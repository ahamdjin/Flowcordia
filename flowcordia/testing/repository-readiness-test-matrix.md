# Repository readiness test matrix

| Area | Required proof |
| --- | --- |
| command contract | exact `operation: check`, 1 KiB bound, malformed and unknown input rejected |
| route access | Studio feature access and dashboard GitHub read permission rechecked |
| scope | browser cannot choose organization, project, installation, repository, or branch |
| installation | exact installation match; suspended, missing, and invalid responses fail closed |
| permissions | contents write, pull-request write, and checks read evaluated independently |
| branch | production branch resolves through the installation client to one immutable commit |
| catalog | bounded non-truncated `.flowcordia/workflows/*.json` discovery |
| index | IDLE sync, exact observed head, no stale entries, at least one valid entry, no invalid entry |
| config file | exact-commit `trigger.config.ts`, 256 KiB maximum, byte match, fatal UTF-8 |
| default discovery | no `dirs` property accepts Trigger.dev default `trigger` discovery |
| explicit discovery | static `dirs` must contain `trigger` or `trigger/flowcordia` |
| ambiguous discovery | dynamic, empty, malformed, duplicated, or excluding `dirs` blocks |
| preview | exact connected repository setting must enable preview deployments |
| redaction | no token, installation/database ID, provider request ID, raw error, source, payload, output |
| mutation isolation | no branch, PR, environment, deployment, run, audit, or outbox write |
| presentation | deterministic ordering, bounded messages, blocked/unavailable dominance |
