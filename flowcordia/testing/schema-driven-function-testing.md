# Schema-driven function testing

## Product boundary

Studio generates a test form only for repository functions that are direct workflow entry functions: they have no incoming edge or receive input directly from trigger nodes. This keeps the displayed function input contract aligned with the workflow payload.

The test surface provides two explicit modes:

- **Structural Preview** sends the payload through the durable draft and Flowcordia preview adapter. Customer code, network calls, and real waits do not execute.
- **Live Preview** sends the same validated payload to the task deployed from the exact proposal head. It remains unavailable without a ready matching deployment and trigger permission.

Advanced JSON remains available for complex payloads and workflows without a directly testable function schema. When a schema exists, the JSON payload must satisfy the same input contract before submission.

## Required proof

| Boundary | Required proof |
| --- | --- |
| schema projection | only the already validated bounded schema subset reaches Studio; executable source and unknown schema keywords remain absent |
| default payload | required nested fields receive deterministic schema-valid defaults; optional fields remain absent |
| form editing | scalar, enum, boolean, nested object, optional property, and array edits produce immutable JSON values |
| validation | client diagnostics use the same runtime validator and exact JSON paths |
| server authority | a client-valid payload is still revalidated by the structural or live runtime boundary |
| structural mode | customer code, network calls, and real waits do not execute; structured workflow output and traces are shown |
| live mode | the request requires the exact proposal head, ready matching deployment, task-trigger permission, and a unique request ID |
| input retention | valid non-sensitive values use browser session storage only; sensitive-looking values are never stored; no workflow, draft, proposal, Git, or database write occurs |
| output | structural output is formatted as bounded JSON; trace failures retain precise contract messages |
| repository fixtures | fixture input is browser-visible only after secret screening; mock output remains server-only, is reread at the exact draft commit, and is applied only to the selected function node |
| fallback | advanced JSON remains usable for whole-workflow testing and schema checked when a direct function contract exists |
| compatibility | existing Studio editing, publishing, preview polling, canvas state, and repository-function ownership remain unchanged |

## Manual acceptance

1. Open a draft containing a trigger connected directly to a repository function.
2. Confirm the function selector and generated input fields match its input schema.
3. Add and remove optional values, nested values, and array items.
4. Enter an invalid value and confirm the field and summary block it before submission.
5. Switch to Advanced JSON and confirm malformed or schema-invalid JSON is rejected locally.
6. Run Structural Preview and inspect the formatted output and node-level trace diagnostics.
7. Refresh the route in the same tab and confirm the last valid non-sensitive payload is restored.
8. Enter a token, password, credential, or secret-like field and confirm it is not stored across a refresh.
9. Open a new tab and confirm the payload is not shared.
10. Publish the proposal, wait for the exact deployment, switch to Live Preview, and run the same payload.
11. Confirm the canvas displays node state from the matching live run.
12. Select a repository fixture and confirm Structural Preview uses its reviewed mock output while Live Preview still executes the exact deployment.
13. Modify the fixture input and confirm the fixture identity is cleared and the server rejects mismatched fixture input.
14. Inspect the proposal and workflow JSON and confirm no test payload or mock output was committed.
