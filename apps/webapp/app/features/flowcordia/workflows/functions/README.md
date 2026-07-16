# Repository function catalog

This boundary reads `.flowcordia/functions.json` from the exact Git commit that owns the selected workflow. The manifest declares typed, repository-owned functions that Studio may add as developer-owned code nodes.

## Rules

- The GitHub App installation reads the manifest; browsers never choose repository coordinates.
- Catalog definitions are strict, size-bounded, traversal-free, and tied to an exact commit SHA.
- Browser projection exposes names, code locations, and schema field names, not executable source or schema values.
- Draft mutations send only a function ID. The server resolves the full definition again at the draft base commit before changing the workflow.
- Studio cannot edit repository-owned implementation or configuration. It may move, rename, connect, or remove the workflow reference through the normal reviewed proposal path.
- The runtime validates function input and output against the supported schema subset before and after repository code executes.
