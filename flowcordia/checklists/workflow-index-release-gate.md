# Workflow index release gate

Release remains blocked until:

- migration applies cleanly to a representative database;
- discovery and presentation tests pass;
- the full monorepo typecheck and production webapp build pass;
- webapp unit and E2E checks pass;
- push and manual paths produce the same indexed commit;
- one valid and one invalid workflow are verified in Studio;
- runtime-isolation inspection passes;
- the exact PR head is recorded in the validation section.
