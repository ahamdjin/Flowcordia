# Git authority

GitHub stores workflow definitions and review history. The index stores a projection and operation state, never a competing editable copy. Studio rereads GitHub before rendering. Future edits must return through governed branches and pull requests rather than mutating index rows.
