# Governed repository source patch test matrix

| Area | Required proof |
| --- | --- |
| input shape | array-only contract, exact object properties, deterministic ordering |
| path safety | traversal, absolute paths, backslashes, empty segments, dot segments, protected path families, unsupported extensions |
| identity | valid 40/64-character object IDs, `null` only for absent files, stale blob conflict, unexpected existing-file conflict |
| bounds | maximum file count, per-file bytes, aggregate bytes, path length |
| content | UTF-8 round trip, empty files, control-character rejection, malformed UTF-8 rejection, byte-length mismatch |
| duplicate handling | exact duplicate and case-colliding paths fail before mutation |
| exact reads | requested revision resolves to a validated commit and file blob |
| optimistic writes | provider write receives the exact branch and expected blob |
| no-change behavior | exact target content returns success without another commit |
| ambiguous mutation | exact reread recovers; missing or different content remains an error |
| partial resume | completed files are recognized; remaining files continue in sorted order |
| proposal composition | workflow, generated artifact, and source patches share one deterministic proposal branch |
| pull-request identity | base branch, head branch, open state, and non-merged state are rechecked |
| final-head proof | every requested file is reread at the final pull-request head and must match exact target content |
| redaction | source text, provider error details, tokens, installation identity, and raw responses are absent from errors/audit |
| compatibility | an omitted patch set behaves exactly like the established workflow-only proposal path |
| build gates | package typecheck, exports, unit shards, webapp shards, production build, and E2E remain green |

## Acceptance rule

The primitive is ready only when the final pull-request head passes the complete repository CI matrix and the controlled connected-repository rollout proves both the normal path and stale, partial, ambiguous, and concurrent-mutation failure paths. A mocked package test alone is not sufficient evidence for production rollout.
