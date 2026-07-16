# Custom function catalog rollout

## Before enabling

1. Add `.flowcordia/functions.json` using `packages/flowcordia-workflow/schema/functions-0.1.json`.
2. Keep every referenced export in the connected repository and production branch. Paths must name supported source files outside `trigger/flowcordia`.
3. Export one object-input to object-output function using `FlowcordiaFunction<Input, Output>` or an equivalent compatible signature.
4. Confirm each input/output schema uses the supported bounded subset and contains no sensitive defaults or examples.
5. Synchronize the repository workflow index and open a workflow at the same observed commit.

## Validation

1. Confirm Studio reports the catalog path, exact short commit, and expected function count.
2. Start a draft and add one repository function.
3. Confirm the node has developer ownership, copied input/output schemas, and the expected code reference in the workflow diff.
4. Confirm Studio can move, rename, connect, and remove the workflow reference but cannot edit repository-owned implementation or configuration.
5. Run the structural preview and confirm it validates input, generates a schema-shaped output, and does not import customer code.
6. Publish the proposal and confirm generated source contains one static import, a compile-time function contract assertion, and a bounded handler wrapper.
7. Confirm the proposal preview build typechecks the imported function and discovers the generated task under `trigger/flowcordia`.
8. Start a version-locked live preview with valid input and confirm repository code executes and produces schema-valid output.
9. Submit invalid input and use a fixture returning invalid output; confirm both fail at the function boundary and downstream nodes do not run.
10. Remove the function node in a new draft and confirm only the workflow reference and connected edges change; repository code remains untouched.
11. Change or remove the manifest on the production branch and confirm an older draft cannot silently resolve the new definition.
12. Inspect loader and action payloads; executable source, raw schema values, installation identity, and raw GitHub failures must be absent.

## Automated reference repository

`packages/flowcordia-runtime/test/fixtures/reference-repository` provides a committed contract fixture. The runtime suite reads its manifest and workflow, adds and wires the function, runs structural preview, compares generated task source byte-for-byte, executes the real typed function through the live adapter, validates output, and removes the workflow reference.

This fixture proves the portable product path in CI. It does not replace the authenticated browser and connected Trigger.dev preview smoke test described above.

## Rollback

Remove or rename `.flowcordia/functions.json` in a reviewed repository change. Studio will keep built-in nodes available and stop offering new custom functions. Existing workflow nodes remain intact as developer-owned `code.task` boundaries and continue compiling from their reviewed code references. Revert the Flowcordia application PR only if the catalog reader or mutation path itself must be removed.
