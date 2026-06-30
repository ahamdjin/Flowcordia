# Background jobs map

Fourth pass note.

Main worker:

- common worker

Common worker uses Redis worker and a catalog of jobs.

Mapped job groups:

- scheduled email
- Attio sync
- resume batch run
- resume task dependency
- timeout deployment
- execute tasks waiting for deploy
- retry attempt
- cancel task attempt dependencies
- cancel dev session runs
- batch processing legacy jobs
- task run alerts
- deployment alerts
- alert delivery
- expire run
- enqueue delayed run
- bulk action processing

Important note:

Some alert jobs are marked deprecated in common worker because they moved to alerts worker, but compatibility handlers still exist.

Flowcordia rule:

Do not add new background job categories until the right worker is chosen.

For email test buttons, prefer direct action first. Queue based delivery can come later.