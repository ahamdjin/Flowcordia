# Workflow index operational bounds

- maximum discovered workflows per repository snapshot: 500;
- workflow IDs: 3–128 canonical characters;
- workflow paths: flat under `.flowcordia/workflows`;
- manual synchronization lease: 120 seconds;
- worker lease: existing Flowcordia reconciliation lease budget;
- concurrent exact workflow reads: 4;
- webhook body: existing 1 MiB route limit;
- normalized failure message: 1,000 characters;
- browser list: 500 entries.

Exceeding a bound fails safely and preserves the prior complete catalog.
