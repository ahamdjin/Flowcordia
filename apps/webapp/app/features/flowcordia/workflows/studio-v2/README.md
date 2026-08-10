# Flowcordia Studio V2

Studio V2 is the browser authoring surface for one persisted Flowcordia workflow. The visual
Activepieces editor and Sandpack Source workspace are two views of the same versioned workspace.
Source also projects the canonical workflow through the upstream Flyde graph editor so nodes remain
visible beside their TypeScript representation. Flyde is an adapter view; Flowcordia remains the
system of record and Trigger.dev remains the execution engine.

## Execution contract

- Save operations use optimistic workspace versions.
- Test executes the saved graph through `@flowcordia/runtime`; it is not a UI-only validation.
- Test results expose bounded node traces with input, output, timing, failure, and cancellation state.
- Editor autosave reports its saving state to the host. Source and lifecycle actions remain disabled
  until that write completes.

## Release contract

1. `Test` must succeed for the exact current workspace version.
2. `Stage` validates the graph, compiles it, and verifies required encrypted credentials.
3. `Deploy` promotes that immutable staged release through the existing Trigger deployment service.
4. `Rollback` promotes a previously deployed release and records the transition in the release audit
   log.

The lifecycle bar polls while a deployment is in progress. A release is never inferred from browser
state; server projections remain authoritative.

## Credentials and integrations

- Generic Source, HTTP, and Webhook credential references resolve from secret environment variables.
- Activepieces piece nodes use the same encrypted connection environment key in staging and runtime.
- Missing, non-secret, invalid, or conflicting credential bindings block staging before deployment.
- Secret values are not returned by loaders or stored in the Studio workspace.

## Boundaries

- `workspace-service.server.ts` owns persistence and shared-runtime testing.
- `release-service.server.ts` owns stage, deploy, and rollback orchestration.
- `workspace-http.ts` is the validated transport contract used by the route.
- `StudioV2ActivepiecesHost.tsx` is the visual-editor bridge.
- `source/` owns the Sandpack adapter and source workspace UI. Sandpack does not execute code in the
  browser.
- `source/StudioV2FlydeGraph.client.tsx` mounts `@flyde/editor` 1.0.46. The adapter is intentionally
  read-only in Source and never uses Flyde persistence or execution.
- `source/generated-source.server.ts` uses Flowcordia's production Studio V2 compiler to expose the
  exact generated Trigger.dev task as a managed, read-only source file.

## Upstream provenance

- Flyde reference: commit `913ff75c6781259da35c32fd001a90607756cb24`.
- Kestra topology/compiler reference: commit `933b19719cab7e2e11bac3dfffa4ae8d51a8a424`.
- `@flyde/core` is MIT licensed. `@flyde/editor` is AGPL-3.0; any distributed or network-hosted
  product build must satisfy the applicable AGPL source-availability obligations.
- Kestra's Vue Flow editor is not copied into the React webapp. It remains a pinned architecture
  reference rather than introducing a second frontend runtime.
