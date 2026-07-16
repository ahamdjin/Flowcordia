# Workflow index data boundary

## Persisted

- server-resolved tenant/project/installation/repository identities;
- production branch;
- requested and observed commit SHAs;
- workflow ID/path/blob/canonical digest;
- workflow name, description, schema version, node/edge counts;
- normalized validation failure;
- synchronization state, generation, lease, safe failure;
- audit metadata and normalized push delivery identity.

## Never persisted in the index

- GitHub tokens or App private keys;
- raw webhook bodies;
- raw workflow documents;
- node configuration values;
- credential values;
- provider stack traces or raw response bodies.

## Browser projection

- repository owner/name/branch;
- public workflow identity and metadata;
- exact source SHAs;
- graph structure;
- configuration key names;
- credential-reference names;
- runtime and code-reference metadata;
- normalized failures.

The browser does not receive database IDs, installation IDs, repository numeric IDs, generations, leases, lock tokens, audit payloads, actor/correlation internals, configuration values, credential values, or raw provider errors.
