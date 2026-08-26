# Flowcordia Studio V2

Studio V2 is the browser authoring surface for one persisted Flowcordia workflow. The visual
Activepieces editor and Sandpack Source workspace are two views of the same versioned workspace.
Both views read and write the canonical `@flowcordia/workflow` document. Flowcordia remains the
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
- `source/workflow-source.ts` prints the complete canonical workflow as deterministic TypeScript.
- `source/workflow-source.server.ts` parses that TypeScript without evaluating it, rejects dynamic
  expressions, and validates the result against the canonical workflow schema before saving.
- `source/generated-source.server.ts` uses Flowcordia's production Studio V2 compiler to expose the
  exact generated Trigger.dev task as a managed, read-only source file.
