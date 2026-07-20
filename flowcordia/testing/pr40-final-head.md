# PR 40 final-head rule

The reviewed branch must contain no temporary formatter, finalizer, transform, or diagnostic files.

Repository checks on the exact final commit are the only merge authority. A connected environment record remains separate from repository validation.

Both Studio reads and production mutations must select the newest deployment deterministically by `createdAt DESC, id DESC`; an older deployed worker is never an authority fallback.
