# Flowcordia Studio V2 React surface

This folder contains the first isolated React consumer of the Studio V2 contracts.

## Included

- Activepieces-inspired three-panel Studio layout.
- Searchable node catalog backed by `STUDIO_V2_FOUNDATION_NODES`.
- React Flow rendering of the canonical Manual → Source → HTTP → Condition fixture.
- Node selection and configuration inspection.
- Editable TypeScript Source panel.
- In-memory draft, test, staging, and deployment controls.
- Explicit optional/disconnected source-control state.
- Adapter-pending nodes remain visibly unavailable.

## Deliberate boundaries

This surface is not connected to a Remix route yet. It does not replace the current Studio and does not connect to persistence, runtime execution, credentials, or GitHub APIs. Keeping it isolated allows the interaction model and contract consumption to be reviewed before existing product routes depend on it.

## Next step

Add a dedicated preview route or component harness, then connect save and test operations through narrow Flowcordia service adapters. The current Studio route should remain unchanged until that vertical slice is proven.
