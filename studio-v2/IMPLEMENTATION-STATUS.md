# Studio V2 implementation status

## Completed in the contract-foundation PR

- Flowcordia-owned adapter catalog for the fourteen imported core concepts.
- Existing Flowcordia operations reused for native nodes.
- Adapter-required nodes hidden until runtime or persistence adapters exist.
- TypeScript-only Source document and runtime-context contract.
- Opaque credential-reference validation with no serialized secret values.
- Local draft, test, staging, and deployment lifecycle.
- Optional disabled source-control provider proving Git independence.
- Canonical Manual -> Source -> HTTP -> Condition vertical-slice fixture.
- Unit tests for catalog drift, Source security, workflow shape, and lifecycle transitions.

## Not included yet

- React Studio V2 screen.
- Activepieces-derived component adaptation.
- Persistence service wiring.
- Node or full-workflow test execution wiring.
- Runtime execution adapter for Source, loop, math, text, date, or store.
- GitHub provider implementation.

These are deliberately deferred to focused follow-up pull requests so the canonical contract is reviewed before UI and runtime code depend on it.
