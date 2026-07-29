# Canvas accessibility and scale acceptance

## Purpose

This runbook proves that the Flowcordia Studio React Flow canvas remains operable beyond a mouse-driven demonstration. Repository tests cover deterministic navigation and layout contracts, durable command wiring, bounded browser markup, and real 300-node ELK calculation. They do not prove real screen-reader behavior, touch ergonomics, browser rendering performance, or lower-resolution usability.

A private-beta candidate must preserve one reviewed acceptance record for the exact application commit. Do not infer canvas readiness from screenshots, a five-node fixture, repository typecheck, or a single browser.

## Implemented boundary

The current canvas contract provides:

- one named, keyboard-focusable canvas region with concise hidden instructions and a polite live-status region;
- keyboard-focusable React Flow nodes and edges with bounded public labels;
- accessible ordinary, condition-branch, terminal, and target handles;
- direct connection creation, target-only reconnection, edge selection, edge removal, and edge insertion through strict draft commands;
- native drag selection and Control/Command-modified node multi-selection;
- atomic grouped movement, duplicate, identity-only copy/paste, and confirmed multi-node removal;
- visible Undo and Redo controls plus Control/Command+Z, Control/Command+Shift+Z, and Control+Y outside text-entry surfaces;
- visible zoom-in, zoom-out, Fit, and exact 100% controls;
- pointer, wheel, trackpad, touch pan, wheel zoom, and multi-touch pinch zoom;
- 25–200% interactive zoom, automatic focus reveal, and a pannable/zoomable minimap for workflows with at least eight nodes;
- React Flow `onlyRenderVisibleElements` so off-screen interaction elements are not kept in the rendered layer;
- one explicit `Arrange workflow` action backed by pinned ELK layered layout, snapping to the existing 20-pixel grid and submitting one undoable `move_nodes` edit;
- a strict 500-position server ceiling so the 300-node reference workflow can be arranged atomically without widening duplicate or removal selection limits.

The browser never persists local React Flow deletion, selection, clipboard, or layout state as workflow truth. Every accepted structural or positional change still passes exact-version draft resolution, the portable workflow editor, complete workflow validation, durable history, and route revalidation.

This implemented boundary does not establish measured assistive-technology acceptance, measured large-graph browser performance, a public frame-time objective, multi-edge selection, freehand edge routing, arbitrary source retargeting, or unlimited graph size.

## Exact candidate identity

Record before testing:

- Flowcordia application commit;
- browser name and exact version;
- operating system and version;
- assistive technology and version when applicable;
- viewport width, height, and device-pixel ratio;
- input mode: keyboard, mouse/trackpad, or touch;
- reference workflow ID;
- node and edge counts;
- test operator and UTC start time.

Use synthetic workflow names and descriptions. Never preserve payloads, outputs, credentials, repository tokens, browser storage, internal actor IDs, or customer data.

## Reference graphs

Use three immutable synthetic workflows from one dedicated reference repository:

1. **Small:** 5 nodes covering trigger, action, condition branches, and output.
2. **Production-shaped:** at least 70 nodes with crossing branches, negative coordinates, waits, approvals, subflows, and multiple terminal paths.
3. **Stress:** 300 nodes and a bounded edge set arranged across at least ten rows and thirty columns before the automatic-layout procedure.

The exact workflow documents and generated artifacts must be committed and identified by immutable repository commit. Do not create graph shape dynamically in the browser during evidence collection.

## Keyboard-only procedure

Run without a pointing device:

1. Tab to the named workflow canvas region.
2. Confirm the region name and instructions are announced or exposed by the browser accessibility tree.
3. Tab through representative nodes, edges, handles, and visible controls. Confirm every target has a meaningful label and visible focus.
4. Select a node with Enter or Space and move it with the supported React Flow Arrow-key behavior. Confirm one snapped durable edit is persisted and announced.
5. Use Control/Command-modified selection to select multiple nodes, then move the group and confirm one `move_nodes` edit is created.
6. Use Control/Command+D and the visible Duplicate action in separate drafts. Confirm copies are offset and only internal selected-subgraph edges are duplicated.
7. Copy and paste a selection. Confirm only workflow and node identities are placed on the Flowcordia clipboard format and cross-workflow paste fails closed.
8. Press Delete or Backspace on selected nodes. Confirm the exact node and incident-edge counts are announced before one destructive confirmation.
9. Select an edge, remove it with Delete or Backspace, and confirm the viewport remains stable.
10. Traverse source and target handles, create an ordinary connection, and create both condition branches.
11. Attempt self, duplicate, trigger-target, output-source, occupied-branch, and cyclic connections. Confirm each fails closed.
12. Reconnect only an edge target and confirm the source and edge identity remain stable.
13. Use Undo and Redo after movement, duplication, deletion, reconnection, and arrangement. Confirm each restored graph is announced and persisted.
14. Activate `Arrange workflow`. Confirm one busy announcement, one durable positional command, a fitted refreshed viewport, and an Undo path back to the prior positions.
15. Use zoom-in, zoom-out, Fit, and 100% controls. Confirm every control has a meaningful accessible name.
16. Move focus to a node outside the viewport. Confirm React Flow reveals it without moving the node.

