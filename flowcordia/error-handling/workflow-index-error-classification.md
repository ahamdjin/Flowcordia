# Workflow index error classification

- validation errors create durable invalid entries;
- access and scope errors fail the snapshot;
- rate limiting and network/server outages fail safely as retryable;
- truncated or oversized catalogs fail without replacement;
- source identity mismatches fail as non-retryable until a new sync;
- lease/generation mismatches reject completion;
- webhook replay mismatches are security failures;
- browser responses use normalized codes and messages only.
