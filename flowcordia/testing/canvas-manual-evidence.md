# Canvas manual acceptance evidence

## Purpose

Repository tests prove deterministic canvas contracts, not real assistive-technology behavior, touch ergonomics, browser rendering, or production-build scale. This protected evidence gate preserves one complete human-run record for the exact Beta candidate without pretending GitHub Actions can operate NVDA, VoiceOver, real touch hardware, or a human browser accessibility tree.

Use the procedures in [`../runbooks/canvas-accessibility-acceptance.md`](../runbooks/canvas-accessibility-acceptance.md). The protected workflow validates and preserves the resulting bounded record only after the operator has completed those procedures.

## Required immutable references

The manual record must identify:

- the exact Flowcordia application commit under review;
- one dedicated reference repository and exact commit;
- three distinct immutable workflow IDs:
  - a five-node small workflow;
  - a production-shaped workflow with at least 70 nodes;
  - a 300-node stress workflow;
- exact node and edge counts;
- one named operator and UTC start/completion timestamps.

No workflow may be generated dynamically in the browser during evidence collection.

## Required assistive-technology matrix

Every fixed check must pass for:

1. NVDA with Chrome on Windows;
2. NVDA with Firefox on Windows;
3. VoiceOver with Safari on macOS.

The record preserves exact browser, operating-system, and assistive-technology versions. Each session uses the production-shaped workflow and must pass canvas-region discovery, workflow summary, node semantics, hidden connection-list comprehension, geometric keyboard navigation, edge creation, invalid-target rejection, announced feedback, zoom/pan/move behavior, and bounded live-status comprehension.

## Required viewport and input matrix

Every fixed check must pass at:

- 1280×720 desktop with keyboard and mouse/trackpad;
- 1024×768 landscape tablet with touch;
- 768×1024 portrait tablet with touch;
- 390×844 phone with touch.

The record includes device-pixel ratio and requires visible controls, usable targets, isolated empty-space pan and node drag, selected-node reveal, no page-level horizontal overflow, and preserved primary controls at 200% browser zoom.

Multi-touch pinch is deliberately outside the accepted boundary.

## Required large-graph measurements

Preserve production-build measurements for both the production-shaped and 300-node workflows:

- time until the canvas region and first node are focusable;
- Fit response time;
- Arrow-key p95 and maximum response;
- pointer-drag p95 and maximum response;
- peak browser memory;
- long tasks over 50 milliseconds;
- browser crash, freeze, lost-edit, and announcement-order outcomes.

The internal stop-ship bounds reject an initial-focus time above 15 seconds, Fit above 5 seconds, repeated Arrow or drag response above 2 seconds, peak memory above 2 GB, any crash or freeze, any lost edit, or unordered announcements. These are Beta acceptance limits for this fixed reference set, not public service objectives or unlimited-scale claims.

## Preparing the protected record

Create the JSON record outside the repository. It must use schema `0.1`, contain only the bounded fields enforced by `canvas-manual-acceptance.ts`, and confirm:

- `multiTouchPinchAdvertised` is `false`;
- `unlimitedGraphScaleAdvertised` is `false`;
- `virtualizationAdvertised` is `false`;
- `sensitiveDataRecorded` is `false`.

Encode the compact JSON as canonical base64. Dispatch **Flowcordia canvas manual acceptance** from the exact `main` candidate with:

- the base64 record;
- confirmation `PRESERVE-CANVAS-MANUAL-ACCEPTANCE`.

The workflow runs behind the existing `flowcordia-acceptance` protected environment, binds the record to its exact `main` commit and workflow run, validates the entire fixed matrix, computes a canonical SHA-256 digest, uploads one 90-day artifact, and deletes the submitted private record.

## Evidence boundary

The preserved artifact contains only candidate/reference identities, versions, fixed passed checks, measurements, bounded limitations, operator name, timestamps, workflow lineage, and the canonical digest.

It recursively rejects authorization, browser storage, cookies, credentials, database information, email addresses, headers, internal actor identity, outputs, passwords, payloads, private paths, provider responses, secrets, tokens, and URLs.

Screenshots or recordings may remain in protected operator storage as supplemental review material, but they are not accepted as a substitute for the structured evidence artifact and must not enter the public repository when they identify private infrastructure.

## Stop-ship

Do not classify the candidate as Beta when any required combination, viewport, check, graph measurement, exact version, immutable reference identity, operator identity, privacy confirmation, or limitation is missing or failed; when the record belongs to another application commit; or when its digest changes.
