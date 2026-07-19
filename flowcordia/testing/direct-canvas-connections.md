# Direct canvas connection acceptance

## Purpose

Prove that Studio creates workflow edges from explicit canvas handles without relying on an inspector dropdown, while preserving the durable `connect_nodes` command and server-owned topology validation.

## Interaction contract

- ordinary nodes expose one outgoing handle;
- condition nodes expose independent true and false handles;
- a used condition branch is disabled;
- output nodes are visibly terminal;
- non-trigger nodes expose an incoming target handle;
- choosing a source handle highlights only eligible targets;
- choosing the same source again, pressing Escape, selecting empty canvas space, or completing a connection clears pending state;
- node dragging and node selection remain independent from connection handles;
- edge removal remains explicit in the inspector.

## Topology rules

Both the browser helper and portable workflow editor reject:

- self-connections;
- outgoing connections from output nodes;
- incoming connections to trigger nodes;
- duplicate source-target connections;
- duplicate true or false condition branches;
- branch metadata on non-condition nodes;
- missing branch metadata on condition nodes;
- directed cycles.

The server remains authoritative. Browser eligibility is only an interaction aid and cannot weaken durable validation.

## Static ownership assertions

- `WorkflowStudioCanvas.tsx` is the only owner of node dragging, source handles, target handles, pending connection state, and edge rendering.
- `canvas-connections.ts` is pure and creates only the existing `connect_nodes` command.
- `WorkflowStudio.tsx` composes the canvas and no longer contains the legacy `Connect to` select or local canvas implementation.
- `NodeInspector` retains connection evidence and edge removal, but does not create edges.
- no raw payload, configuration value, credential value, repository identity, environment identity, or worker identity is needed to connect nodes.

## Repository tests

Tests must prove:

1. ordinary, condition, and terminal source-handle projection;
2. used condition branches are disabled;
3. exact ordinary and conditional command construction;
4. self, incoming-trigger, output-source, duplicate-branch, and cycle rejection;
5. portable editor rejection for output-source, trigger-target, and cycle commands;
6. existing duplicate and condition-branch enforcement remains unchanged;
7. the legacy inspector connection selector is absent;
8. the new canvas component is composed exactly once.

## Connected acceptance

Using the configured reference repository:

1. start an exact-head draft;
2. drag nodes and confirm snapped positions still persist;
3. connect an ordinary node directly from its source handle to a target handle;
4. connect true and false condition branches independently;
5. confirm used condition handles disable immediately after revalidation;
6. attempt self, trigger-target, output-source, duplicate, and cyclic connections and confirm no draft mutation succeeds;
7. reload Studio and confirm canonical edges and branch labels render at the exact saved positions;
8. remove an edge from the inspector and confirm the corresponding handle becomes available;
9. publish, compile, structurally preview, deploy, and execute the resulting workflow;
10. confirm pending connection state never survives workflow, draft-version, or permission changes.

## Rollback

Revert the commit. No database migration, proposal transition, deployment record, runtime API, or GitHub protocol changes. Rollback restores inspector-based connection creation while preserving existing canonical edges.
