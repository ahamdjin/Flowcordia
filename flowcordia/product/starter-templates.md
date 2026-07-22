# Governed starter templates

Flowcordia starter templates accelerate the first useful workflow without bypassing the canonical workflow, compiler, GitHub proposal, preview, review, or promotion boundaries.

## Delivered templates

| Template | Initial graph | Intended first use |
| --- | --- | --- |
| Manual workflow | Manual trigger → Output | Inspect the governed lifecycle with the smallest executable workflow. |
| Authenticated API | API trigger → Map data → Output | Receive project-token requests and normalize them through the deterministic mapper. |
| Scheduled durable wait | Schedule → Wait → Output | Exercise production-only scheduling and the inherited durable-wait primitive. |

## Completion boundary

Every published template must:

1. use only the approved first-party node catalog;
2. satisfy the canonical workflow schema and operation-specific validation;
3. compile deterministically to one Trigger.dev task before proposal creation;
4. contain no credential value, repository identity, installation identity, or environment value;
5. create only a governed draft pull request against the exact observed production commit;
6. remain subject to preview, validation, review, promotion, production, and rollback evidence.

## Browser and server ownership

The browser may select only a versioned template ID plus the public workflow ID, name, description, and existing destructive acknowledgement. The server re-resolves the project, repository, installation, production branch, exact commit, target paths, workflow contract, compiler result, proposal identity, and preview environment before mutation.

Changing the selected template resets the suggested public workflow details and the acknowledgement. A template selection never installs credentials, enables a schedule, merges a pull request, deploys a task, or executes a run.

## Validation evidence

The template registry, browser command contract, canonical validator, deterministic compiler, overwrite protection, and repository-identity boundary are tested together. Passing these tests proves the proposal inputs are safe and deterministic; it does not replace connected preview, production, or rollback acceptance.

## Adding templates

A new template requires a stable template ID, product description, deterministic graph, compiler regression test, browser projection, documentation, and connected acceptance coverage for any capability it introduces. Templates are not a substitute for a signed third-party node catalog.
