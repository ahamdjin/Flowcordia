# Flowcordia workflow Studio

This feature renders and edits canonical workflows indexed from a project's connected production repository. Studio remains a browser client of server-owned identity, authorization, GitHub, proposal, deployment, and runtime boundaries.

## Component ownership

- `query.server.ts` resolves the authenticated project, connected repository, exact workflow-index scope, active draft, function catalog, proposal preview, and bounded browser projection.
- `WorkflowStudio.tsx` owns repository synchronization, durable draft editing, proposal publication, node inspection, preview status, polling while deployment or execution is active, and live node projection.
- `WorkflowStudioCanvas.tsx` is the only owner of the React Flow presentation boundary. It projects the browser-safe graph into controlled React Flow nodes and edges, renders custom Flowcordia node and edge types, and owns dragging, handles, selection, target reconnection, keyboard deletion, accessible announcements, zoom, pan, fit-to-workflow, visible-element rendering, and minimap presentation.
- `canvas-react-flow.ts` translates React Flow connection and target-reconnection events into exact portable `connect_nodes` and `replace_edge` commands. It never mutates workflow truth locally.
- `canvas-navigation.ts` retains pure viewport, ordering, and directional-navigation regression helpers used by the bounded canvas contract. React Flow owns the live viewport and keyboard interaction mechanics.
- `canvas-connections.ts` owns pure source-handle projection, target eligibility, cycle checks, and exact `connect_nodes` command construction.
- `canvas-selection.ts` owns browser-safe node selection, identity-only clipboard payloads, grouped movement commands, deterministic duplicate offsets, and atomic server-side subgraph-duplication requests.
- `WorkflowStudioNodeConfigurationEditor.tsx` owns bounded forms for the currently supported visual operations. It never falls back to raw JSON.
- `WorkflowStudioCredentialReferencesEditor.tsx` owns HTTP credential reference names and deterministic environment-key projection without any secret-value access.
- `node-configuration.ts` owns the pure form-to-contract conversion. HTTP consumes the same portable parser as the durable editor, compiler, and live runtime; other forms refuse unknown keys, unsupported operations, invalid destinations, invalid schedule identity, and condition values that cannot be round-tripped safely.
- `WorkflowStudioExecutionPolicyEditor.tsx` owns the trigger-scoped queue, machine, duration, and whole-run retry form.
- `execution-policy.ts` owns browser hydration and canonical form serialization while consuming the shared portable execution-policy constants.
- `WorkflowStudioTestingPanel.tsx` is the only browser owner of structural-preview and exact-deployment live-run submissions.
- `WorkflowFunctionTestPanel.tsx` owns schema-driven input, fixture selection, session-only sensitive fields, advanced JSON fallback for test payloads, and test-result presentation.
- `testing-command.ts` is the pure contract for test availability and exact test command shapes.
- `presentation.ts` creates browser-safe graph and index DTOs without serializing developer-owned configuration values.
- `commands.server.ts` performs authenticated synchronization and accepts only strict, bounded draft commands.
- `history.ts` and the draft repository own durable visual revision bounds, redo-branch pruning, and version-checked restore operations. The browser never supplies workflow snapshots for undo or redo.

The configuration, execution-policy, and testing surfaces are composed beside the canvas. They do not wrap Studio, inject CSS, hide duplicate controls, or infer permissions from presentation state alone.

## Structured configuration coverage

Studio provides explicit forms for:

- manual, authenticated API, and output nodes with no configuration fields;
- schedule cron and IANA timezone;
- public-webhook method and absolute route path, while clearly marking signed ingress as not yet deployed;
- HTTP method, credential-free HTTPS destination, input/no-body choice, response representation, request timeout, and maximum response bytes;
- durable wait duration expressed in seconds, minutes, hours, or days and serialized back to exact seconds;
- condition input path, supported operator, and scalar string, number, boolean, or null comparison value.

Studio deliberately blocks editing when a visual node contains unknown configuration keys. It also blocks object or array comparison values and operations without an owned form. Those cases remain repository-owned until a versioned visual contract can preserve them exactly.

## Execution policy coverage

Execution policy is editable only on a visual trigger because the generated Trigger.dev task is the single durable boundary for the complete workflow run.

Studio supports:

- queue names using the compiler's bounded character contract;
- the exact Trigger.dev machine preset allowlist;
- maximum run duration between 5 and 2,147,483,646 seconds;
- whole-run retry with 1–10 attempts, delays up to 24 hours, ordered minimum and maximum delays, and a factor from 1–10.

Studio does not accept invocation concurrency keys, node-scoped policy, independent node retry, arbitrary machine names, credentials, environment values, or deployment identity. Existing unsupported policy remains visible but blocked from visual mutation.

## HTTP credential references

