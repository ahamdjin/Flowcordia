# Completion proof

A synchronization is complete only after the exact snapshot is committed, counts and observed commit are updated, the lease is cleared, and an audit event is appended in the same transaction. The HTTP command does not return success before that point.
