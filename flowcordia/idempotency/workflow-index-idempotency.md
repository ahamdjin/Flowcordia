# Workflow index idempotency

Push delivery IDs are bound to payload hashes. Replaying already scheduled or ignored identical bytes produces no additional work. A retry after an interrupted received state may reschedule the same exact commit safely. Catalog replacement upserts deterministic workflow paths and removes absent paths within one transaction.
