# Studio source-editing test matrix

## Contract and identity

| Case | Expected proof |
| --- | --- |
| safe JavaScript or TypeScript path | accepted and deterministically ordered |
| traversal, control, workflow, or generated path | rejected before GitHub access |
| unsupported extension or unknown property | rejected |
| malformed object ID | rejected |
| per-file, file-count, or aggregate size overflow | rejected |
| source patch order changes | identical canonical digest |
| source text or expected blob changes | different digest |
| workflow or source identity changes | different bounded proposal ID |
| supplied digest differs from patches | rejected before durable intent |

## Exact source open

| Case | Expected proof |
| --- | --- |
| valid typed-function node | exact catalog and source read at draft base commit |
| non-function or visual-owned node | rejected |
| missing function ID | rejected |
| catalog function missing | rejected |
| node path or export differs from catalog | rejected |
| source commit differs from workflow draft | rejected |
| missing, binary, invalid UTF-8, oversized source | rejected |
| shared file with multiple exports | one durable buffer keyed by exact path |

## Durable source buffer

| Case | Expected proof |
| --- | --- |
| first open | exact base text/blob/commit/hash stored at version 1 |
| reopen same draft and path | same buffer resumed |
| same path with different immutable base | stale-source failure |
| source row hash mismatch | corrupt-draft failure |
| edit with current version | source/hash/version updated atomically |
| edit with stale version | conflict and no update |
| reset | exact stored base text restored |
| literal source text `RESET` | stored as normal source, never treated as control input |
| audit payload | hashes and identity only; no source text |
| browser loader DTO | metadata only; no source or internal IDs |

## Publication

| Case | Expected proof |
| --- | --- |
| workflow-only change | canonical proposal path unchanged |
| source-only change | exact workflow base/version/compilation still proven |
| combined change | one proposal contains intent, generated task, and source patch |
| no workflow or source changes | rejected |
| deterministic compilation failure | rejected before GitHub mutation |
| reviewed source omitted, duplicated, stale, or hash-mismatched | rejected before durable proposal intent |
| source changes after exact proposal creation | remains separate draft state and produces a different proposal identity |
| absent or stale base blob | source write fails closed |
| ambiguous source write | exact-content reread before resume |
| partial multi-file write | proven files skipped; remaining files resume |
| final source mismatch | proposal creation fails |
| pull-request head advances during verification | retryable conflict |
| final stable head | exact proposal receipt persisted |

## Browser behavior

| Case | Expected proof |
| --- | --- |
| read-only user | can inspect workflow but cannot open or edit source |
| writable user | can open only referenced typed-function source |
| browser reload | durable buffer and changed metadata resume |
| unsaved editor text | publish disabled and text never sent to GitHub |
| saved source buffer | changed count and hash state update |
| reset source | changed state clears |
| stale workflow or repository | editor and publish disabled |
| ordinary command over 256 KiB | rejected |
| source-edit JSON envelope up to 640 KiB | accepted only if actual source remains within 256 KiB |
| proposal success | proposal ID and source-file count shown without source content |

## Preview and execution

| Case | Expected proof |
| --- | --- |
| Structural Preview after source edit | edited source is not imported or executed |
| Live Preview before deployment | unavailable |
| deployment not matching proposal head | unavailable or conflict |
| exact ready deployment | live run uses version-locked task |
| function input invalid | rejected before repository code |
| function output invalid | rejected before downstream nodes |
| valid edited function | real deployed output reaches bounded Studio state |

## Repository gates

The final head must pass:

- repository formatting and lint;
- root TypeScript and package exports;
- all package unit-test shards;
- all internal and migration-aware test shards;
- all webapp unit-test shards;
- Prisma schema and migration validation;
- production webapp build;
- webapp E2E;
- reference-repository combined proposal build;
- authenticated connected-repository rollout checks from the runbook.

A green unit matrix without the connected browser-to-preview-to-live proof is not sufficient to claim production rollout complete.
