# Structured node configuration acceptance

## Purpose

Prove that Flowcordia Studio edits the currently supported visual operations through bounded, operation-owned forms instead of a general JSON textarea. The form contract must preserve canonical intent exactly or refuse the edit.

## Static ownership assertions

The final source tree must satisfy all of the following:

- `WorkflowStudio.tsx` does not contain `Configuration (JSON)`, `JSON.parse(configuration)`, or local JSON-textarea state.
- `WorkflowStudioNodeConfigurationEditor.tsx` is the only node-configuration form surface.
- `node-configuration.ts` is pure and does not access browser, database, GitHub, environment, or runtime services.
- Unsupported operations and unknown stored fields produce a blocked state rather than a partial configuration object.
- No configuration form accepts credentials, tokens, headers, repository paths, installation identity, or runtime worker identity.

## Contract matrix

| Operation | Editable fields | Required refusal cases |
| --- | --- | --- |
| `trigger.manual` | none | any unknown stored key |
| `trigger.api` | none | any unknown stored key |
| `trigger.schedule` | cron, timezone | unknown key, non-string fields, non-five-field cron, invalid IANA timezone |
| `trigger.webhook` | method, absolute path | unknown key, unsupported method, non-absolute or oversized path |
| `action.http` | method, HTTPS URL, input/no-body mode, response mode, timeout, maximum response bytes | unknown key, unsupported method or mode, GET/HEAD body, non-HTTPS URL, embedded credentials, fragment, oversized URL, timeout outside 1–300 seconds, response limit outside 1–5,242,880 bytes |
| `control.wait` | duration and human unit | unknown key, negative, non-finite, or overflowing duration |
| `control.condition` | path, operator, scalar value | unknown key, unsupported operator, oversized path, non-finite number, object or array comparison |
| `output.return` | none | any unknown stored key |

## Repository tests

Tests must prove:

1. pass-through nodes serialize to an empty object;
2. unknown fields are named in a fail-closed result and never disappear;
3. schedules trim canonical strings and reject invalid cron/timezone input;
4. webhook methods normalize to uppercase and paths remain absolute and bounded;
5. HTTP destinations are bounded HTTPS URLs without userinfo or fragments, and legacy method/URL nodes hydrate into deterministic defaults;
6. HTTP body, response, timeout, and response-limit values round-trip without changing the portable contract;
7. wait values round-trip through seconds, minutes, hours, and days without changing stored seconds;
8. condition values round-trip for string, number, boolean, and null;
9. `exists` omits `value` from canonical configuration;
10. object/array comparisons and unsupported operations remain code-owned;
11. the legacy raw JSON inspector control is absent.

## Connected acceptance

Using the configured reference repository:

1. synchronize an exact production head and start a durable draft;
2. edit one node of each supported visual operation;
3. reload Studio after every saved edit and confirm the same canonical values are projected;
4. inspect the proposal diff and confirm only documented fields changed;
5. add an unknown key in the repository, synchronize, and confirm Studio blocks editing without deleting it;
6. store an object-valued condition comparison and confirm Studio keeps it code-owned;
7. confirm invalid client input never submits a draft mutation;
8. bypass the client with a malformed command and confirm server validation still rejects it;
9. publish, compile, structurally preview, deploy, and execute the edited reference workflow;
10. confirm HTTP credentials still resolve only through credential references and environment bindings;
11. confirm the live HTTP request does not follow redirects, respects the selected timeout and response limit, and returns the selected response representation;
12. confirm the public webhook form does not imply that signed ingress is already deployed.

## Rollback

Revert the composition commit. No database migration, proposal-state transition, deployment record, run record, or GitHub protocol changes. Rollback restores the previous inspector surface while leaving the server command contract unchanged.