Visual HTTP nodes can bind reviewed credential reference names. Studio derives the exact environment key, such as `billing-api` → `FLOWCORDIA_CREDENTIAL_BILLING_API`, but never lists, reads, accepts, or displays the environment value. Redirects cannot be enabled in Studio because the live adapter requires the operator to name the final allowlisted HTTPS destination.

References use a bounded lowercase slug contract, remain unique, and are limited to 16 per node. Existing invalid or developer-owned bindings remain repository-owned. The deployed task resolves the environment value only at execution time and retains the inherited JSON-object and forbidden-header checks.

## Direct canvas connections

Studio creates and edits edges directly through React Flow while keeping the durable editor authoritative:

- ordinary nodes expose one outgoing handle;
- condition nodes expose independent true and false handles;
- output nodes expose a disabled terminal handle;
- trigger nodes do not expose incoming handles;
- React Flow asks the existing target-eligibility contract whether a proposed connection is valid before submitting it;
- each edge exposes a bounded pointer and keyboard selection target;
- dragging a selected edge's target end submits one atomic `replace_edge` command while its source remains stable;
- selected edges open the existing inspector for atomic target or condition-branch replacement;
- Delete and Backspace remove a selected writable edge, while read-only users retain inspection;
- node removal remains in the existing node inspector so there is one explicit destructive command surface;
- changing an edge source remains an explicit remove-and-connect operation rather than an ambiguous multi-entity mutation.

The browser prevents obvious invalid topology for feedback, but the portable workflow editor remains authoritative and independently rejects output-source, trigger-target, duplicate, branch, self, and cyclic connections. React Flow never writes an optimistic workflow document or bypasses the active draft version.

## Accessible canvas navigation

The canvas is one named region with bounded instructions, a polite live status projection, and a hidden relationship list. The React Flow boundary supports:

- keyboard-focusable nodes and edges with public name, kind, operation, position, incoming/outgoing edge counts, and bounded runtime status;
- Enter or Space selection and React Flow's keyboard node movement, including the larger Shift-modified step;
- accessible source and target handles with branch-specific labels and disabled-state explanations;
- visible zoom-in, zoom-out, fit-view, and exact 100% reset controls with Flowcordia-specific accessible labels;
- mouse, trackpad, and touch panning, wheel zoom, and multi-touch pinch zoom;
- grid snapping in exact 20-pixel increments for pointer and keyboard movement before the durable `move_node` command is submitted;
- interactive zoom bounds from 25% through 200%;
- automatic reveal when keyboard focus moves to a node outside the visible viewport;
- a pannable and zoomable overview minimap;
- `onlyRenderVisibleElements` so off-screen nodes and edges are removed from the rendered interaction layer for large workflows.

## Multi-selection and clipboard editing

React Flow owns live selection mechanics while the durable workflow draft remains authoritative:

- drag-selection and Control/Command-modified selection choose multiple nodes without a custom selection engine;
- grouped pointer movement submits one atomic `move_nodes` command after the drag completes;
- Control/Command+D and the visible Duplicate action submit one atomic `duplicate_subgraph` command;
- Control/Command+C writes only the workflow ID and selected node IDs to the clipboard, never workflow JSON, configuration, credentials, source code, or internal storage identity;
- paste is accepted only back into the originating workflow, where the server resolves the current canonical nodes and clones only their internal edges;
- repeated duplicate and paste operations use bounded progressive offsets so copies do not stack directly on one another;
- Delete and Backspace continue to use the explicit edge-removal and node-inspector destructive surfaces rather than allowing React Flow to mutate local workflow truth.

## Durable undo and redo

Undo and redo restore server-owned visual document revisions rather than replaying inverse browser commands:

- every accepted visual edit stores a validated canonical snapshot and SHA-256 integrity hash;
- the active draft keeps a logical history cursor and high-water mark while its optimistic draft version always increases;
- undo and redo require the exact current draft version and recheck the repository-backed base before restoring a revision;
- a new edit after undo prunes the redo branch atomically;
- the browser receives only `canUndo` and `canRedo`, never revision snapshots or internal cursor values;
- Control/Command+Z, Control/Command+Shift+Z, Control+Y, and accessible header buttons submit strict restore operations;
- history shortcuts are ignored while focus is inside text, configuration, or source-editing controls;
- source-file buffers retain their separate versioned persistence path and are not silently included in visual workflow history.

The pure navigation contract is exercised with 300 nodes. React Flow visible-element rendering, native multi-selection, atomic grouped movement, identity-only copy/paste, deterministic subgraph duplication, and durable server-owned undo/redo are delivered and protected by focused tests. Automatic layout, measured browser-frame performance, and completed assistive-technology acceptance for 70- or 300-node graphs remain separate reviewed work.

## Connections

