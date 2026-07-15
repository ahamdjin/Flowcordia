# No-fake-paths audit

The workflow Studio must not contain:

- mock workflow data;
- placeholder nodes presented as repository content;
- buttons without implemented resource actions;
- status labels inferred from UI state instead of durable state;
- repository identifiers accepted from the browser;
- canvas rendering from unverified database JSON;
- a success response before durable index completion;
- hidden fallback to a different branch or commit.

Empty, invalid, stale, failed, and disconnected states are first-class product states and must be shown honestly.
