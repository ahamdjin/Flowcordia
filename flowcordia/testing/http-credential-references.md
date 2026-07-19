# HTTP credential reference acceptance

## Purpose

Prove that Studio can bind reviewed HTTP nodes to deterministic credential environment keys without reading, accepting, storing, logging, or displaying secret values.

## Reference contract

- references are 1–64 character lowercase slugs;
- the first character is a letter;
- later segments use lowercase letters, numbers, and single hyphens;
- underscores, uppercase letters, repeated hyphens, leading numbers, duplicates, and more than 16 references fail closed;
- `billing-api` maps exactly to `FLOWCORDIA_CREDENTIAL_BILLING_API`;
- the deterministic mapping prevents alternate reference spellings from resolving to one environment key.

## Secret boundary

Studio receives and writes reference names only. It does not list environment variables, request values, validate secret JSON, preview headers, or transmit values through the draft command.

The deployed task resolves the deterministic environment key at execution time. The value must be a JSON object containing a `headers` object. Runtime validation continues to reject missing values, malformed JSON objects, non-string headers, and forbidden `host` or `content-length` headers.

## Static ownership assertions

- `credentials.ts` owns the portable reference and environment-key contract.
- `WorkflowStudioCredentialReferencesEditor.tsx` is rendered only for visual `action.http` nodes.
- `credential-references.ts` hydrates and validates names only.
- the draft command accepts only `nodeId` plus a bounded string array.
- the portable workflow editor rejects developer-owned and non-HTTP targets.
- the compiler consumes the shared environment-key function and rejects invalid references before source generation.
- audit summaries record count and changed field name only, never secret values or resolved headers.

## Repository tests

Tests must prove:

1. accepted and rejected reference syntax;
2. deterministic environment-key derivation;
3. duplicate and count limits;
4. visual HTTP hydration and projection;
5. non-HTTP, developer-owned, and legacy invalid references fail closed;
6. exact add, replace, clear, and audit behavior;
7. strict command-schema rejection of unknown fields and invalid names;
8. compiler output uses the shared deterministic environment key;
9. Studio source contains no secret-value or environment-value access;
10. existing runtime header validation remains unchanged.

## Connected acceptance

Using the configured reference repository:

1. start a draft and select a visual HTTP node;
2. add a credential reference and confirm Studio shows only its derived environment key;
3. save, reload, and confirm the canonical workflow contains only the reference name;
4. inspect audit evidence and confirm no credential value or header appears;
5. publish and inspect generated source for the deterministic environment binding;
6. configure the environment value outside Studio with a JSON `headers` object;
7. deploy the exact proposal head and execute the HTTP node;
8. confirm the outgoing request receives the configured headers without exposing them in Studio evidence;
9. test missing, malformed, non-string, `host`, and `content-length` values and confirm bounded runtime failure;
10. clear the references and confirm canonical JSON removes `credentialReferences` rather than storing an empty array;
11. attempt a non-HTTP, developer-owned, duplicate, invalid, excessive, or unknown-property command and confirm server rejection.

## Rollback

Revert the commit. No database migration, secret migration, environment mutation, deployment record, or GitHub protocol changes. Existing repository-authored credential references remain readable after rollback.
