# Flowcordia Studio on Activepieces

This package builds the vendored Activepieces frontend pinned at commit
`d1b800f3db6db52379476c069ea3cdbd2c998276`.

## UI ownership

The Studio UI is Activepieces-owned.

Flowcordia renders Activepieces' upstream `BuilderPage` and keeps its builder header, canvas,
canvas controls, piece selector, step-settings UI, data selector, sidebars, dialogs, menus,
shortcuts, and other builder interactions intact. Flowcordia must not recreate, imitate, restyle,
or replace those visual components.

If a future Studio experience is not available in the pinned Activepieces builder, it must remain
unimplemented until the corresponding Activepieces UI/component is provided or intentionally
adopted. In particular, the previous Flowcordia-built whole-workflow Code view has been removed;
the architecture can add a supplied editor later without inventing one here.

## Flowcordia adapter boundary

Flowcordia remains authoritative behind the UI for:

- authentication and project/environment membership;
- read/write permission decisions;
- the canonical workflow document and optimistic workspace version;
- credentials and secret values;
- structural testing and immutable staging;
- Trigger.dev deployment;
- optional GitHub push and pull.

The Activepieces flow tree is a UI representation. A reversible adapter converts it to and from
Flowcordia's canonical nodes-and-edges contract. A private sidecar in the Activepieces draft
preserves Flowcordia node positions, edge identities, output branches, metadata, and unsupported
fields. Unsupported graph shapes fail atomically rather than being partially rewritten.

The frontend runs in a same-origin iframe because the vendored Activepieces application uses its
own React runtime. The parent Remix route supplies the authorized workflow and `readonly` state;
every accepted Activepieces flow operation is converted back to the Flowcordia contract and saved
through the existing authenticated Studio action.

Only non-visual adapters may replace Activepieces backend dependencies. They must feed the upstream
builder UI rather than replace that UI.
