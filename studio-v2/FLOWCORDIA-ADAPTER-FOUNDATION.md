# Flowcordia Studio V2 adapter foundation

This document records the first Flowcordia-owned implementation layer built on top of the preserved Activepieces and Windmill source references.

## Ownership boundary

The upstream mirrors remain unchanged:

- `studio-v2/activepieces-web/`
- `studio-v2/activepieces-core-nodes/`
- `studio-v2/windmill-frontend/`

Flowcordia-owned Studio V2 contracts live in `packages/flowcordia-workflow/src/studio-v2*.ts` because `@flowcordia/workflow` is already the canonical workflow model shared by Studio, persistence, source control, and runtime adapters.

## Current foundation

The adapter catalog tracks fourteen imported node concepts:

- Manual trigger
- Webhook trigger
- Schedule trigger
- HTTP request
- TypeScript Source
- Condition
- Loop over items
- Wait
- Data mapper
- Math helper
- Text helper
- Date helper
- Store
- Subflow

Nodes backed by existing Flowcordia operations are marked `native` and may be exposed by a Studio UI. Nodes that still require runtime or persistence adaptation are marked `adapter_required` and remain unavailable in the product until their adapters are proven.

## TypeScript Source contract

Studio V2 Source nodes:

- support TypeScript only;
- use the `run` entrypoint;
- expose workflow input, previous-step outputs, variables, execution metadata, and a runtime credential accessor;
- serialize only opaque credential reference names;
- reject raw credential properties in the workflow document;
- have a bounded source length.

The runtime credential accessor is intentionally not serialized into the workflow document.

## Local-first lifecycle

The lifecycle contract supports:

1. draft editing and saving;
2. testing the current revision;
3. promotion of a successfully tested revision to staging;
4. deployment of the staged revision.

Source control is a separate optional provider. The disabled provider proves that saving, testing, staging, and deployment do not depend on GitHub or any other repository.

## First vertical slice

`createStudioV2VerticalSliceWorkflow()` produces this canonical fixture:

```text
Manual Trigger
  -> TypeScript Source
  -> HTTP Request
  -> Condition
      -> Success Output
      -> Failure Output
```

This fixture is the contract target for the first React Studio V2 screen. It does not change the current Flowcordia Studio or runtime.

## Next implementation milestone

Create a new React Studio V2 surface that consumes these contracts and renders the vertical slice using the Activepieces-derived interaction model. The UI should initially use adapter interfaces for persistence and testing, then connect those interfaces to existing Flowcordia services in a later focused PR.
