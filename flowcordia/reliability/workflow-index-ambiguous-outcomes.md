# Ambiguous outcomes

The index performs GitHub reads only, so remote mutation ambiguity is absent from this slice. Local persistence ambiguity is handled transactionally: either the complete snapshot and completion audit commit, or the previous snapshot remains. A lost HTTP response can be resolved by reloading durable sync state rather than repeating GitHub writes.
