# Studio node catalog discovery

## Purpose

Studio exposes the exact first-party node catalog through a searchable capability picker rather than requiring users to scan one undifferentiated dropdown.

## Discovery contract

Search is deterministic and side-effect free. It matches the versioned catalog's public metadata:

- template label and description;
- catalog template ID and runtime operation;
- category and release stage;
- declared delivered capabilities.

Technical identifiers are normalized for human search, so a query such as `production binding` matches the `production_binding` capability. Results preserve canonical catalog order rather than relevance scores that could change node identity between renders.

Category and release-stage filters compose exactly. Approved and limited nodes remain visibly distinct; filtering never upgrades a limited node or hides its current release stage.

## Selection behavior

The current template remains selected while it is visible. When a filter removes it, Studio moves deterministically to the first visible catalog result. An empty result set disables node creation and presents a bounded recovery message.

The browser submits only the selected versioned template ID through the existing `add_node` command. Server-owned draft editing still resolves the template from the canonical catalog and validates the resulting workflow. The picker performs no repository, credential, network, environment, or runtime operation.

## Evidence

Focused tests cover metadata and capability search, category/stage composition, stable selection, empty results, source ownership, and continued use of the server-owned add-node command. Full repository CI remains required because the picker is composed into the authenticated Studio surface.
