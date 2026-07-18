# Governed Studio source editing

## Purpose

Flowcordia Studio can edit the JavaScript or TypeScript file behind a repository-owned typed-function node without turning the browser into an arbitrary repository client or the webapp process into a customer-code runtime.

The workflow draft and source buffers are durable but remain separate:

```text
exact indexed workflow
  -> durable workflow draft at exact commit/blob/digest
  -> typed-function node selected from the exact function catalog
  -> exact source file read at the draft base commit
  -> durable source buffer with exact base commit/blob/text/hash
  -> optimistic source edits or exact-base reset
  -> deterministic workflow compilation and source-patch identity
  -> one governed proposal branch and draft pull request
  -> preview deployment for the exact proposal head
  -> live run only from the exact deployed proposal version
```

## Repository selection boundary

Studio does not browse arbitrary repository paths. A source buffer can begin only when all of these identities agree at the workflow draft's exact base commit:

- the selected workflow node is a developer-owned `code.task` node;
- the node carries a repository function ID;
- `.flowcordia/functions.json` contains that exact function ID;
- the node and catalog agree on source path and export name;
- the installation-scoped source reader proves the exact commit and blob;
- the source path passes the governed JavaScript and TypeScript path contract.

A repository file shared by multiple exports has one buffer per draft and path. The visual function nodes remain distinct, while the reviewed file change remains singular.

## Durable source buffer

`flowcordia.workflow_draft_source_file` stores:

- one public UUID and one internal row ID;
- the parent workflow draft;
- function, path, and export identity;
- exact base commit and blob IDs;
- immutable bounded base source text and SHA-256;
- current bounded source text and SHA-256;
- optimistic version and actor timestamps.

Base source text is retained because reset must restore exact reviewed bytes rather than refetching a branch that may have moved. The source row is deleted with its parent draft according to the existing draft-retention model.

Every read recomputes both source hashes. Corruption fails closed. Every edit or reset requires the exact current version. Concurrent sessions receive a conflict and must reload durable truth.

## Audit boundary

Source audit events contain only identity, path, versions, hashes, timestamps, and changed state. They never contain:

- source text;
- repository credentials;
- installation tokens;
- full workflow documents;
- browser payloads;
- provider error bodies.

The browser workspace projection also excludes source text. Source text is returned only by the explicit, authorized `start_source` command for one exact catalog-bound file.

## Publication identity

Changed source buffers are validated again through the shared governed source-patch contract and sorted by path. The source digest covers, for every patch:

- path;
- expected base blob ID;
- SHA-256 of complete source text.

The source-aware proposal ID is a SHA-256 over:

- workflow draft public ID;
- workflow draft version;
- exact workflow document SHA-256;
- complete source-patch digest.

This keeps the proposal ID under GitHub's bounded naming limit while preventing different workflow or source content from reusing one durable proposal identity.

Before durable proposal intent is stored, the command service recomputes the source digest independently. After GitHub publication succeeds, Studio rereads the durable source bundle and requires the same digest before returning success.

## Preview and execution

Structural Preview does not import or execute source buffers. It continues to use reviewed function contracts and repository-owned fixtures.

Live Preview remains available only after the combined proposal is built and deployed. The run path remains bound to the exact proposal head and deployed worker version. Unsaved browser text and unreviewed durable source buffers never enter live execution.

## Deliberate limits

This slice does not add:

- arbitrary repository browsing;
- unrelated file creation;
- package or lockfile editing;
- executable developer test runners;
- webapp execution of unreviewed code;
- automatic pull-request merge;
- a second build or deployment system.
