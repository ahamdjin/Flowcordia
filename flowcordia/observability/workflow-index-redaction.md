# Workflow index observability redaction

Allowed log fields: normalized operation, sync public ID, counts, safe failure code, duration, exact commit SHA, and delivery ID.

Forbidden log fields: raw webhook body, workflow document, node configuration values, credential values, GitHub token, App private key, internal installation/repository database IDs, lock token, raw provider body, or provider stack trace.
