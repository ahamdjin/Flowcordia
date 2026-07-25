# Canvas edge editing acceptance

## Goal

Prove that a connection can be selected, inspected, retargeted, reassigned between available condition branches, or removed without bypassing the durable workflow editor or creating a transient invalid graph.

## Delivered boundary

- every rendered connection has one bounded pointer and keyboard hit target independent of its decorative SVG stroke;
- selected connections expose a visible state, a readable label, and one Studio inspector;
- `E` from a focused node enters its first deterministic connected edge;
- Left and Right traverse connections in deterministic visual order;
- Home and End select the first and last connection;
- Delete and Backspace remove a selected connection only when the draft is writable;
- atomic replacement preserves the edge ID and source while changing its target and optional true/false branch in one exact-version draft mutation;
- replacement validation evaluates the graph with the selected edge removed, then independently rejects missing identities, self-connections, output sources, trigger targets, cycles, duplicate targets, and occupied condition branches;
- changing the source remains an explicit remove-and-connect operation rather than an ambiguous multi-entity mutation.

## Security and ownership

The browser projects only public node and edge identities already present in the workflow graph. It cannot choose tenant, repository, draft owner, actor, base revision, or durable version. The server accepts one strict `replace_edge` command, re-resolves the active draft and exact expected version, applies the portable editor, validates the complete resulting workflow, records a bounded command summary, and persists only through the existing optimistic draft transaction.

No payload, output, credential, provider response, repository token, environment value, or internal actor identity is added to edge selection or audit presentation.

## Failure behavior

- a missing or concurrently removed edge fails as `edge_not_found`;
- a stale draft version fails through the existing draft conflict boundary;
- a source or target that no longer exists fails closed;
- a replacement that creates a cycle, duplicate route, occupied branch, or invalid workflow is not partially applied;
- the original edge remains unchanged when validation fails;
- read-only users may inspect a selected edge but cannot save or remove it;
- losing the selected edge after a successful removal returns focus to the canvas rather than leaving a dead keyboard target.

## Repository verification

The focused gate must run:

- portable `replace_edge` editor regressions;
- existing direct connection regressions;
- canvas navigation regressions;
- pure edge target, branch, label, order, and command contracts;
- bounded edge-inspector rendering assertions;
- exact changed-source formatting.

The complete repository matrix still owns lint, package exports, typecheck, unit shards, production build, and E2E.

## Manual acceptance

On the 70-node reference workflow:

1. select representative ordinary and conditional edges by pointer;
2. focus a node, press `E`, and traverse at least twenty edges using only the keyboard;
3. confirm selected strokes remain visible at 20%, 100%, and 180% zoom;
4. retarget an ordinary edge and confirm its source and ID remain unchanged;
5. move a condition edge to the only available branch and confirm an occupied branch is disabled;
6. attempt trigger, self, duplicate, and cyclic targets and confirm each remains unavailable;
7. delete a selected edge with Delete and Backspace in separate drafts;
8. repeat in read-only mode and confirm mutation controls are absent or disabled;
9. confirm screen readers announce source, target, branch, selection, success, and bounded failure messages;
10. confirm zoom, pan, and minimap state do not reset during a successful replacement.

Any keyboard trap, invisible selected edge, partial mutation, source drift, lost edge identity, invalid graph persistence, or mutation from read-only state is stop-ship.

## Deliberate exclusions

This slice does not deliver multi-edge selection, freehand edge routing, arbitrary source retargeting, copy/paste, undo/redo, automatic layout, viewport virtualization, or a measured large-graph service objective. Those remain separate reviewed capabilities.
