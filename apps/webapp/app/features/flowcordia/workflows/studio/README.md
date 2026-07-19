# Flowcordia workflow Studio

This feature renders and edits canonical workflows indexed from a project's connected production repository. Studio remains a browser client of server-owned identity, authorization, GitHub, proposal, deployment, and runtime boundaries.

## Component ownership

- `query.server.ts` resolves the authenticated project, connected repository, exact workflow-index scope, active draft, function catalog, proposal preview, and bounded browser projection.
- `WorkflowStudio.tsx` owns repository synchronization, durable draft editing, proposal publication, canvas layout, node inspection, preview status, polling while deployment or execution is active, and live node projection.
- `WorkflowStudioNodeConfigurationEditor.tsx` owns bounded forms for the currently supported visual operations. It never falls back to raw JSON.
- `node-configuration.ts` owns the pure form-to-contract conversion and refuses unknown keys, unsupported operations, invalid destinations, invalid schedule identity, and condition values that cannot be round-tripped safely.
- `WorkflowStudioTestingPanel.tsx` is the only browser owner of structural-preview and exact-deployment live-run submissions.
- `WorkflowFunctionTestPanel.tsx` owns schema-driven input, fixture selection, session-only sensitive fields, advanced JSON fallback for test payloads, and test-result presentation.
- `testing-command.ts` is the pure contract for test availability and exact test command shapes.
- `presentation.ts` creates browser-safe graph and index DTOs without serializing developer-owned configuration values.
- `commands.server.ts` performs an immediate authorized full synchronization through the durable index service.

The node-configuration editor and testing panel are composed beside the canvas. They do not wrap Studio, inject CSS, hide duplicate controls, or infer permissions from presentation state alone.

## Structured configuration coverage

Studio provides explicit forms for:

- manual, authenticated API, and output nodes with no configuration fields;
- schedule cron and IANA timezone;
- public-webhook method and absolute route path, while clearly marking signed ingress as not yet deployed;
- HTTP method and credential-free HTTPS destination;
- durable wait duration expressed in seconds, minutes, hours, or days and serialized back to exact seconds;
- condition input path, supported operator, and scalar string, number, boolean, or null comparison value.

Studio deliberately blocks editing when a visual node contains unknown configuration keys. It also blocks object or array comparison values and operations without an owned form. Those cases remain repository-owned until a versioned visual contract can preserve them exactly.

## Connections

- The durable workflow index supplies public workflow identity and exact source coordinates.
- `GitHubWorkflowStore` rereads the exact commit, blob, and path selected by the server.
- `workflowSha256` proves the canonical document still matches the durable index.
- The function catalog query reads `.flowcordia/functions.json` at the graph's exact commit and exposes bounded metadata only.
- Structured node forms submit one `set_node_configuration` command containing only the operation's documented fields. The server re-runs inline-secret detection and complete workflow validation before persisting the draft version.
- Structural preview submits one durable draft ID, expected draft version, JSON payload, and optional bounded fixture identity to the draft command route.
- Live preview submits one public workflow ID, server-presented exact proposal head, browser-generated request UUID, and JSON payload to the preview command route. The server re-resolves every trusted identity before execution.
- Preview polling remains in `WorkflowStudio.tsx` because the canvas owns deployment status and correlated live node evidence, not the command that starts a run.

## Browser boundary

The browser may choose a public workflow ID, request synchronization, submit bounded visual edits, select a repository function and fixture, provide a test payload, and request an exact-head preview run.

It cannot choose tenant, organization, project, installation, repository, production branch, database identity, deployment worker, environment API key, actor, policy, or runtime credentials. It cannot turn an unsupported or lossy node configuration into an editable form.

Developer-owned configuration values are not serialized by the read projection. Visual nodes receive only their explicitly editable configuration. The inspector exposes key names, credential-reference names, runtime hints, and code-reference metadata without becoming a general secret or repository-content surface.

## Failure behavior

- Unknown configuration keys fail closed with an explanation; Studio does not drop them.
- Unsupported operations fail closed; Studio does not guess a form.
- Schedule, webhook, HTTP, wait, and condition inputs receive bounded client feedback, while the server remains authoritative.
- HTTP credentials remain credential references and environment bindings, never URL userinfo or inline fields.
- Public webhook configuration can be authored, but the UI states that signed ingress binding remains planned.
- Structural testing is disabled for missing or stale drafts, repository-index movement, load errors, or missing Studio write permission.
- Live testing is disabled unless the preview is `READY`, has an exact head, and task-trigger authorization is present.
- Submitted commands use one fetcher each and revalidate only after the owned mutation settles.
- Server failures return bounded messages. Payloads, outputs, credentials, internal IDs, provider metadata, stack traces, and raw exceptions are not added to route-level status banners.

## Verification

Structured node configuration requires:

- pure contract tests for every supported visual operation;
- unknown-key, unsupported-operation, invalid URL, invalid timezone, invalid path, invalid duration, and lossy condition-value tests;
- exact duration and scalar condition round-trip tests;
- a source assertion that the raw `Configuration (JSON)` control cannot return;
- production webapp typecheck, build, unit-test shards, and E2E checks on the exact pull-request head;
- connected acceptance that edits each supported form, publishes the resulting canonical JSON, compiles it, and confirms structural and live behavior still agree.
