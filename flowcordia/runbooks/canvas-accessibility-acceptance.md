# Canvas accessibility and scale acceptance

## Purpose

This runbook proves that the custom Flowcordia Studio canvas remains operable beyond a mouse-driven demonstration. Repository tests cover deterministic navigation, viewport math, source ownership, and bounded browser markup. They do not prove real screen-reader behavior, touch ergonomics, browser rendering performance, or lower-resolution usability.

A private-beta candidate must preserve one reviewed acceptance record for the exact application commit. Do not infer canvas readiness from screenshots, a five-node fixture, repository typecheck, or a single browser.

## Implemented boundary

The current canvas contract provides:

- a named keyboard-focusable canvas region with concise instructions;
- one roving node focus target and geometric Arrow-key traversal;
- Home and End traversal through deterministic visual order;
- Alt+Arrow movement on the 20-pixel grid;
- bounded node names, operation, position, connection counts, and runtime status for assistive technology;
- a hidden readable connection list independent of decorative SVG edges;
- source-handle keyboard activation followed by Arrow navigation and Enter on an eligible target node;
- plus/minus zoom, zero reset, and fit-to-workflow shortcuts with visible equivalents;
- cursor-anchored zoom, wheel pan, empty-space pointer drag, and single-pointer touch pan;
- 20–180% interactive zoom plus an overview-only fit scale down to 1%;
- automatic viewport reveal for keyboard-selected nodes;
- a responsive minimap on normal-width screens;
- precomputed connection counts rather than per-node edge rescans.

This acceptance does not approve edge selection/editing, copy/paste, undo/redo, automatic layout, viewport virtualization, multi-touch pinch, or an arbitrary upper graph-size promise. Those require separate reviewed contracts and evidence.

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
3. **Stress:** 300 nodes and a bounded edge set arranged across at least ten rows and thirty columns.

The exact workflow documents and generated artifacts must be committed and identified by immutable repository commit. Do not create graph shape dynamically in the browser during evidence collection.

## Keyboard-only procedure

Run without a pointing device:

1. Tab to the named workflow canvas region.
2. Confirm the region name and instructions are announced or exposed by the browser accessibility tree.
3. Press an Arrow key and confirm focus enters the selected or first deterministic node.
4. Traverse left, right, up, and down. Confirm the nearest geometric candidate receives focus and an absent candidate produces a bounded announcement.
5. Press Home and End. Confirm deterministic first and last nodes receive focus and become visible.
6. Move a writable node with Alt+Arrow. Confirm exactly one 20-pixel grid step is persisted and announced.
7. Tab from the active node to each available source handle. Confirm unrelated node handles do not enter the Tab sequence.
8. Activate a source handle, navigate to an eligible target node, and press Enter. Confirm one exact edge command is created.
9. Repeat with an ineligible self, duplicate, trigger target, output source, condition branch conflict, and cyclic target. Confirm each fails closed.
10. Press Escape during a pending connection. Confirm pending state and guidance clear.
11. Use plus, minus, zero, and F. Confirm visible controls produce equivalent results.
12. Move focus to a node outside the viewport. Confirm the viewport reveals it without moving the node.
13. Add and remove an edge. Confirm the current zoom and pan are preserved.

Any keyboard trap, unreachable active node, unbounded Tab sequence, silent destructive edit, or viewport reset during an ordinary edge edit is a stop-ship result.

## Screen-reader procedure

Run at minimum:

- NVDA with current Chrome on Windows;
- NVDA with current Firefox on Windows;
- VoiceOver with current Safari on macOS.

For each combination:

1. Navigate to the canvas region using landmarks/regions.
2. Confirm the workflow name, node count, and edge count are understandable without reading visual SVG content.
3. Focus representative trigger, condition, approval, subflow, and output nodes.
4. Confirm each node exposes name, role, operation, position, incoming/outgoing counts, selected state, and bounded runtime state when present.
5. Browse the hidden connection list and confirm source, target, and condition branch relationships are understandable.
6. Execute the complete keyboard connection procedure and confirm pending, success, cancellation, and failure messages are announced once.
7. Zoom, fit, reset, pan, and move nodes. Confirm announcements are useful and do not expose raw errors or internal identifiers.
8. Start a bounded live preview and confirm node status changes remain understandable without payload or output disclosure.

Duplicate announcements, meaningless button names, decorative edge noise, lost virtual cursor position, or secret-like browser output is a stop-ship result.

## Lower-resolution and touch procedure

Test at minimum:

- 1280×720 desktop viewport;
- 1024×768 landscape tablet viewport;
- 768×1024 portrait tablet viewport;
- 390×844 phone viewport using real or browser-emulated touch.

Verify:

- zoom and Fit controls remain visible and do not overlap critical connection guidance;
- controls have usable touch targets;
- single-pointer empty-space pan does not drag nodes;
- node drag does not pan the canvas;
- selected nodes can be revealed after pan and fit;
- the minimap hides where space is insufficient without removing Fit;
- no horizontal page scroll is introduced outside the canvas;
- browser zoom at 200% retains the primary canvas controls and instructions.

Multi-touch pinch is not part of the accepted boundary and must not be advertised.

## Large-graph measurement

For the 70-node and 300-node references, record from a production build:

- time from navigation start until the canvas region and first node are focusable;
- time for Fit to update the viewport;
- Arrow-key focus response across at least 100 movements;
- pointer-drag responsiveness for at least 20 movements;
- peak browser memory after initial render and after five minutes of navigation;
- long tasks over 50 milliseconds observed during render, pan, zoom, and drag;
- whether announcements remain ordered and bounded.

This first contract does not set a public service objective. Preserve measurements and use them to define the next virtualization/performance gate. A freeze, browser crash, multi-second repeated navigation stall, or lost edit is a stop-ship result regardless of average timing.

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
- all keyboard-only steps pass on the 70-node workflow;
- the required NVDA and VoiceOver combinations pass;
- lower-resolution and touch procedures pass;
- 70-node and 300-node measurements are preserved and reviewed;
- failures and limitations match the capability matrix;
- no unsupported history, layout, edge-editing, virtualization, or pinch claim appears in product copy.

A successful record proves only this candidate, reference graph set, and tested browser/assistive-technology matrix. It does not establish unlimited graph scale or general availability.
