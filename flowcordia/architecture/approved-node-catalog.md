# Approved node catalog

## Purpose

The portable catalog in `packages/flowcordia-workflow/src/catalog.ts` is the source of truth for nodes that Studio may add visually. It prevents the browser, durable editor, compiler, and product documentation from maintaining different lists of supposed capabilities.

Every entry has a stable catalog ID and version, a Studio template ID, operation and node kind, user-facing category and description, release stage, explicit capability list, and deterministic default configuration. `approved` means the declared capabilities are implemented and tested. `limited` means Studio may author the portable structure but the catalog names the missing production capability.

The initial catalog contains manual, authenticated API, schedule, and limited webhook triggers; HTTP, condition, and wait operations; and workflow output. The generic `code_task` template is deliberately absent because it cannot be compiled without a reviewed repository export. Manifest-backed repository functions remain available through the separate exact-commit function catalog and produce governed `code.task` references.

## HTTP/API contract

`packages/flowcordia-workflow/src/http.ts` owns one configuration parser used by the Studio form, durable edit boundary, compiler analyzer, generated artifact normalization, and live runtime.

| Field | Contract |
| --- | --- |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `HEAD` |
| `url` | HTTPS, at most 2,048 characters, with no userinfo or fragment |
| `bodyMode` | `input` or `none`; GET and HEAD require `none` |
| `responseMode` | `auto`, `json`, `text`, or `none` |
| `timeoutSeconds` | whole number from 1 through 300 |
| `maxResponseBytes` | whole number from 1 through 5,242,880 |

Legacy `{ method, url }` configuration remains readable and receives deterministic defaults. Unknown fields fail closed. A newly added HTTP node may temporarily hold an empty URL so Studio can render its form, but it cannot validate, preview, compile, publish, or execute until the operator supplies a valid destination.

## Live egress boundary

The generated task first resolves the configured exact origin against `FLOWCORDIA_HTTP_ORIGIN_ALLOWLIST`. Existing `FLOWCORDIA_HTTP_HOST_ALLOWLIST` entries remain a compatibility fallback only for standard HTTPS on port 443; non-standard ports require an exact origin entry. The live adapter then:

1. reparses the portable configuration;
2. authorizes the exact destination;
3. resolves names-only credential bindings at execution time;
4. rejects malformed, duplicate, framing, and hop-by-hop credential headers;
5. sends the selected body with workflow cancellation and a bounded timeout;
6. refuses redirects instead of authorizing one host and following to another;
7. cancels rejected redirect, non-success, ignored, and declared-oversize response bodies before returning control to the worker pool;
8. streams accepted responses only to the configured byte limit;
9. preserves legacy JSON-first auto parsing while explicit JSON mode remains strict.

The workflow and generated code never contain secret values. Query parameters are part of reviewed workflow configuration and must not be used for credentials.

## Adding another visual node

A node is not `approved` merely because it appears in the palette. A new entry requires portable configuration validation, durable edit normalization, deterministic serialization and compilation, structural-preview behavior, live execution or an honest missing-capability label, browser-safe projection and form ownership, credential boundaries where applicable, unit and integration tests, and capability/runbook documentation.
