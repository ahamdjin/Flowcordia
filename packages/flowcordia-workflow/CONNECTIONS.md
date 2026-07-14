# Workflow contract connections

Every boundary validates untrusted input before using it. Secrets remain references in workflow documents and are resolved only by an authorized runtime adapter.

| Producer | Consumer | Exchanged data | Why this connection exists | Failure owner |
| --- | --- | --- | --- | --- |
| Flowcordia Studio | `@flowcordia/workflow` | In-memory workflow draft | Prevent the canvas from saving a graph the compiler cannot understand. | Studio displays contract diagnostics against the affected node or edge. |
| `@flowcordia/workflow` | GitHub adapter | Canonical JSON text | Create stable, reviewable diffs and deterministic content hashes. | GitHub adapter blocks the write and returns validation or conflict details. |
| GitHub adapter | `@flowcordia/workflow` | Repository JSON at a commit SHA | Treat repository content as untrusted and bind validation to the reviewed version. | GitHub adapter reports the path, commit, and contract issues. |
| `@flowcordia/workflow` | Trigger.dev compiler adapter | Validated workflow definition | Compile visual intent into deterministic executable task artifacts. | Compiler adapter reports capability or compilation diagnostics separately from schema errors. |
| Persisted workflow store | Migration registry | Versioned JSON document | Upgrade old documents without silently guessing their meaning. | Migration registry stops on a missing, cyclic, or invalid step. |
| Runtime adapter | Credential store | Credential reference plus tenant/environment context | Resolve secrets at execution time without storing values in Git or workflow JSON. | Runtime adapter records a redacted operational error. |
| Runtime event stream | Studio | Workflow, node, edge, run, and deployment identifiers | Map live progress and diagnostics back to the correct canvas elements. | Observability adapter preserves unmatched events for investigation. |

## Required adapter sequence

1. Read a workflow document and its source revision.
2. Run registered migrations when the document is older than the current schema.
3. Validate the migrated workflow.
4. For edits, validate identity against the previous accepted revision.
5. Serialize canonically before hashing, committing, or compiling.
6. Pass only the validated model to the next component.

Adapters may add transport metadata, authorization context, and diagnostics outside the document. They must not add undeclared properties to the workflow itself.
