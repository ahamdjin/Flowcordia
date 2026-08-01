# Activepieces UI boundary

Flowcordia Studio V2 renders the pinned Activepieces `BuilderPage` as its workflow-building UI.

## Allowed Flowcordia code in the Studio frontend package

- bootstrap and same-origin iframe messaging;
- Activepieces-to-Flowcordia workflow conversion;
- persistence, permission, authentication-session, flag-data, and API adapters;
- backend-facing piece metadata/data adapters where Activepieces normally calls its own server.

These adapters may provide data to Activepieces, but they must not replace an Activepieces frontend
service, hook, store, component, dependency, or visual behavior when that implementation already
exists in the vendored source.

## Required upstream-first rule

If the pinned source already contains the implementation, use it directly. This includes the
Activepieces builder UI, i18n initialization, flags hooks, pieces API service, builder chat state,
query client, pieces framework, and the real third-party dependencies required by those modules.

A Flowcordia replacement is allowed only at a server/application boundary that Activepieces would
normally satisfy through its own backend, authentication lifecycle, or persistence service.

## Not allowed

- Flowcordia-built replacements for Activepieces builder components;
- custom canvas, node picker, step inspector, builder header, sidebars, dialogs, menus, or controls;
- custom styling intended to make a Flowcordia component look like Activepieces;
- custom replacements for vendored Activepieces hooks, state stores, API services, i18n, or client utilities;
- fake replacements for dependencies already required by the pinned Activepieces frontend;
- a Flowcordia-built whole-workflow code editor.

When a required UI capability is missing, leave the capability unimplemented until an Activepieces
component is supplied or deliberately adopted. When a required server capability is missing, keep
that absence explicit behind the backend adapter rather than recreating the Activepieces frontend.
