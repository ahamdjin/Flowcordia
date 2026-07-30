# Activepieces Core Node Foundations

This directory contains a deliberately small subset of the Activepieces
monorepo at commit `d1b800f3db6db52379476c069ea3cdbd2c998276`.
The upstream package directories are copied without modification.

## Selected nodes

| Flowcordia concept | Activepieces source |
| --- | --- |
| HTTP request | `packages/pieces/core/http/` |
| Calculate / math | `packages/pieces/core/math-helper/` |
| Code | `packages/core/execution/src/lib/flows/actions/action.ts` |
| If / branch | `packages/core/execution/src/lib/flows/actions/action.ts` |
| Loop over items | `packages/core/execution/src/lib/flows/actions/action.ts` |
| Manual trigger | `packages/pieces/core/manual-trigger/` |
| Webhook trigger | `packages/pieces/core/webhook/` |
| Schedule trigger | `packages/pieces/core/schedule/` |
| Delay / wait | `packages/pieces/core/delay/` |
| Data mapper | `packages/pieces/core/data-mapper/` |
| Text helper | `packages/pieces/core/text-helper/` |
| Date helper | `packages/pieces/core/date-helper/` |
| Store | `packages/pieces/core/store/` |
| Subflow | `packages/pieces/core/subflows/` |

The matching Code, Branch, and Loop editor views are already preserved in
`../activepieces-web/src/app/builder/step-settings/`.

Their upstream execution behavior and focused tests are preserved under
`packages/server/engine/`:

- `src/lib/handler/code-executor.ts`
- `src/lib/handler/loop-executor.ts`
- `src/lib/handler/router-executor.ts`
- `src/lib/core/code/`
- `test/handler/`

## Supporting packages

- `packages/pieces/framework/`
- `packages/pieces/common/`
- `packages/core/piece-types/`
- `packages/core/utils/`
- `packages/core/execution/`

These packages preserve the action contracts, property definitions, HTTP
client, validation schemas, flow structure operations, and previous-step data
types needed when adapting the selected nodes.

This is reference source, not a registered Flowcordia node catalog. Flowcordia
adapters must map these contracts to Flowcordia credentials, variables,
previous-step input, testing, persistence, and runtime execution before the
nodes can be enabled in the product. The selected engine files intentionally
preserve behavior for study and adaptation; they are not a standalone copy of
the complete Activepieces engine package.