- The durable workflow index supplies public workflow identity and exact source coordinates.
- `GitHubWorkflowStore` rereads the exact commit, blob, and path selected by the server.
- `workflowSha256` proves the canonical document still matches the durable index.
- The function catalog query reads `.flowcordia/functions.json` at the graph's exact commit and exposes bounded metadata only.
- Structured node forms submit one `set_node_configuration` command containing only the operation's documented fields. The server re-runs inline-secret detection and complete workflow validation before persisting the draft version.
- The execution-policy form submits one `set_node_runtime` command containing only queue, machine, duration, and bounded retry. The portable editor rejects non-trigger scope and reuses the same binding validator consumed by the compiler.
- Structural preview submits one durable draft ID, expected draft version, JSON payload, and optional bounded fixture identity to the draft command route.
- Live preview submits one public workflow ID, server-presented exact proposal head, browser-generated request UUID, and JSON payload to the preview command route. The server re-resolves every trusted identity before execution.
- Preview polling remains in `WorkflowStudio.tsx` because the canvas owns deployment status and correlated live node evidence, not the command that starts a run.

## Browser boundary

The browser may choose a public workflow ID, request synchronization, submit bounded visual edits, select a repository function and fixture, provide a test payload, and request an exact-head preview run.

It cannot choose tenant, organization, project, installation, repository, production branch, database identity, deployment worker, environment API key, actor, policy, runtime credentials, or invocation concurrency identity. It cannot turn unsupported, node-scoped, or lossy runtime policy into an editable form.

Developer-owned configuration values are not serialized by the read projection. Visual nodes receive only their explicitly editable configuration. Runtime projection is bounded to portable policy fields and never includes queue internals, worker identity, environment credentials, or deployment secrets.

## Failure behavior

- Unknown configuration keys fail closed with an explanation; Studio does not drop them.
- Unsupported operations fail closed; Studio does not guess a form.
- Schedule, webhook, HTTP, wait, condition, and execution-policy inputs receive bounded client feedback, while the server remains authoritative.
- Runtime policy on a non-trigger, developer-owned trigger, unsupported machine, invalid queue, invalid duration, invalid retry, or concurrency-key declaration is rejected by the durable editor boundary.
- HTTP credentials remain credential references and environment bindings, never URL userinfo or inline fields. GET and HEAD reject input bodies; timeouts and response sizes stay inside portable bounds.
- Public webhook configuration can be authored, but the UI states that signed ingress binding remains planned.
- Structural testing is disabled for missing or stale drafts, repository-index movement, load errors, or missing Studio write permission.
- Live testing is disabled unless the preview is `READY`, has an exact head, and task-trigger authorization is present.
- Submitted commands use one fetcher each and revalidate only after the owned mutation settles.
- Server failures return bounded messages. Payloads, outputs, credentials, internal IDs, provider metadata, stack traces, and raw exceptions are not added to route-level status banners.
- Unsupported automatic layout, multi-edge selection, freehand routing, or arbitrary source retargeting is never implied by React Flow's viewport controls.

## Verification

Studio form changes require:

- pure contract tests for every supported visual operation and execution-policy field;
- unknown-key, unsupported-operation, invalid URL, invalid timezone, invalid path, invalid duration, lossy condition-value, runtime-scope, machine, queue, retry, and concurrency-key tests;
- exact configuration, duration, scalar condition, and execution-policy round-trip tests;
- source assertions that raw configuration JSON and duplicate execution-policy ownership cannot return;
- strict command-schema tests, including template parity for authenticated API triggers;
- compiler tests proving the same shared policy contract governs generated tasks;
- React Flow adapter tests for ordinary and conditional connection creation, cyclic/trigger rejection, target-only reconnection, and branch preservation;
- permanent canvas contracts for direct connections, edge editing, accessible graph relationships, visible controls, focusability, pinch/pan, minimap, visible-element rendering, native multi-selection, identity-only clipboard payloads, grouped movement, subgraph duplication, durable history, public history availability, and hundreds-of-nodes pure navigation;
- production package and webapp typecheck, build, unit-test shards, and E2E checks on the exact pull-request head;
- connected acceptance that edits each supported form, publishes canonical JSON, compiles the exact generated task, and confirms structural and live behavior still agree;
- manual browser checks at lower resolutions plus keyboard-only and screen-reader acceptance before private beta.

## Production execution proof

`WorkflowProductionProofPanel` is a separate destructive surface after structural and preview testing. It resolves the latest merged proposal, requires the latest deployed production worker to use that exact merge commit, rechecks task-trigger RBAC server-side, rejects inline secret-like payloads, requires `RUN_FLOWCORDIA_PRODUCTION_PROOF`, locks the run to the deployment version, and projects only bounded identity/status/node evidence. Inputs are never written to session storage, workflow state, proposal state, or audit payloads.
