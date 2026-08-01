# Activepieces UI boundary

Flowcordia Studio V2 renders the pinned Activepieces `BuilderPage` as its workflow-building UI.

## Allowed Flowcordia code in the Studio frontend package

- bootstrap and same-origin iframe messaging;
- Activepieces-to-Flowcordia workflow conversion;
- persistence, permission, authentication-session, flag, and API adapters;
- backend-facing piece metadata adapters where Activepieces normally calls its own server.

## Not allowed

- Flowcordia-built replacements for Activepieces builder components;
- custom canvas, node picker, step inspector, builder header, sidebars, dialogs, menus, or controls;
- custom styling intended to make a Flowcordia component look like Activepieces;
- a Flowcordia-built whole-workflow code editor.

When a required UI capability is missing, leave the capability unimplemented until an Activepieces
component is supplied or deliberately adopted. Keep the backend adapter seam ready for that future
component rather than creating a visual substitute.
