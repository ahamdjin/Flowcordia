# Workflow index push contract

Only verified GitHub `push` events for `refs/heads/*` are considered. The normalizer requires a safe installation ID, repository numeric ID, branch ref, exact after SHA, and deletion flag. Tags and malformed events are rejected from the index path. A project is scheduled only when its active connected repository and configured production branch match the verified event.
