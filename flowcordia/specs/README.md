# Flowcordia specifications

This directory is the repository-level discovery point for Flowcordia's portable contracts.

The maintained workflow implementation lives in `packages/flowcordia-workflow`:

- TypeScript contract and runtime validation: `packages/flowcordia-workflow/src/`
- Canonical versioned JSON Schema: `packages/flowcordia-workflow/schema/0.1.json`
- Valid integration examples: `packages/flowcordia-workflow/examples/`
- Adapter boundaries: `packages/flowcordia-workflow/CONNECTIONS.md`

`workflow.schema.json` remains a compatibility copy for architecture links introduced with the enterprise foundation. When the `0.1` schema changes, update both files in the same pull request and keep them byte-for-byte identical. New consumers should use the package's versioned schema path.