Any keyboard trap, unreachable editable action, unbounded Tab sequence, silent destructive edit, local-only graph mutation, or unexpected viewport reset is a stop-ship result.

## Screen-reader procedure

Run at minimum:

- NVDA with current Chrome on Windows;
- NVDA with current Firefox on Windows;
- VoiceOver with current Safari on macOS.

For each combination:

1. Navigate to the canvas region using landmarks or regions.
2. Confirm the workflow name and relationship instructions are understandable without decorative SVG content.
3. Focus representative trigger, condition, approval, subflow, and output nodes.
4. Confirm each node exposes name, operation, position, incoming/outgoing counts, and bounded runtime state when present.
5. Browse the hidden connection list and confirm source, target, and condition-branch relationships are understandable.
6. Execute connection, selection, duplicate, copy/paste, removal-confirmation, Undo/Redo, and automatic-layout procedures.
7. Confirm pending, success, no-op, cancellation, and bounded failure messages are announced once and in order.
8. Zoom, fit, reset, pan, and move nodes. Confirm announcements remain useful and expose no raw errors or internal identifiers.
9. Start a bounded live preview and confirm node-status changes remain understandable without payload or output disclosure.

Duplicate announcements, meaningless button names, decorative edge noise, lost virtual-cursor position, or secret-like browser output is a stop-ship result.

## Lower-resolution and touch procedure

Test at minimum:

- 1280×720 desktop viewport;
- 1024×768 landscape tablet viewport;
- 768×1024 portrait tablet viewport;
- 390×844 phone viewport using real or browser-emulated touch.

Verify:

- Add node, Arrange workflow, selection actions, zoom controls, and 100% reset remain reachable without covering critical guidance;
- controls have usable touch targets;
- single-pointer empty-space pan does not drag nodes;
- node drag does not pan the canvas;
- pinch zoom and two-finger trackpad gestures do not create node movement;
- selected nodes can be revealed after pan, Fit, and automatic layout;
- the minimap remains operable without blocking destructive confirmations or primary controls;
- no horizontal page scroll is introduced outside the canvas;
- browser zoom at 200% retains the primary canvas controls and instructions.

## Large-graph measurement

For the 70-node and 300-node references, record from a production build:

- time from navigation start until the canvas region and first node are focusable;
- time for Fit to update the viewport;
- time from activating Arrange workflow until the durable refreshed graph is fitted;
- Arrow-key focus and movement response across at least 100 actions;
- pointer-drag responsiveness for at least 20 movements;
- multi-selection, grouped movement, duplicate, confirmed removal, Undo, and Redo response;
- peak browser memory after initial render and after five minutes of navigation;
- long tasks over 50 milliseconds observed during render, pan, zoom, drag, and arrangement;
- whether announcements remain ordered and bounded.

Repository tests prove that real ELK returns finite grid-aligned positions for 300 nodes and that the route accepts one 300-position command. They do not substitute for the browser measurements above.

This contract does not set a public service objective. Preserve measurements and use them to define the next performance gate. A freeze, browser crash, multi-second repeated navigation stall, lost edit, or layout operation that cannot be undone is a stop-ship result regardless of average timing.

## Evidence record

Preserve a bounded JSON or Markdown record containing only:

- exact candidate and reference-repository identities;
- browser, operating-system, assistive-technology, viewport, and input-mode versions;
- node and edge counts;
- each fixed procedure step with `PASSED` or `FAILED`;
- bounded failure category and human-readable message;
- measured timings and memory values;
- start/completion timestamps;
- named operator;
- confirmation that no payload, output, credential, browser storage, raw error, or internal identity was recorded.

Screenshots or short recordings may supplement the record but never replace the structured result. Redact repository URLs or organization names when they identify private infrastructure.

## Exit criteria

This canvas slice is acceptable for private beta only when:

- the exact PR head is green on the complete required repository matrix;
- all keyboard-only steps pass on the 70-node and 300-node workflows;
- the required NVDA and VoiceOver combinations pass;
- lower-resolution and touch procedures pass;
- 70-node and 300-node measurements are preserved and reviewed;
- failures and limitations match the capability matrix;
- product copy distinguishes delivered automatic layout and visible-element rendering from unmeasured browser and assistive-technology acceptance.

A successful record proves only this candidate, reference graph set, and tested browser/assistive-technology matrix. It does not establish unlimited graph scale or general availability.
