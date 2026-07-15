# Manual workflow synchronization contract

The Studio resource accepts only `{ "operation": "synchronize" }`. Dashboard authorization and the Studio feature gate run first. The server resolves all repository scope, persists intent, claims only the exact requested generation, executes the same indexing service as the worker, and returns only commit and count results or a normalized failure.
