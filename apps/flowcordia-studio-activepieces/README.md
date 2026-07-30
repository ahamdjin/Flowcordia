# Flowcordia Studio on Activepieces

This package builds the actual vendored Activepieces frontend pinned at commit
`d1b800f3db6db52379476c069ea3cdbd2c998276`.

It does **not** recreate an Activepieces-looking canvas. The Flowcordia host imports the real
Activepieces builder state, flow canvas, CodeMirror Source editor, node selection behavior, and
flow-operation reducer from `studio-v2/activepieces-web`.

Flowcordia remains authoritative for:

- authentication and project/environment membership;
- read/write permission decisions;
- the canonical workflow document and optimistic workspace version;
- credentials and secret values;
- structural testing and immutable staging;
- Trigger.dev deployment;
- optional GitHub push and pull.

## Adapter boundary

The Activepieces flow tree is a UI representation. A reversible adapter converts it to and from
Flowcordia’s canonical nodes-and-edges contract. A private sidecar in the Activepieces draft
preserves Flowcordia node positions, edge identities, output branches, metadata, and unsupported
fields. Unsupported graph shapes fail atomically rather than being partially rewritten.

The frontend runs in a same-origin iframe because the vendored Activepieces application uses its
own React runtime. The parent Remix route supplies the authorized workflow and `readonly` state;
every accepted Activepieces operation is converted back to the Flowcordia contract and saved
through the existing authenticated Studio action.
