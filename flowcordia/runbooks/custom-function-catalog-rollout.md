# Custom function catalog rollout

## Before enabling

1. Add `.flowcordia/functions.json` using `packages/flowcordia-workflow/schema/functions-0.1.json`.
2. Keep every referenced export in the connected repository and production branch.
3. Confirm each input/output schema has an object root and contains no sensitive defaults or examples.
4. Synchronize the repository workflow index and open a workflow at the same observed commit.

## Validation

1. Confirm Studio reports the catalog path, exact short commit, and expected function count.
2. Start a draft and add one repository function.
3. Confirm the node has developer ownership, copied input/output schemas, and the expected code reference in the workflow diff.
4. Confirm Studio can move and rename the node but cannot edit its configuration or delete it.
5. Run the safe preview and confirm it simulates the code boundary without importing customer code.
6. Publish the proposal and confirm generated source contains one static import from the declared path.
7. Change or remove the manifest on the production branch and confirm an older draft cannot silently resolve the new definition.
8. Inspect loader and action payloads; executable source, raw schema values, installation identity, and raw GitHub failures must be absent.

## Rollback

Remove or rename `.flowcordia/functions.json` in a reviewed repository change. Studio will keep built-in nodes available and stop offering new custom functions. Existing workflow nodes remain intact as developer-owned `code.task` boundaries and continue compiling from their reviewed code references. Revert the Flowcordia application PR only if the catalog reader or mutation path itself must be removed.
