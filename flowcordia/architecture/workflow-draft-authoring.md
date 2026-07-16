# Durable Studio workflow drafts

## Purpose

This slice turns the repository-backed Studio canvas into a safe authoring surface without turning every pointer movement into a Git commit. A user starts from one proven indexed workflow, edits a durable Flowcordia draft, and keeps GitHub unchanged until a later governed-proposal boundary.

It does not create branches, commits, pull requests, compiler artifacts, deployments, runs, or runtime state.

## Connection

```text
exact indexed workflow identity
  -> authorized Start editing command
  -> exact GitHub reread + canonical digest proof
  -> flowcordia.workflow_draft ACTIVE row
  -> deterministic @flowcordia/workflow edit command
  -> canonical validation
  -> optimistic version update + secret-free audit
  -> browser-safe graph projection
  -> drag/add/rename/connect/remove UI
```

## Ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| workflow editor contract | deterministic templates, IDs, edit application, validation | database, GitHub credentials, runtime adapters |
| draft repository | scoped persistence, integrity hash, version conflict, discard, audit | source reads, UI authorization, Git writes |
| draft service | exact indexed source proof, stale-base detection, edit orchestration | browser scope identity, proposal promotion |
| draft command resource | bounded command parsing and minimal response | raw document replacement, tenant/repository selection |
| Studio UI | authoring intent and public optimistic version | configuration values, credentials, internal IDs, Git mutation |

## Durable model

`flowcordia.workflow_draft` stores one shared active draft per project, repository, and workflow. It binds the draft to the same organization, project, GitHub App installation, repository, and production branch identity used by the workflow index.

The row records:

- public draft UUID and internal storage ID;
- workflow ID and path;
- exact base commit, blob, and canonical workflow hash;
- validated canonical document JSON and its SHA-256;
- optimistic bigint version;
- creator/updater/discard actor identity and timestamps;
- active or discarded lifecycle state.

`flowcordia.workflow_draft_audit_event` stores append-only command summaries, versions, public identity, hashes, and correlation IDs. It never stores the full document or configuration values.

## Concurrency and source drift

Every edit carries the exact expected draft version. A successful transaction increments it. A mismatched version returns a conflict and the UI reloads durable truth instead of replaying against an unknown document.

The draft base remains immutable. If the workflow index moves to another commit, blob, path, or canonical hash, the draft becomes inspectable but not editable. The user must discard it and explicitly start from the newest repository source. Silent rebasing belongs in neither this PR nor the browser.

## Product boundary

This PR supports:

- start or resume one durable draft;
- edit workflow name, description, and labels;
- add manual, schedule, webhook, HTTP, condition, wait, code, and output nodes;
- move, rename, and remove nodes;
- create and remove edges;
- discard a draft;
- validate every resulting canonical workflow.

Configuration-value editing, credentials, undo history, collaboration presence, draft-to-proposal publication, typed code generation, compilation, deployment, and live execution remain later boundaries.
