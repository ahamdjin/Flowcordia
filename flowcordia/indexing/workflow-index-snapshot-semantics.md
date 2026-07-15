# Workflow index snapshot semantics

A synchronization represents the full flat canonical workflow directory at one immutable commit. Entries are not streamed into the active catalog. The service reads and validates the complete bounded set, then commits additions, updates, deletions, counts, and observed commit atomically. The catalog therefore never represents a mixture of repository commits.
