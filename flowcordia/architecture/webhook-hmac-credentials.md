# Webhook HMAC credential ownership

## Purpose

Flowcordia public webhook verification needs a write-only secret without placing secret bytes in workflow JSON, Git history, Studio loader data, browser logs, or release evidence. This boundary extends the existing environment-variable credential store with an operation-specific webhook HMAC type.

## Namespaces

HTTP request credentials keep the established environment key and value contract:

```text
FLOWCORDIA_CREDENTIAL_<REFERENCE>
{"headers":{"authorization":"Bearer …"}}
```

Webhook HMAC secrets use a separate deterministic key:

```text
FLOWCORDIA_WEBHOOK_HMAC_<REFERENCE>
{"type":"webhook_hmac","secret":"…"}
```

Separating namespaces is mandatory because Studio reads only environment-variable metadata. It cannot inspect encrypted values to infer whether a historical key contains HTTP headers or an HMAC secret.

## Ownership

The browser submits a discriminated write command, but the server independently resolves:

- the authenticated project and environment;
- the selected workflow and node;
- whether the node is a reviewed visual HTTP request or webhook trigger;
- the expected credential type for that operation;
- whether the reference is bound to the exact node;
- whether the same reference is reused across incompatible node types.

Only after these checks does the server derive the environment key from the resolved type and replace the secret value through the existing environment-variable repository.

## HMAC bounds

Webhook secrets preserve exact UTF-8 bytes. They are not trimmed or normalized. A secret must contain 32–4,096 UTF-8 bytes and cannot contain NUL, carriage-return, or newline bytes.

## Request-time resolution

The public ingress adapter will request only the exact active binding's `FLOWCORDIA_WEBHOOK_HMAC_<REFERENCE>` key through the existing exact-key secret-store API. It must not load every project or environment secret.

The stored value is parsed through a strict bounded envelope parser before signature verification. The parser accepts only an object with exactly `type: "webhook_hmac"` and one bounded string `secret`; malformed JSON, arrays, unknown fields, wrong types, invalid secret bytes, and oversized values fail closed. The parsed secret remains server-only and is never returned in a response or persisted in replay evidence.

## Browser projection

Studio receives only:

- reference name;
- credential type;
- derived environment key;
- `READY`, `MISSING`, `NOT_SECRET`, `TYPE_CONFLICT`, or `UNAVAILABLE` state;
- stored version when authorized.

Stored values are never returned. The input is cleared after a successful write.

## Deliberate exclusions

This boundary does not activate a public URL, verify request signatures, persist delivery identity, rate limit callers, or trigger a task. Those responsibilities belong to the production binding and public ingress adapter.
